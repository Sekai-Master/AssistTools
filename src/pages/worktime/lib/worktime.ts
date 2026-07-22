/**
 * 必要稼働時間の計算。時速(pt/時)×稼働時間で到達ポイント、目標逆算、必要ライボ/石。
 *
 * 点数は「基準焚き数での実測時速」を入力し、他の焚き数は倍率比でスケールする。
 * calcLivePt のスコア項(step3)は焚き数非依存で、点数は LIVE_BONUS_MULTIPLIERS[焚き数] に
 * 厳密に比例するので、時速(taki) = 基準時速 × M[taki] / M[基準] が正確に成り立つ。
 * ライボ: 焚き数ぶん消費。自然回復 1/30分。石→ライボ = クリスタル10でライボ1。
 */
import { LIVE_BONUS_MULTIPLIERS } from "../../analyzer/lib/calcLivePt";
import { playSeconds } from "../../refresh/lib/sessionPlanner";

export const CRYSTALS_PER_LB = 10;
export const LB_REGEN_MIN = 30;

export interface WorkSegment {
  id: string;
  /** 焚き数（ライブボーナス消費数 0〜10） */
  taki: number;
  /** この組み合わせの稼働時間(分) */
  minutes: number;
}

export interface WorkParams {
  /** 基準焚き数での実測時速（pt/時） */
  hourlyRate: number;
  /** 上の時速を計測した焚き数 */
  refTaki: number;
  songLengthSec: number;
  overheadSec: number;
  /** 開始時の所持ライボ */
  startingLB: number;
}

const clampTaki = (t: number) => Math.max(0, Math.min(10, Math.round(t)));
const mult = (t: number) => LIVE_BONUS_MULTIPLIERS[clampTaki(t)] ?? 1;

/** ある焚き数での時速(pt/時)。基準時速を倍率比でスケール。 */
export function hourlyRateAt(p: WorkParams, taki: number): number {
  const ref = mult(p.refTaki) || 1;
  return (p.hourlyRate * mult(taki)) / ref;
}

export interface WorkSegmentResult {
  segment: WorkSegment;
  plays: number;
  points: number;
  lb: number;
}

export interface WorkResult {
  rows: WorkSegmentResult[];
  totalMinutes: number;
  totalPlays: number;
  totalPoints: number;
  totalLB: number;
  naturalLB: number;
  requiredCrystals: number;
}

/** 順算: 焚き数×時間の組み合わせから到達ポイント・消費ライボ・必要石を出す。 */
export function computeWork(segments: readonly WorkSegment[], p: WorkParams): WorkResult {
  const secPerPlay = playSeconds(p.songLengthSec, p.overheadSec);
  let totalMinutes = 0;
  let totalPlays = 0;
  let totalPoints = 0;
  let totalLB = 0;
  const rows = segments.map((seg) => {
    const plays = secPerPlay > 0 ? (seg.minutes * 60) / secPerPlay : 0;
    const points = hourlyRateAt(p, seg.taki) * (seg.minutes / 60);
    const lb = plays * seg.taki;
    totalMinutes += seg.minutes;
    totalPlays += plays;
    totalPoints += points;
    totalLB += lb;
    return { segment: seg, plays, points, lb };
  });
  const naturalLB = totalMinutes / LB_REGEN_MIN;
  const deficit = Math.max(0, totalLB - (p.startingLB + naturalLB));
  return {
    rows,
    totalMinutes,
    totalPlays,
    totalPoints: Math.round(totalPoints),
    totalLB: Math.round(totalLB),
    naturalLB,
    requiredCrystals: Math.ceil(deficit) * CRYSTALS_PER_LB,
  };
}

/** 逆算: 目標ポイントに必要な稼働時間(分)。指定の焚き数で走る前提。 */
export function minutesForTarget(target: number, p: WorkParams, taki: number): number {
  const rate = hourlyRateAt(p, taki);
  if (rate <= 0) return 0;
  return (target / rate) * 60;
}
