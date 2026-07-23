import { DEFAULT_BASE_POINT, MAX_LIVE_BONUS, MAX_SCORE_N, SCORE_STEP } from "./constants";
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
 *   1. 1回のライブで到達できるPt集合 S を列挙（28基礎点 × LB11 × スコア係数201 ≒ 6.2万）
 *   2. 必要最小回数 n = ceil(liveRequired / max(S)) を確定
 *   3. n-1 回を同一の「大きい到達値 v」で埋め、端数 r = liveRequired - (n-1)v を
 *      S への O(1) 照合で解く。v は S の降順に全掃引する
 * という分解で「S の要素数 × 定数回」に抑える。v を全掃引するため、
 * 端数が刻みの隙間に落ちても隣の v で拾える（±1摂動より取りこぼしが少ない）。
 * n = ceil が下界なので、n 回で見つかった案は回数最小であることも保証される。
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
  /** 消費ライブボーナスの合計。並び順（少ない方が上）に使う。 */
  lbCost: number;
  totalPt: number;
}

export interface MultiLiveAdjustResult {
  status: "OK" | "NG";
  /** 回数最小の n で見つかった案。lbCost 昇順。 */
  plans: MultiLivePlan[];
  /** NG の理由。UIは無言NGにせず、これに応じた案内を出すこと。 */
  reason?: "OVER_CAP" | "NO_EXACT";
  /** OVER_CAP のとき: 理論上必要な最小ライブ回数。 */
  requiredLiveCount?: number;
  /**
   * NO_EXACT のとき: 実際に探索した最大ライブ回数。
   * 探索は最小回数から数回ぶんの窓に限られ、かつ1案に使うPt値は2種類までなので、
   * NO_EXACT は「解が存在しない」ではなく「この範囲では見つからなかった」を意味する。
   * UIはこの値を使い、断定を避けた案内を出すこと。
   */
  searchedUpToCount?: number;
  liveCountCap: number;
  /** 1回のライブで到達できる上限Pt（現在ボーナス・全基礎点・LB10）。 */
  maxPtPerLive: number;
  logs: string[];
}

/**
 * 調整ライブ回数の実用上限。ゲーム仕様ではなくツールの提示ポリシー
 * （依頼者は回数無制限を許可しているが、無限の探索と非現実的な提示を防ぐ頭）。
 * 超過時は必要回数を返し、UI側で理由を明示する。
 */
export const MAX_ADJUST_LIVE_COUNT = 50;

/** 1回の計算で提示するプラン数の上限。多すぎても選べないので絞る。 */
const MAX_PLANS = 5;

/** 同一Ptの実現手段を何通りまで覚えるか（単発一致時のバリエーション提示用）。 */
const MAX_REPS_PER_PT = 8;

/**
 * 最小回数 n で解けなかったときに n を何回まで増やして再試行するか。
 *
 * 探索は n ごとに到達値集合（約6.2万件）を1周するだけで、端数はMapのO(1)照合。
 * 1回あたりの追加コストは体感ゼロなので、ここを絞る理由は性能面には無い。
 * 一方この窓が狭いと「解はあるのに NO_EXACT」を返す取りこぼしが増えるため、
 * 実用的に広めに取る。なお下界 minCount から昇順に回すので、窓を広げても
 * 「見つかった案は回数最小」という保証は変わらない。
 */
const EXTRA_COUNT_TRIES = 10;

interface Rep {
  basePoint: number;
  liveBonus: number;
  scoreN: number;
}

/**
 * musicsList から異なり基礎点を昇順で取り出す。
 * 楽曲データ未達などで空になった場合は既定基礎点（エンヴィーの100）に退避し、
 * 少なくとも従来の単発調整と同等の探索はできるようにする。
 */
export function distinctBasePoints(musics: readonly { basePoint: number }[]): number[] {
  const set = new Set<number>();
  for (const m of musics) {
    if (m && Number.isFinite(m.basePoint) && m.basePoint > 0) set.add(m.basePoint);
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

export function planMultiLiveAdjustment(
  liveRequired: number,
  bonus: number,
  basePoints: readonly number[]
): MultiLiveAdjustResult {
  const logs: string[] = [];
  const bases = basePoints.length > 0 ? basePoints : [DEFAULT_BASE_POINT];

  if (liveRequired === 0) {
    // 調整不要。liveAdjust.ts の同ガードと同じ理由（0 Pt を獲得するスコアは存在しない）。
    logs.push("[Multi Live Adjustment] Required 0 Pt. No adjustment lives needed.");
    return {
      status: "OK",
      plans: [],
      liveCountCap: MAX_ADJUST_LIVE_COUNT,
      maxPtPerLive: 0,
      logs,
    };
  }

  // 1回のライブで到達できるPt → 実現手段（複数、LB昇順）。
  // LBを外側ループの昇順にすることで、各Ptの先頭要素が常に「最もLB消費の安い手段」になる。
  const reps = new Map<number, Rep[]>();
  for (let lb = 0; lb <= MAX_LIVE_BONUS; lb++) {
    for (const base of bases) {
      for (let n = 0; n <= MAX_SCORE_N; n++) {
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
  logs.push(
    `[Multi Live Adjustment] Reachable Pt values: ${reps.size} (${bases.length} base points, LB 0-${MAX_LIVE_BONUS}, max ${maxPtPerLive} Pt/live).`
  );

  if (liveRequired < 0 || maxPtPerLive <= 0) {
    logs.push(`[Multi Live Adjustment] Cannot adjust ${liveRequired} Pt.`);
    return {
      status: "NG",
      plans: [],
      reason: "NO_EXACT",
      liveCountCap: MAX_ADJUST_LIVE_COUNT,
      maxPtPerLive,
      logs,
    };
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
      logs,
    };
  }

  // n を最小回数から少しずつ増やしながら探す。n が1増えるだけで端数の自由度が
  // 大きく広がるので、EXTRA_COUNT_TRIES 回で見つからなければ諦めて理由を返す。
  const lastCount = Math.min(MAX_ADJUST_LIVE_COUNT, minCount + EXTRA_COUNT_TRIES);
  for (let n = minCount; n <= lastCount; n++) {
    const plans: MultiLivePlan[] = [];

    if (n === 1) {
      // 単発でちょうど。実現手段のバリエーション（LB昇順）をそのまま案として出す。
      const list = reps.get(liveRequired) ?? [];
      for (const rep of list.slice(0, MAX_PLANS)) {
        plans.push(planOf([unitOf(rep, liveRequired, 1)]));
      }
    } else {
      // n-1 回を大きい到達値 v で埋め、端数 r を単発の厳密照合で解く。
      // v の降順掃引: v が下がるほど r = liveRequired - (n-1)v は単調に増えるので、
      // r が上限Ptを超えたらそれ以降は解なし＝そこで打ち切れる。
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
        plans.push(planOf(units));
        if (plans.length >= MAX_PLANS) break;
      }
    }

    if (plans.length > 0) {
      // 回数は同一（n）なので、LB消費が安い順に提示する。
      plans.sort((a, b) => a.lbCost - b.lbCost);
      logs.push(`[Multi Live Adjustment] Found ${plans.length} plans with ${n} lives.`);
      return {
        status: "OK",
        plans,
        liveCountCap: MAX_ADJUST_LIVE_COUNT,
        maxPtPerLive,
        logs,
      };
    }
  }

  logs.push(
    `[Multi Live Adjustment] No exact combination for ${liveRequired} Pt within ${lastCount} lives.`
  );
  return {
    status: "NG",
    plans: [],
    reason: "NO_EXACT",
    searchedUpToCount: lastCount,
    liveCountCap: MAX_ADJUST_LIVE_COUNT,
    maxPtPerLive,
    logs,
  };
}
