/**
 * 「手持ちのライブボーナスが尽きるまで回すと何回まわせるか」。
 *
 * ── なぜ単純な割り算にならないか ───────────────────────────────
 * 回している間にも自然回復が進む。回復したぶんでまた回せるので、
 * `所持 ÷ 焚き数` では足りない。回復ぶんの周回がさらに時間を生み、
 * その時間でまた回復する ── という追いかけっこになるので、素直に
 * 1プレイずつ進めて数える。
 *
 * ── 効く規則（すべて Nori 申告 2026-08-12）─────────────────────
 * 1. **残りが焚き数を下回ると止まる。** 5焚きで回していて残り2になっても、
 *    2焚きで回してはくれない。端数は使い切れずに残る
 * 2. **自然回復は所持上限まで。** 上限は既定 25、カラフルパス DELUXE /
 *    PRECIOUS で 50。上限に達している間は回復が進まない
 * 3. **オートは1日の回数に上限がある。** 通常 10、PRECIOUS で 99。
 *    ライボが余っていてもここで止まる（リセットは毎日 4:00）
 */

import { CRYSTALS_PER_LB } from "../../worktime/lib/worktime";

/** 自然回復の間隔（分）。 */
export const LB_REGEN_MIN = 30;

/** カラフルパスの course。ライボ上限とオート回数がこれで決まる。 */
export type PassCourse = "none" | "deluxe" | "precious";

export interface PassLimits {
  /** ライブボーナスの所持上限。自然回復もここで頭打ちになる。 */
  lbCap: number;
  /** オートライブの1日の回数上限。 */
  autoPlays: number;
}

/**
 * ★ ここが上限の正本。**増えるものがコースごとに違う。**
 *
 *   BASIC    … 上限も回数も解放されない（＝未加入と同じ。だから none にまとめてある）
 *   DELUXE   … ライボ上限だけ 50。オートは10回のまま
 *   PRECIOUS … ライボ上限 50 ＋ オート99回
 *
 *   「パスを買えば全部増える」と思い込むと、BASIC や DELUXE の人に
 *   99回前提の計画を出してしまう。
 */
export const PASS_LIMITS: Record<PassCourse, PassLimits> = {
  none: { lbCap: 25, autoPlays: 10 },
  deluxe: { lbCap: 50, autoPlays: 10 },
  precious: { lbCap: 50, autoPlays: 99 },
};

export const PASS_LABEL: Record<PassCourse, string> = {
  // BASIC は解放が何も無いので、未加入と同じ枠に入れて選ばせる。
  none: "なし／BASIC",
  deluxe: "DELUXE",
  precious: "PRECIOUS",
};

export interface LbRunInput {
  /** いま持っているライブボーナス。 */
  startLB: number;
  /** 1プレイの焚き数。0 なら消費しないので「尽きる」ことがない。 */
  taki: number;
  /** 1プレイの所要秒（曲長＋ロス）。 */
  cycleSec: number;
  /** 自然回復を数えるか。切ると単純な `所持 ÷ 焚き数` になる。 */
  regen: boolean;
  /** 自然回復の頭打ち（＝ライボの所持上限）。 */
  lbCap: number;
  /** 回数の上限（オートの1日の回数）。省略すると無制限。 */
  maxPlays?: number;
  /**
   * 使える時間（秒）。省略すると時間では止まらない。
   *
   * ★ オートは放置なので普段は時間がコストにならないが、**オートの回数は毎日4:00に
   *   消える**（上の規則3）。「4:00まであと2時間」のような締切のある窓では、
   *   1回あたりの効率ではなく**その窓に何回詰め込めるか**が効く。
   */
  windowSec?: number;
}

export interface LbRunResult {
  /** 回せる回数。 */
  plays: number;
  /** 所要秒。 */
  seconds: number;
  /** そのあいだに自然回復したライブボーナス。 */
  regained: number;
  /** 使い切れずに残るライブボーナス（焚き数に足りないぶん）。 */
  leftover: number;
  /**
   * 何で止まったか。**次に効く手がまるで違うので、必ず添えて出すこと。**
   *   lb    … ライボ切れ    → 焚き数を下げる／注ぎ足す
   *   plays … 回数上限      → 焚き数を上げる（1回を濃くする）
   *   time  … 時間切れ      → 短い曲に替える
   */
  stoppedBy: "lb" | "plays" | "time" | "none";
}

/** 0焚き・回数無制限で無限ループにしないための安全弁。 */
const HARD_LIMIT = 100_000;

export function playsUntilEmpty({
  startLB,
  taki,
  cycleSec,
  regen,
  lbCap,
  maxPlays,
  windowSec,
}: LbRunInput): LbRunResult {
  const idle: LbRunResult = {
    plays: 0,
    seconds: 0,
    regained: 0,
    leftover: Math.max(0, startLB),
    stoppedBy: "none",
  };
  if (!(cycleSec > 0)) return idle;
  /**
   * ★ 0焚きは「0回」ではない。**ライボを消費しないので尽きようがなく、
   *   時間か回数だけが制約**になる。以前はここで 0 を返していたため、
   *   0焚き運用（時間だけが効く典型）が丸ごと計算できなかった。
   */
  const free = taki <= 0;
  if (taki < 0) return idle;
  // 消費するのに手持ちが無いなら1回も回せない。
  if (!free && !(startLB > 0)) return idle;
  // 消費もせず、時間も回数も区切られていないなら止まる理由が無い。数えない。
  if (free && maxPlays == null && windowSec == null) return idle;

  const limit = Math.min(maxPlays ?? HARD_LIMIT, HARD_LIMIT);
  // ★ 0 を「無制限」にしない。入力欄を空にしたら 0 回であるべきで、
  //   時間の縛りが消えて全曲が回りきる方が事故（未指定は undefined で表す）。
  const budget = windowSec != null ? Math.max(0, windowSec) : Infinity;
  let lb = startLB;
  let seconds = 0;
  let plays = 0;
  let regained = 0;
  /** 回復の端数。1に満たないぶんを持ち越す。 */
  let carry = 0;
  const secPerLB = LB_REGEN_MIN * 60;

  // 途中で終わる1回は数えない（回しきれないので）。
  while ((free || lb >= taki) && plays < limit && seconds + cycleSec <= budget) {
    if (!free) lb -= taki;
    plays += 1;
    seconds += cycleSec;

    if (!regen) continue;
    // 上限に達している間は回復しない。端数も持ち越さない（タイマーが進まないため）。
    if (lb >= lbCap) {
      carry = 0;
      continue;
    }
    carry += cycleSec / secPerLB;
    const gained = Math.floor(carry);
    if (gained > 0) {
      carry -= gained;
      const add = Math.min(gained, Math.max(0, lbCap - lb));
      lb += add;
      regained += add;
    }
  }

  /**
   * 止まった理由。**複数の制約が同時に効いていることがある**ので、
   * 先に当たったものを返す（時間 → 回数 → ライボの順で見る）。
   */
  function stopReason(): LbRunResult["stoppedBy"] {
    /**
     * ★ 複数が同時に成立していることがある。返すのは「先に当たったもの」ではなく
     *   **いちばん硬い制約**＝それを外さない限り、他を何とかしても1回も増えないもの。
     *
     *   回数上限 … 石でもライボでも時間でも増やせない。**いちばん硬い**
     *   ライボ   … 石やドリンクで足せる（時間では実質増えない）
     *   時間     … 短い曲に替えれば詰められる
     *
     * ★ 硬い順に見るのが肝。逆順にすると実害が出る:
     *   - 時間を先に見る → ライボ切れなのに「短い曲に替えろ」と促す
     *   - ライボを先に見る → **回数上限と同時に尽きたときに「石で注ぎ足せ」と促し、
     *     石を割っても1回も増えない**（既定のライボ25・5焚き・残り5回でそのまま起きる）
     */
    const outOfPlays = plays >= limit;
    const outOfLb = !free && lb < taki;
    const outOfTime = seconds + cycleSec > budget;
    if (outOfPlays) return "plays";
    if (outOfLb) return "lb";
    if (outOfTime) return "time";
    return "none";
  }

  return {
    plays,
    seconds,
    regained,
    leftover: lb,
    // ★ ライボが残っているのに止まったなら回数上限。次に効く手が違う
    //   （回数上限なら焚き数を上げる、ライボ切れなら下げる）。
    stoppedBy: stopReason(),
  };
}

/** ライブボーナス回復アイテム。大は10、小は1（[[evenran/spec]] §4）。 */
export const LB_DRINK = { large: 10, small: 1 } as const;

export interface LbNeedResult {
  /** 消費するライブボーナスの総量。 */
  gross: number;
  /** 走っている間に自然回復するぶん。 */
  regained: number;
  /** 足りないぶん（＝アイテムか石で足す必要がある量）。 */
  deficit: number;
  /** 石で賄う場合の必要数。 */
  crystals: number;
  /** 大ドリンクだけで賄う場合の本数。 */
  drinksLarge: number;
  /** 所要秒。 */
  seconds: number;
  /** 走り終えたあとに残るライブボーナス。 */
  leftover: number;
}

/**
 * 「回数を指定」で走るときに要るライブボーナス。
 *
 * ★ ゲームのオート設定に「回数を指定」があり、**足りなくなったら石や
 *   回復アイテムを使って走り続けられる**（Nori 指摘 2026-08-12）。
 *   なので「足りない＝走れない」ではなく「いくら注ぎ足すか」を出す。
 *
 * ★ 注ぎ足しは**必要になった時点で必要なぶんだけ**とする。先にまとめて
 *   注ぐと上限で溢れて損をするので、最小の見積もりを出す。
 */
export function lbNeededForPlays({
  startLB,
  taki,
  plays,
  cycleSec,
  regen,
  lbCap,
}: {
  startLB: number;
  taki: number;
  plays: number;
  cycleSec: number;
  regen: boolean;
  lbCap: number;
}): LbNeedResult {
  const empty: LbNeedResult = {
    gross: 0,
    regained: 0,
    deficit: 0,
    crystals: 0,
    drinksLarge: 0,
    seconds: 0,
    leftover: Math.max(0, startLB),
  };
  if (!(plays > 0) || taki < 0) return empty;

  let lb = Math.max(0, startLB);
  let regained = 0;
  let deficit = 0;
  let carry = 0;
  const secPerLB = LB_REGEN_MIN * 60;

  for (let i = 0; i < Math.min(plays, HARD_LIMIT); i++) {
    if (lb < taki) {
      const need = taki - lb;
      deficit += need;
      lb += need;
    }
    lb -= taki;
    if (!regen) continue;
    if (lb >= lbCap) {
      carry = 0;
      continue;
    }
    carry += cycleSec / secPerLB;
    const gained = Math.floor(carry);
    if (gained > 0) {
      carry -= gained;
      const add = Math.min(gained, Math.max(0, lbCap - lb));
      lb += add;
      regained += add;
    }
  }

  const rounded = Math.ceil(deficit);
  return {
    gross: taki * plays,
    regained,
    deficit: rounded,
    crystals: rounded * CRYSTALS_PER_LB,
    drinksLarge: Math.ceil(rounded / LB_DRINK.large),
    seconds: cycleSec * plays,
    leftover: lb,
  };
}
