/**
 * 休憩中のオートライブ。**「Ptを稼ぎながら休む」を計画に載せるための層。**
 *
 * ── なぜ休憩に足せるか ────────────────────────────────────────
 * リフレッシュゲージが増えるのは 手動のライブ・マイセカイ採取 などで、
 * **オートライブとチャレンジライブは増えない**（公式文言。ゲージ100%でも
 * イベントPは入る）。だから休憩ブロックでオートを回しても、休憩としての
 * 価値＝ゲージの減少は一切損なわれない。減少はそのまま30分ごとに進む。
 *
 * ── 何で止まるか（3つとも別の手が要る）─────────────────────────
 *   休憩の尺   … 回数×周期が休憩時間を超える     → 休憩を延ばす／短い曲にする
 *   回数上限   … 1日10回（PRECIOUS で99回）      → **どうやっても増えない**
 *   4:00 の罠  … 実行中に4:00をまたぐと翌日ぶんを先に食う（前日の余りは消える）
 *
 * 上限とリセット時刻の正本は src/pages/ranking/lib/lbRun.ts（PASS_LIMITS）。
 * ここは「時計の上でどの日に何回入るか」だけを担当する。
 */

/** オート回数がリセットされる時刻（その日の分）。毎日 4:00。 */
export const GAME_DAY_RESET_MIN = 4 * 60;

/** 1日の分。 */
const DAY_MIN = 1440;

/** 暴走防止（0秒周期などで無限ループにしない）。 */
const HARD_LIMIT = 1000;

/**
 * 絶対分（プラン開始時刻＋経過分）が属する「ゲーム日」の通し番号。
 * 境界は 4:00 なので、深夜1時は前日の扱いになる。
 */
export function gameDayIndex(absMinutes: number): number {
  return Math.floor((absMinutes - GAME_DAY_RESET_MIN) / DAY_MIN);
}

/** 窓（分）に収まるオートの回数。**回しきれない最後の1回は数えない。** */
export function playsFittingIn(windowMinutes: number, cycleSec: number): number {
  if (!(cycleSec > 0) || !(windowMinutes > 0)) return 0;
  return Math.min(HARD_LIMIT, Math.floor((windowMinutes * 60) / cycleSec));
}

/** 1ブロックぶんのオート設定。 */
export interface AutoBlock {
  /** result.points のインデックス（どの休憩か） */
  index: number;
  /** プラン開始からの相対分 */
  startMinute: number;
  /** 休憩の長さ（分） */
  restMinutes: number;
  /** 回したい回数。null なら「休憩の尺いっぱいまで」 */
  requested: number | null;
}

export interface AutoRuntime {
  /** 1周期の秒（曲長＋オート用オーバーヘッド） */
  cycleSec: number;
  /** 1回あたりの獲得Pt */
  ptPerPlay: number;
  /** 1回あたりの焚き数（ライボ消費） */
  taki: number;
  /** 1日の回数上限（パス種別で決まる） */
  dailyCap: number;
  /** プラン開始時点のゲーム日に、すでに消化している回数 */
  usedToday: number;
  /** プラン開始時刻（その日の分）。null なら時計が無い＝日をまたぐ判定ができない */
  startMinuteOfDay: number | null;
}

export interface AutoBlockResult {
  index: number;
  /** 実際に回せる回数 */
  plays: number;
  /** 休憩の尺に入りきらず落とした回数 */
  droppedByTime: number;
  /** 回数上限に当たって落とした回数 */
  droppedByCap: number;
  /** このブロックが 4:00 をまたぐか */
  crossesReset: boolean;
  /** そのうち翌日ぶんのクォータを食う回数（★4:00の罠） */
  playsOnNextDay: number;
  points: number;
  /** 消費するライブボーナス */
  lb: number;
}

export interface AutoPlanResult {
  blocks: AutoBlockResult[];
  /** ゲーム日ごとの回数（通し番号→回数）。上限との突き合わせ表示に使う。 */
  byDay: { day: number; plays: number; cap: number }[];
  totalPlays: number;
  totalPoints: number;
  totalLb: number;
  /** ブロックのインデックス→結果。UI から引くため。 */
  byIndex: Map<number, AutoBlockResult>;
}

/**
 * 休憩ブロック群にオートを割り付ける。
 *
 * ★ **1回ずつ時計を進めて数える。** 「回数 ÷ 上限」で丸めると、4:00 をまたぐ
 *   ブロックで何回目から翌日ぶんになるのかが出せない。実機の挙動（またいだ時点で
 *   翌日のクォータを食い始め、前日の余りは消える）を再現するには1回ずつ見るしかない。
 */
export function planAuto(blocks: readonly AutoBlock[], rt: AutoRuntime): AutoPlanResult {
  const quota = new Map<number, number>();
  const used = new Map<number, number>();
  const results: AutoBlockResult[] = [];

  const startDay =
    rt.startMinuteOfDay == null ? 0 : gameDayIndex(rt.startMinuteOfDay);

  /** その日の残り回数。初日だけ「すでに消化した回数」を引く。 */
  const remainingOf = (day: number): number => {
    if (!quota.has(day)) {
      const base = Math.max(0, rt.dailyCap);
      quota.set(day, day === startDay ? Math.max(0, base - Math.max(0, rt.usedToday)) : base);
    }
    return quota.get(day) ?? 0;
  };

  for (const b of blocks) {
    const fit = playsFittingIn(b.restMinutes, rt.cycleSec);
    const want = b.requested == null ? fit : Math.max(0, Math.min(HARD_LIMIT, b.requested));
    const afterTime = Math.min(want, fit);
    const droppedByTime = want - afterTime;

    let plays = 0;
    let droppedByCap = 0;
    let playsOnNextDay = 0;
    let crossesReset = false;

    for (let i = 0; i < afterTime; i++) {
      // その回の開始時刻。時計が無いときは全部同じ日として数える。
      const day =
        rt.startMinuteOfDay == null
          ? startDay
          : gameDayIndex(
              rt.startMinuteOfDay + b.startMinute + (i * rt.cycleSec) / 60
            );
      if (day !== startDayOfBlock(rt, b)) crossesReset = true;
      const remaining = remainingOf(day);
      if (remaining <= 0) {
        droppedByCap += 1;
        continue;
      }
      quota.set(day, remaining - 1);
      used.set(day, (used.get(day) ?? 0) + 1);
      plays += 1;
      if (day > startDayOfBlock(rt, b)) playsOnNextDay += 1;
    }

    results.push({
      index: b.index,
      plays,
      droppedByTime,
      droppedByCap,
      crossesReset,
      playsOnNextDay,
      points: Math.round(plays * Math.max(0, rt.ptPerPlay)),
      lb: plays * Math.max(0, rt.taki),
    });
  }

  const byDay = [...used.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, plays]) => ({
      day,
      plays,
      cap: day === startDay ? Math.max(0, rt.dailyCap - Math.max(0, rt.usedToday)) : rt.dailyCap,
    }));

  return {
    blocks: results,
    byDay,
    totalPlays: results.reduce((s, r) => s + r.plays, 0),
    totalPoints: results.reduce((s, r) => s + r.points, 0),
    totalLb: results.reduce((s, r) => s + r.lb, 0),
    byIndex: new Map(results.map((r) => [r.index, r])),
  };
}

/** そのブロックが始まる時点のゲーム日。 */
function startDayOfBlock(rt: AutoRuntime, b: AutoBlock): number {
  if (rt.startMinuteOfDay == null) return 0;
  return gameDayIndex(rt.startMinuteOfDay + b.startMinute);
}
