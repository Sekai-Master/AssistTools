/**
 * 周回プランのタイムライン模擬。プレイ/休憩ブロックを順に積み、
 * 各ブロックの「開始→終了の時刻・ゲージ%」を出す。100%超過の無駄も検出。
 *
 * プレイブロックは「時間(分)」で指定する（イベランのシフトが1時間・30分区切りのため）。
 *
 * ## 減少（公式スライド準拠, 2026-03）
 * - 最終プレイから5分後に計測開始。その5分も計測に含まれる（＝実質「最終プレイから30分で初回減少」）。
 * - 30分ごとに 8.3%（内部550,000）減少。
 * - **減少途中にプレイするとタイマー停止、残り時間は引き継がれる**（30分ゼロからやり直しにならない）。
 *   → 休憩の進捗(decayProgress)をブロックを跨いで繰り越す。20分休憩→プレイ→20分休憩＝計40分で1回減少。
 * - 未モデル化の微差: 5分未満の休憩（＝プレイ間5分以内）の扱い。実運用では稀なので all-count で近似。
 */
import { GAUGE_SPEC, type GaugeSpec, liveGaugeInternal, mySekaiGaugeInternal } from "./gaugeModel";
import { playSeconds } from "./sessionPlanner";

export type Segment =
  | {
      id: string;
      kind: "play";
      songId: string;
      title: string;
      jacketLink: string;
      refreshConstant: number;
      songLengthSec: number;
      /** このブロックの走行時間(分)。シフト単位（60/30等）で指定。 */
      minutes: number;
      /** 焚き数（ライブボーナス消費数 0〜10）。点数計算に使う。ゲージには影響しない。 */
      taki?: number;
    }
  | { id: string; kind: "mysekai"; stamina: number; minutes: number }
  | { id: string; kind: "rest"; minutes: number };

export interface SegmentResult {
  segment: Segment;
  /** 開始からの相対分 */
  startMinute: number;
  endMinute: number;
  startPercent: number;
  endPercent: number;
  /** プレイブロックの周回数（分×ペースの逆算。休憩は0） */
  plays: number;
  /** 100%超過でポイントが入らなかった周回数 */
  wastedPlays: number;
  /** 100%超過でムダになった時間(分) */
  wastedMinutes: number;
  /** このブロック終了時点の「次の減少までに累積した休憩分」(0-30, 繰り越し) */
  decayProgressMin: number;
}

export interface TimelineResult {
  points: SegmentResult[];
  totalMinutes: number;
  finalPercent: number;
  totalPlays: number;
  totalWasted: number;
  totalWastedMinutes: number;
}

export function simulateTimeline(
  segments: readonly Segment[],
  startPercent: number,
  overheadSec: number,
  spec: GaugeSpec = GAUGE_SPEC
): TimelineResult {
  let internal = (Math.max(0, Math.min(100, startPercent)) / 100) * spec.max;
  let minute = 0;
  let decayProgress = 0; // 次の減少に向けて累積した休憩分（ブロックを跨いで繰り越す）
  let totalPlays = 0;
  let totalWasted = 0;
  let totalWastedMinutes = 0;
  const points: SegmentResult[] = [];

  for (const seg of segments) {
    const startInternal = internal;
    const startMinute = minute;
    let plays = 0;
    let wasted = 0;
    let wastedMin = 0;

    if (seg.kind === "play") {
      // プレイ中は減少タイマー停止（decayProgress は据え置き＝繰り越し）。
      const secPerPlay = playSeconds(seg.songLengthSec, overheadSec);
      plays = secPerPlay > 0 ? (seg.minutes * 60) / secPerPlay : 0;
      const per = liveGaugeInternal(seg.refreshConstant, spec);
      const effective = per > 0 ? Math.max(0, (spec.max - internal) / per) : plays;
      wasted = Math.max(0, plays - effective);
      wastedMin = (wasted * secPerPlay) / 60;
      internal = Math.min(spec.max, internal + plays * per);
      minute += seg.minutes;
      totalPlays += plays;
      totalWasted += wasted;
      totalWastedMinutes += wastedMin;
    } else if (seg.kind === "mysekai") {
      // マイセカイ採取も活動＝減少タイマー停止（progress据え置き＝繰り越し）。
      // ゲージは 700/スタミナ（双葉は別枠だがUIでは素材換算のスタミナ入力に集約）。
      internal = Math.min(spec.max, internal + mySekaiGaugeInternal(seg.stamina, 0, spec));
      minute += Math.max(0, seg.minutes);
    } else {
      // 休憩: 進捗を繰り越し加算し、30分ごとに減少。
      decayProgress += Math.max(0, seg.minutes);
      while (decayProgress >= 30) {
        decayProgress -= 30;
        internal = Math.max(0, internal - spec.decayPer30min);
      }
      minute += Math.max(0, seg.minutes);
    }

    points.push({
      segment: seg,
      startMinute,
      endMinute: minute,
      startPercent: (startInternal / spec.max) * 100,
      endPercent: (internal / spec.max) * 100,
      plays,
      wastedPlays: wasted,
      wastedMinutes: wastedMin,
      decayProgressMin: decayProgress,
    });
  }

  return {
    points,
    totalMinutes: minute,
    finalPercent: (internal / spec.max) * 100,
    totalPlays,
    totalWasted,
    totalWastedMinutes,
  };
}
