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
   */
  plans: MultiLivePlan[];
  /** NG の理由。UIは無言NGにせず、これに応じた案内を出すこと。 */
  reason?: "OVER_CAP" | "NO_EXACT";
  /** OVER_CAP のとき: 理論上必要な最小ライブ回数。 */
  requiredLiveCount?: number;
  /**
   * NO_EXACT のとき: 実際に探索した最大ライブ回数。
   * 探索は回数上限までの窓・1案に使うPt値2種類までの制約付きなので、
   * NO_EXACT は「解が存在しない」ではなく「この範囲では見つからなかった」を意味する。
   * UIはこの値を使い、断定を避けた案内を出すこと。
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
    return { status: "OK", plans: [], ...noSearch, logs };
  }

  // 負の要求は列挙するだけ無駄なので、到達Pt集合を作る前に確定させる。
  if (liveRequired < 0) {
    logs.push(`[Multi Live Adjustment] Cannot adjust negative ${liveRequired} Pt.`);
    return { status: "NG", plans: [], reason: "NO_EXACT", ...noSearch, logs };
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
    logs.push(`[Multi Live Adjustment] Cannot adjust ${liveRequired} Pt.`);
    return { status: "NG", plans: [], reason: "NO_EXACT", ...noSearch, logs };
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
    logs.push(
      `[Multi Live Adjustment] Tradeoff frontier: ${frontier.length} points (showing ${plans.length}), lives ${plans[0].liveCount}-${plans[plans.length - 1].liveCount}, LB ${plans[0].lbCost}-${plans[plans.length - 1].lbCost}.`
    );
    return {
      status: "OK",
      plans,
      liveCountCap: MAX_ADJUST_LIVE_COUNT,
      maxPtPerLive,
      minPtPerLive,
      logs,
    };
  }

  logs.push(
    `[Multi Live Adjustment] No exact combination for ${liveRequired} Pt within ${MAX_ADJUST_LIVE_COUNT} lives.`
  );
  return {
    status: "NG",
    plans: [],
    reason: "NO_EXACT",
    searchedUpToCount: MAX_ADJUST_LIVE_COUNT,
    liveCountCap: MAX_ADJUST_LIVE_COUNT,
    maxPtPerLive,
    minPtPerLive,
    logs,
  };
}
