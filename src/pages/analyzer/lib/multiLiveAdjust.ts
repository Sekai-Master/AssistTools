import {
  DEFAULT_BASE_POINT,
  DEFAULT_MAX_SCORE_N,
  MAX_LIVE_BONUS,
  SCORE_STEP,
} from "./constants";
import { calcLivePt } from "./calcLivePt";

/**
 * マイセカイ不使用モードの調整ライブ計画（複数回・LB 0〜10・楽曲自由）。
 *
 * ## なぜ「曲側」を探索軸にするか
 *
 * 基礎点（event_rate）は全702曲でわずか28通り（100〜130）しかない。
 * 一方、既存の「編成を組み替えて別ボーナスにする」経路は最大2000通りの
 * ボーナスを掃引しており、曲側の方が探索は約70分の1に安い。
 * 実用面でも、編成の組み替えは実作業が重いのに対し曲変更は一瞬なので、
 * 「現在の編成のまま、叩く曲を変える」案を第1候補にする。
 * 編成組み替え経路は第2候補として liveAdjust.ts 側に残してある。
 *
 * ## なぜ素朴な組合せ探索をしないか
 *
 * 複数回の「合計ちょうど」は subset-sum なので、liveRequired が百万級だと
 * 素朴なDP・全列挙は破綻する。ここでは
 *   1. 1回のライブで到達できるPt集合 S を列挙（基礎点 × LB11 × スコア係数）
 *   2. 回数 n ごとに「n-1 回を同一の大きい到達値 v で埋め、端数
 *      r = liveRequired - (n-1)v を S への O(1) 照合で解く」。v は S の降順に全掃引
 * という分解で「S の要素数 × 回数上限」に抑える。v を全掃引するため、
 * 端数が刻みの隙間に落ちても隣の v で拾える。
 *
 * ## 例外: 残額が小さい帯だけは全数照合する（R4 / P2-7）
 *
 * 上の分解は「1案に使うPt値は2種類まで」という制約を伴うので、3値すべてが
 * 異なる解を取りこぼす。残額が小さい帯（＝主用途のエビ詰め域）ではこれが
 * 「作れるのに NG と言う」実害になるため、liveRequired が
 * (EXHAUSTIVE_MAX_LIVES + 1) × minPtPerLive 未満のときだけ3値の全数照合を足す。
 * この帯では解が3本以内にしか存在し得ないので、見つからなければ
 * 「着地不能」を断定できる（landability フィールド）。
 *
 * ## なぜ回数 vs LB のトレードオフ曲線を返すか（R3-2）
 *
 * プロセカのライブは回数自体がほぼ無料（スタミナ消費なし）で、律速資源は
 * ライブボーナス（所持上限10・自然回復30分/個・クリスタル10個/個）の方。
 * 回数最小の1点だけを返すと「2回/LB10」の裏にある「6回/LB30 → 5回/LB38 より
 * LB8個節約」のような実用的な選択肢が全部隠れる。そこで n を回数上限まで走査し、
 * 「回数を増やすと LB 合計が真に減る」点だけを残したパレート前線を返す。
 *
 * ## スコア上限（R3-0）
 *
 * 探索は maxScoreN（ユーザー設定のスコア上限から導出。既定 1,100,000 点相当）
 * までしか回さない。以前は 4,000,000 点固定で、回数最小化が必然的に上限へ
 * 張り付くため「400万点のソロライブを6回」という実行不能プランを検証済みとして
 * 出していた（docs/porting/03-analyzer.md:26 の既知リスクが顕在化したもの）。
 */

/** 同一条件（曲・LB・スコア帯）で叩くライブのまとまり。 */
export interface MultiLiveUnit {
  basePoint: number;
  liveBonus: number;
  minScore: number;
  maxScore: number;
  /** この条件の1回で得るポイント。 */
  pt: number;
  /** この条件で叩く回数。 */
  count: number;
}

export interface MultiLivePlan {
  units: MultiLiveUnit[];
  liveCount: number;
  /** 消費ライブボーナスの合計。トレードオフ軸（回数と対）に使う。 */
  lbCost: number;
  totalPt: number;
}

export interface MultiLiveAdjustResult {
  status: "OK" | "NG";
  /**
   * 回数 vs LB のパレート前線（回数昇順・LB合計は真に減少）。
   * 先頭が回数最小案、末尾がLB最小案。5件を超える場合は
   * 「LB節約幅が大きい中間点」を優先して代表を間引いてある。
   *
   * 回数最小性: minCount = ceil(liveRequired / maxPtPerLive) はどんな組合せでも
   * 下回れない下界なので、先頭案が liveCount === minCount ならそれは最小と証明できる。
   * 探索クラスは「1案あたりPt値2種類まで」なので、3種類以上を使えばより少ない
   * LB で解ける可能性は残る（回数側の下界は影響を受けない）。
   *
   * 例外として、残額が小さい帯で全数照合が解を見つけた場合は前線ではなく
   * その1件だけが入る（R4 / P2-7。詳細はファイル冒頭のコメント）。
   */
  plans: MultiLivePlan[];
  /**
   * 主役（plans[0]）と同一 liveCount の代替内訳（LB内訳・スコア帯・基礎点の違い）。
   * plans[0] 自身は含まない。lbCost 昇順・最大 MAX_SAME_COUNT_VARIANTS 件。
   * plans が空のとき（調整不要・NG）は常に空配列。
   *
   * plans（回数 vs LB の前線）と役割が違う点に注意: plans は「本数を変える」軸、
   * こちらは「本数を変えずに内訳を変える」軸。ブリーフ P0-2 の
   * 「LB の選択肢は同一本数の中でのみ提示する」に対応する。
   */
  sameCountVariants: MultiLivePlan[];
  /** NG の理由。UIは無言NGにせず、これに応じた案内を出すこと。 */
  reason?: "OVER_CAP" | "NO_EXACT";
  /**
   * reason === "NO_EXACT" のときの着地可能性の確定度（P2-7）。
   *   "UNREACHABLE": 原理的に着地不能。liveRequired < minPtPerLive か、
   *                  全数照合できる帯で3本以内の全組合せに解が無いことを確認済み。
   *   "UNPROVEN":    探索範囲（回数上限・1案のPt値2種まで）で見つからなかっただけ。
   * NO_EXACT 以外・負の要求・到達Pt集合が空の経路では undefined。
   */
  landability?: "UNREACHABLE" | "UNPROVEN";
  /** OVER_CAP のとき: 理論上必要な最小ライブ回数。 */
  requiredLiveCount?: number;
  /**
   * NO_EXACT のとき: 実際に探索した最大ライブ回数。
   * 探索は回数上限までの窓・1案に使うPt値2種類までの制約付きなので、
   * NO_EXACT は原則「解が存在しない」ではなく「この範囲では見つからなかった」を意味する。
   * UIはこの値を使い、断定を避けた案内を出すこと。
   * 例外は landability === "UNREACHABLE" のときで、こちらは断定してよい（R4 / P2-7）。
   */
  searchedUpToCount?: number;
  liveCountCap: number;
  /**
   * 1回のライブで到達できる上限Pt（現在ボーナス・全基礎点・LB10・スコア上限まで）。
   * 調整不要（liveRequired 0）で探索しなかった場合と、負の要求で探索を
   * 打ち切った場合は 0（未計算の印。これで割らないこと）。
   */
  maxPtPerLive: number;
  /**
   * 1回のライブで獲得しうる最小Pt。liveRequired がこれ未満だと原理的に
   * 1回でも着地できない「死角」なので、UIは必要なズラし幅の案内に使う（R3-3）。
   * maxPtPerLive と同じく、探索しなかった経路では 0。
   */
  minPtPerLive: number;
  logs: string[];
}

/**
 * 調整ライブ回数の実用上限。ゲーム仕様ではなくツールの提示ポリシー
 * （依頼者は回数無制限を許可しているが、無限の探索と非現実的な提示を防ぐ頭）。
 * 超過時は必要回数を返し、UI側で理由を明示する。
 */
export const MAX_ADJUST_LIVE_COUNT = 50;

/** 提示するプラン数の上限。トレードオフ前線が長いときは代表点に間引く。 */
const MAX_PLANS = 5;

/** 同一Ptの実現手段を何通りまで覚えるか（曲候補のバリエーション用）。 */
const MAX_REPS_PER_PT = 8;

/** 「同じN回で組み替える」の提示上限。MAX_PLANS と同種の提示ポリシー定数。 */
const MAX_SAME_COUNT_VARIANTS = 4;

/**
 * 全数照合で着地不能を断定できる本数の上限。
 *
 * k 本の合計は必ず k × minPtPerLive 以上になるので、
 * liveRequired < (EXHAUSTIVE_MAX_LIVES + 1) × minPtPerLive の帯なら
 * 解は EXHAUSTIVE_MAX_LIVES 本以内にしか存在し得ない。
 * 3 は「a ≤ b の二重ループ + 残りをO(1)照合」で全数を回せる実用上の上限
 * （4本にすると三重ループになり UI をブロックする）。
 */
const EXHAUSTIVE_MAX_LIVES = 3;

interface Rep {
  basePoint: number;
  liveBonus: number;
  scoreN: number;
}

/**
 * musicsList から異なり基礎点を昇順で取り出す。
 * 楽曲データ未達などで空になった場合は既定基礎点（エンヴィーの100）に退避し、
 * 少なくとも従来の単発調整と同等の探索はできるようにする。
 * 整数チェックは必須: 非整数（例 113.5）を通すと「基礎点113.5」という
 * 実在曲ゼロのプランを作ってしまう（event_rate は整数のみ）。
 */
export function distinctBasePoints(musics: readonly { basePoint: number }[]): number[] {
  const set = new Set<number>();
  for (const m of musics) {
    if (m && Number.isInteger(m.basePoint) && m.basePoint > 0) set.add(m.basePoint);
  }
  if (set.size === 0) return [DEFAULT_BASE_POINT];
  return [...set].sort((a, b) => a - b);
}

function unitOf(rep: Rep, pt: number, count: number): MultiLiveUnit {
  return {
    basePoint: rep.basePoint,
    liveBonus: rep.liveBonus,
    minScore: rep.scoreN * SCORE_STEP,
    maxScore: (rep.scoreN + 1) * SCORE_STEP - 1,
    pt,
    count,
  };
}

function planOf(units: MultiLiveUnit[]): MultiLivePlan {
  let liveCount = 0;
  let lbCost = 0;
  let totalPt = 0;
  for (const u of units) {
    liveCount += u.count;
    lbCost += u.liveBonus * u.count;
    totalPt += u.pt * u.count;
  }
  return { units, liveCount, lbCost, totalPt };
}

/**
 * パレート前線が MAX_PLANS を超えるときの代表点選び。
 * 両端（回数最小・LB最小）は必ず残し、中間は「1つ手前の点からの LB 節約幅」が
 * 大きい順に採る。節約幅の小さい点は「回数を増やしたのにほぼ得しない」案なので
 * 落としても意思決定を歪めない。
 */
function pickRepresentatives(frontier: MultiLivePlan[]): MultiLivePlan[] {
  if (frontier.length <= MAX_PLANS) return frontier;
  const first = frontier[0];
  const last = frontier[frontier.length - 1];
  const middles = frontier
    .slice(1, -1)
    .map((plan, i) => ({ plan, saving: frontier[i].lbCost - plan.lbCost }))
    .sort((a, b) => b.saving - a.saving)
    .slice(0, MAX_PLANS - 2)
    .map((x) => x.plan);
  const picked = [first, ...middles, last];
  picked.sort((a, b) => a.liveCount - b.liveCount);
  return picked;
}

/**
 * units を一意に識別する署名。代替内訳の重複排除と主役の除外に使う。
 *
 * プランの中身は「叩く条件の集合」なので順序に意味がない。ソートして正規化しないと
 * 「バルクと端数が入れ替わっただけの同じ案」を別物として数えてしまう
 * （実測: 主役そのものが代替案として再掲される事故が出た）。
 */
function unitsSignature(units: readonly MultiLiveUnit[]): string {
  return units
    .map((u) => `${u.basePoint}/${u.liveBonus}/${u.minScore}/${u.pt}x${u.count}`)
    .sort()
    .join("|");
}

/**
 * lbCost 昇順の有界挿入リスト。同値は先に渡された方（= v が大きい方）を前に残す。
 * 上限を超えた分はその場で捨てるので、1候補あたり O(limit) に収まる。
 */
function insertBounded(list: MultiLivePlan[], plan: MultiLivePlan, limit: number): void {
  let i = 0;
  while (i < list.length && list[i].lbCost <= plan.lbCost) i += 1;
  if (i >= limit) return;
  list.splice(i, 0, plan);
  if (list.length > limit) list.length = limit;
}

/**
 * 主役と同じ回数 n で作れる案を lbCost 昇順に集める（ブリーフ P0-2）。
 *
 * frontier 確定後の後処理として呼ぶこと。探索本体（best 選択）には一切触れないので、
 * 既存の plans の値・順序は1つも動かない。
 * 探索本体が各Ptの最安手段 rep[0] しか見ないのに対し、こちらは記憶済みの
 * 実現手段（最大 MAX_REPS_PER_PT 件）を総当たりするため「同じ2回だが
 * 7焚き+2焚きではなく5焚き+4焚き」のような内訳違いが出る。
 */
function collectSameCountVariants(
  liveRequired: number,
  primary: MultiLivePlan,
  sortedPts: readonly number[],
  reps: ReadonlyMap<number, Rep[]>,
  maxPtPerLive: number
): MultiLivePlan[] {
  const n = primary.liveCount;
  const found: MultiLivePlan[] = [];
  // 主役の署名を先に入れておけば、主役の再掲も同案の重複も同じ仕組みで弾ける。
  const seen = new Set<string>([unitsSignature(primary.units)]);
  const offer = (units: MultiLiveUnit[]): void => {
    const sig = unitsSignature(units);
    if (seen.has(sig)) return;
    seen.add(sig);
    insertBounded(found, planOf(units), MAX_SAME_COUNT_VARIANTS);
  };

  if (n === 1) {
    for (const rep of reps.get(liveRequired) ?? []) offer([unitOf(rep, liveRequired, 1)]);
    return found;
  }

  for (const v of sortedPts) {
    const r = liveRequired - (n - 1) * v;
    if (r <= 0) continue;
    if (r > maxPtPerLive) break; // 本探索と同じ打ち切り条件（v 降順なので r は単調増加）
    const remList = reps.get(r);
    if (!remList) continue;
    const bulkList = reps.get(v) as Rep[];
    if (v === r) {
      // 端数がバルクと同値なら本探索と同じく1条件に畳む
      for (const rep of bulkList) offer([unitOf(rep, v, n)]);
      continue;
    }
    for (const bulk of bulkList) {
      for (const rem of remList) {
        // lbCost は plan を組み立てる前に算術で出せる。満杯かつ改善しない候補は
        // ここで捨てて、オブジェクト生成と署名計算を挿入対象だけに絞る。
        const lbCost = bulk.liveBonus * (n - 1) + rem.liveBonus;
        const full = found.length >= MAX_SAME_COUNT_VARIANTS;
        if (full && lbCost >= found[MAX_SAME_COUNT_VARIANTS - 1].lbCost) continue;
        offer([unitOf(bulk, v, n - 1), unitOf(rem, r, 1)]);
      }
    }
  }
  return found;
}

/** 同値の Pt をまとめて units 化する（全数照合で見つけた解の組み立て用。pt 降順）。 */
function unitsOfPts(pts: readonly number[], reps: ReadonlyMap<number, Rep[]>): MultiLiveUnit[] {
  const counts = new Map<number, number>();
  for (const pt of pts) counts.set(pt, (counts.get(pt) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([pt, count]) => unitOf((reps.get(pt) as Rep[])[0], pt, count));
}

/**
 * EXHAUSTIVE_MAX_LIVES 本以内の厳密解を全数照合で探す（P2-7 の中核）。
 *
 * 本探索は「1案に使うPt値は2種類まで」という制約付きなので、
 * 「3値すべて異なる解」を取りこぼす。残額が小さい帯（＝主用途のエビ詰め域）では
 * これが実害になるため、ここだけ全数で埋める。
 *
 * 探すのは「3値の組」だけでよい。1本・2本の解は本探索が全数で見ているし
 * （n=1 は直接照合、n=2 は v 全掃引で網羅）、本探索が n = minCount から始まる
 * ぶんの取りこぼしは「その回数では合計が届かない」＝存在しないケースに限られる。
 * liveRequired < (EXHAUSTIVE_MAX_LIVES + 1) × minPtPerLive の帯でのみ呼ぶこと。
 *
 * 走査は a・b とも降順に固定して決定的にする。複数解があれば lbCost 最小を採る
 * （各Ptの rep[0] が最安LBの手段なので、値の組が決まればLBも決まる）。
 */
function findExhaustiveExact(
  liveRequired: number,
  sortedPts: readonly number[],
  reps: ReadonlyMap<number, Rep[]>,
  maxPtPerLive: number
): MultiLivePlan | null {
  const cands = sortedPts.filter((pt) => pt <= liveRequired); // sortedPts は降順のまま
  const lbOf = (pt: number): number => (reps.get(pt) as Rep[])[0].liveBonus;
  let best: MultiLivePlan | null = null;

  for (let i = 0; i < cands.length; i += 1) {
    const b = cands[i];
    const lbB = lbOf(b);
    for (let j = i; j < cands.length; j += 1) {
      const a = cands[j]; // 降順なので必ず a <= b（同じ組を二度数えない）
      const c = liveRequired - a - b;
      if (c <= 0) continue; // a が大きすぎる。j が進めば c は増えるので継続
      if (c > maxPtPerLive) break; // c は j に対して単調増加なので、ここから先は全滅
      if (!reps.has(c)) continue;
      const lbCost = lbB + lbOf(a) + lbOf(c);
      if (best && lbCost >= best.lbCost) continue;
      best = planOf(unitsOfPts([b, a, c], reps));
    }
  }
  return best;
}

export function planMultiLiveAdjustment(
  liveRequired: number,
  bonus: number,
  basePoints: readonly number[],
  maxScoreN: number = DEFAULT_MAX_SCORE_N
): MultiLiveAdjustResult {
  const logs: string[] = [];
  const bases = basePoints.length > 0 ? basePoints : [DEFAULT_BASE_POINT];
  const noSearch = { liveCountCap: MAX_ADJUST_LIVE_COUNT, maxPtPerLive: 0, minPtPerLive: 0 };

  if (liveRequired === 0) {
    // 調整不要。liveAdjust.ts の同ガードと同じ理由（0 Pt を獲得するスコアは存在しない）。
    logs.push("[Multi Live Adjustment] Required 0 Pt. No adjustment lives needed.");
    return { status: "OK", plans: [], sameCountVariants: [], ...noSearch, logs };
  }

  // 負の要求は列挙するだけ無駄なので、到達Pt集合を作る前に確定させる。
  // 到達可能性を論じる余地がない（そもそも入力が不正）ので landability は付けない。
  if (liveRequired < 0) {
    logs.push(`[Multi Live Adjustment] Cannot adjust negative ${liveRequired} Pt.`);
    return { status: "NG", plans: [], sameCountVariants: [], reason: "NO_EXACT", ...noSearch, logs };
  }

  // 1回のライブで到達できるPt → 実現手段（複数、LB昇順）。
  // LBを外側ループの昇順にすることで、各Ptの先頭要素が常に「最もLB消費の安い手段」になる。
  const reps = new Map<number, Rep[]>();
  for (let lb = 0; lb <= MAX_LIVE_BONUS; lb++) {
    for (const base of bases) {
      for (let n = 0; n <= maxScoreN; n++) {
        const pt = calcLivePt(base, bonus, n * SCORE_STEP, lb);
        if (pt <= 0) continue;
        const list = reps.get(pt);
        if (!list) {
          reps.set(pt, [{ basePoint: base, liveBonus: lb, scoreN: n }]);
        } else if (list.length < MAX_REPS_PER_PT) {
          list.push({ basePoint: base, liveBonus: lb, scoreN: n });
        }
      }
    }
  }

  const sortedPts = [...reps.keys()].sort((a, b) => b - a);
  const maxPtPerLive = sortedPts.length > 0 ? sortedPts[0] : 0;
  const minPtPerLive = sortedPts.length > 0 ? sortedPts[sortedPts.length - 1] : 0;
  logs.push(
    `[Multi Live Adjustment] Reachable Pt values: ${reps.size} (${bases.length} base points, LB 0-${MAX_LIVE_BONUS}, score N <= ${maxScoreN}, ${minPtPerLive}-${maxPtPerLive} Pt/live).`
  );

  if (maxPtPerLive <= 0) {
    // 到達Pt集合が空。minPtPerLive も未計算なので帯の判定材料がない＝断定しない。
    logs.push(`[Multi Live Adjustment] Cannot adjust ${liveRequired} Pt.`);
    return { status: "NG", plans: [], sameCountVariants: [], reason: "NO_EXACT", ...noSearch, logs };
  }

  // 必要最小回数。ceil は全戦略共通の下界なので、この n で見つかれば回数最小が保証される。
  const minCount = Math.ceil(liveRequired / maxPtPerLive);
  if (minCount > MAX_ADJUST_LIVE_COUNT) {
    logs.push(
      `[Multi Live Adjustment] Requires at least ${minCount} lives (> cap ${MAX_ADJUST_LIVE_COUNT}).`
    );
    return {
      status: "NG",
      plans: [],
      sameCountVariants: [],
      reason: "OVER_CAP",
      requiredLiveCount: minCount,
      liveCountCap: MAX_ADJUST_LIVE_COUNT,
      maxPtPerLive,
      minPtPerLive,
      logs,
    };
  }

  // 回数 n ごとに最安LBの案を求め、パレート前線（回数を増やすとLBが真に減る点列）を作る。
  // n を1つ増やすごとの走査は sortedPts 1周（上限クリップ後は高々数万件）×O(1)照合
  // なので、回数上限50まで全部回しても UI をブロックしない。
  const frontier: MultiLivePlan[] = [];
  for (let n = minCount; n <= MAX_ADJUST_LIVE_COUNT; n++) {
    let best: MultiLivePlan | null = null;

    if (n === 1) {
      // 単発でちょうど。実現手段リストはLB昇順なので先頭が最安。
      const list = reps.get(liveRequired);
      if (list) best = planOf([unitOf(list[0], liveRequired, 1)]);
    } else {
      // n-1 回を大きい到達値 v で埋め、端数 r を単発の厳密照合で解く。
      // v の降順掃引: v が下がるほど r = liveRequired - (n-1)v は単調に増えるので、
      // r が上限Ptを超えたらそれ以降は解なし＝そこで打ち切れる。
      // 候補は全部見てから最安を採ること（先に件数で切ると最安LB案を落とす。R2で実害を確認済み）。
      for (const v of sortedPts) {
        const r = liveRequired - (n - 1) * v;
        if (r <= 0) continue;
        if (r > maxPtPerLive) break;
        const remList = reps.get(r);
        if (!remList) continue;
        const bulkRep = (reps.get(v) as Rep[])[0];
        const remRep = remList[0];
        const units =
          v === r
            ? [unitOf(bulkRep, v, n)] // 端数がバルクと同値なら1条件に畳む
            : [unitOf(bulkRep, v, n - 1), unitOf(remRep, r, 1)];
        const plan = planOf(units);
        if (!best || plan.lbCost < best.lbCost) best = plan;
      }
    }

    if (!best) continue;
    // 前の点よりLBが安くならない案はトレードオフとして無意味（回数だけ増える）ので捨てる。
    // これで「同じ回数・ほぼ同じLBの案でカードが埋まる」R2の見かけ倒しを解消する。
    if (frontier.length === 0 || best.lbCost < frontier[frontier.length - 1].lbCost) {
      frontier.push(best);
      // LB 0 になったらこれ以上安くはならないので打ち切る。
      if (best.lbCost === 0) break;
    }
  }

  if (frontier.length > 0) {
    const plans = pickRepresentatives(frontier);
    // 主役（回数最少案）と同じ回数で作れる内訳違いを、前線とは別枠で添える。
    // frontier 確定後の後処理なので plans の値・順序には影響しない。
    const sameCountVariants = collectSameCountVariants(
      liveRequired,
      plans[0],
      sortedPts,
      reps,
      maxPtPerLive
    );
    logs.push(
      `[Multi Live Adjustment] Tradeoff frontier: ${frontier.length} points (showing ${plans.length}), lives ${plans[0].liveCount}-${plans[plans.length - 1].liveCount}, LB ${plans[0].lbCost}-${plans[plans.length - 1].lbCost}.`
    );
    logs.push(
      `[Multi Live Adjustment] Same-count variants: ${sameCountVariants.length} (liveCount ${plans[0].liveCount}).`
    );
    return {
      status: "OK",
      plans,
      sameCountVariants,
      liveCountCap: MAX_ADJUST_LIVE_COUNT,
      maxPtPerLive,
      minPtPerLive,
      logs,
    };
  }

  // 解が見つからなかった。ここで「原理的に不能」と「探索範囲で見つからなかっただけ」を
  // 区別する（P2-7）。断定できるのは全数照合した帯だけで、それ以外で断定すると
  // 実際には解がある残額を諦めさせてしまう。
  const exhaustiveBand = (EXHAUSTIVE_MAX_LIVES + 1) * minPtPerLive;
  let landability: "UNREACHABLE" | "UNPROVEN" = "UNPROVEN";
  if (liveRequired < minPtPerLive) {
    // 1本の最小獲得Ptに満たない。何本叩いても合計はこれ以上にしかならない。
    landability = "UNREACHABLE";
  } else if (liveRequired < exhaustiveBand) {
    const exact = findExhaustiveExact(liveRequired, sortedPts, reps, maxPtPerLive);
    if (exact) {
      // 本探索の「Pt値2種まで」制約が取りこぼしていた解。n=1,2 は本探索が
      // 全数で見ているので、この解の回数（3）は最小性を保つ。
      logs.push(
        `[Multi Live Adjustment] Exhaustive <=${EXHAUSTIVE_MAX_LIVES}-live check found a plan (${exact.liveCount} lives, LB ${exact.lbCost}).`
      );
      return {
        status: "OK",
        plans: [exact],
        sameCountVariants: [],
        liveCountCap: MAX_ADJUST_LIVE_COUNT,
        maxPtPerLive,
        minPtPerLive,
        logs,
      };
    }
    landability = "UNREACHABLE";
  }

  logs.push(
    `[Multi Live Adjustment] No exact combination for ${liveRequired} Pt within ${MAX_ADJUST_LIVE_COUNT} lives (landability: ${landability}).`
  );
  return {
    status: "NG",
    plans: [],
    sameCountVariants: [],
    reason: "NO_EXACT",
    landability,
    searchedUpToCount: MAX_ADJUST_LIVE_COUNT,
    liveCountCap: MAX_ADJUST_LIVE_COUNT,
    maxPtPerLive,
    minPtPerLive,
    logs,
  };
}
