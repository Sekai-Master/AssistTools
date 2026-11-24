/**
 * 周回プランのタイムライン模擬。プレイ/休憩ブロックを順に積み、
 * 各ブロックの「開始→終了の時刻・ゲージ%」を出す。100%超過の無駄も検出。
 *
 * プレイブロックは「時間(分)」で指定する（イベランのシフトが1時間・30分区切りのため）。
 * 2026-11-24 から、ブロックごとに「終わりのゲージ%」で指定することもできる（targetPercent）。
 * そのブロックの開始時点のゲージから目標まで上げるのに要る時間を逆算して、時間の代わりに使う
 * （イベントの終わりに100%ぎりぎりで終える組み方。前のブロックを動かしても目標で終わる）。
 * 2026-11-25 から休憩も「終わりのゲージ%」で指定できる。ゲージは30分ごとに一段ずつ下がるので、
 * 入れた%以下になる段まで休む時間を逆算する（restMinutesToTarget。ちょうどの%にはならない）。
 *
 * ## 減少（公式スライド準拠, 2026-03）
 * - 最終プレイから5分後に計測開始。その5分も計測に含まれる（＝実質「最終プレイから30分で初回減少」）。
 * - 30分ごとに 8.3%（内部550,000）減少。
 * - **減少途中にプレイするとタイマー停止、残り時間は引き継がれる**（30分ゼロからやり直しにならない）。
 *   → 休憩の進捗(decayProgress)をブロックを跨いで繰り越す。20分休憩→プレイ→20分休憩＝計40分で1回減少。
 * - 未モデル化の微差: 5分未満の休憩（＝プレイ間5分以内）の扱い。実運用では稀なので all-count で近似。
 */
import {
  DECAY_INTERVAL_MIN,
  GAUGE_SPEC,
  type GaugeSpec,
  internalFromPercent,
  liveGaugeInternal,
  mySekaiGaugeInternal,
} from "./gaugeModel";
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
      /**
       * このブロックの終わりのゲージ（表示% 0〜100）。入っていると時間（minutes）の代わりに、
       * ここまで上げるのに要る時間を逆算して使う（minutesToTarget）。無ければ時間で決める。
       * 2026-11-24 追加なので旧データには無い。
       */
      targetPercent?: number;
      /** 焚き数（ライブボーナス消費数 0〜10）。点数計算に使う。ゲージには影響しない。 */
      taki?: number;
    }
  | {
      id: string;
      kind: "mysekai";
      /**
       * 採取したメモリ数（木・石=1.0 / キラキラ・樽=0.5 / 草花・工具箱=0.2）。
       * ★ ゲージも点数もメモリが基準。スタミナは表示のための換算に過ぎない。
       */
      memori?: number;
      /**
       * 旧データ互換。2026-08-27 より前の保存プランはスタミナで持っている
       * （1メモリ = staminaPerMemori スタミナ）。読むときは mysekaiMemoriOf を通す。
       */
      stamina?: number;
      minutes: number;
    }
  | {
      id: string;
      kind: "rest";
      minutes: number;
      /**
       * 休んだ後のゲージの目標（表示% 0〜100）。入っていると時間（minutes）の代わりに、
       * ここ以下になる段まで休む時間を逆算して使う（restMinutesToTarget）。無ければ時間で決める。
       * 2026-11-25 追加なので旧データには無い。
       */
      targetPercent?: number;
      /**
       * この休憩でオートライブを回す。
       *
       * ★ **オートはゲージを増やさない種別**（公式文言。100%でもイベントPは入る）なので、
       *   ここに置いてもゲージの減少＝休憩としての価値は一切損なわれない。
       *   計算の中身は lib/autoPlan.ts。`plays` 未指定は「休憩の尺いっぱいまで」。
       */
      auto?: { plays?: number };
    };

/**
 * マイセカイブロックのメモリ数。**旧データ（スタミナ保存）をここで吸収する。**
 * 保存プランはユーザーの端末に残り続けるので、読み口を1つにしておかないと
 * 「呼び出したら採取量が0になる」が静かに起きる。
 */
export function mysekaiMemoriOf(
  seg: Extract<Segment, { kind: "mysekai" }>,
  spec: GaugeSpec = GAUGE_SPEC
): number {
  if (seg.memori != null) return Math.max(0, seg.memori);
  if (seg.stamina != null) return Math.max(0, seg.stamina) / spec.staminaPerMemori;
  return 0;
}

/**
 * 稼働・休憩ブロックの目標ゲージ%（0〜100 に収める）。時間で決めるブロックは null。
 * ★ 保存プランは端末に残り続けるので、壊れた値（文字列・NaN）は時間で決める扱いに戻す。
 */
export function targetPercentOf(
  seg: Extract<Segment, { kind: "play" | "rest" }>
): number | null {
  const t = seg.targetPercent;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  return Math.max(0, Math.min(100, t));
}

/** 稼働ブロックの目標ゲージ%（targetPercentOf の稼働版。#279 からの名前）。 */
export function playTargetOf(seg: Extract<Segment, { kind: "play" }>): number | null {
  return targetPercentOf(seg);
}

/**
 * 休憩で、開始のゲージ（内部値）が目標の表示%以下になるまでに要る分と、下がる段の数。
 *
 * 休憩中のゲージは、累計30分たまるごとに decayPer30min ずつ下がる（離散）。最初の段は前から繰り越した
 * タイマーの残りで来る:
 *   段の数 n = ⌈(開始の内部値 − 目標の内部値) ÷ decayPer30min⌉（目標が開始以上なら 0）
 *   分 = n が 0 なら 0、そうでなければ (30 − 繰り越しの進捗) + (n − 1) × 30
 * 段が下がった瞬間に休むのを止めるので、休んだ後のタイマーは 0 から。目標は 0〜100% に収める（0 なら 0% まで）。
 */
export function restMinutesToTarget(
  startInternal: number,
  targetPercent: number,
  decayProgressMin: number,
  spec: GaugeSpec = GAUGE_SPEC
): { minutes: number; ticks: number } {
  const need = startInternal - internalFromPercent(targetPercent, spec);
  if (!(need > 0) || !(spec.decayPer30min > 0)) return { minutes: 0, ticks: 0 };
  // ちょうど段の値（70% → 45% など）を浮動小数の端数で 1 段多く数えない
  const ticks = Math.ceil(need / spec.decayPer30min - 1e-9);
  if (ticks <= 0) return { minutes: 0, ticks: 0 };
  const progress = Math.max(0, Math.min(DECAY_INTERVAL_MIN, decayProgressMin));
  return { minutes: DECAY_INTERVAL_MIN - progress + (ticks - 1) * DECAY_INTERVAL_MIN, ticks };
}

/**
 * 稼働で、開始のゲージ（内部値）から目標の表示%まで上げるのに要る分。
 *
 * 時間で決めるときの式（周回数 = 分 × 60 ÷ 1周の秒、内部値 += 周回数 × 1回の増加）を逆にしたもの:
 *   分 = (目標の内部値 − 開始の内部値) ÷ 1回の増加 × 1周の秒 ÷ 60
 * 稼働ではゲージは下がらないので、目標が開始以下なら 0 分。目標は 0〜100% に収める。
 */
export function minutesToTarget(
  startInternal: number,
  targetPercent: number,
  refreshConstant: number,
  songLengthSec: number,
  overheadSec: number,
  spec: GaugeSpec = GAUGE_SPEC
): number {
  const per = liveGaugeInternal(refreshConstant, spec);
  const secPerPlay = playSeconds(songLengthSec, overheadSec);
  if (!(per > 0) || !(secPerPlay > 0)) return 0;
  const need = internalFromPercent(targetPercent, spec) - startInternal;
  if (!(need > 0)) return 0;
  return ((need / per) * secPerPlay) / 60;
}

export interface SegmentResult {
  segment: Segment;
  /** 開始からの相対分 */
  startMinute: number;
  endMinute: number;
  /** このブロックの長さ(分)。ゲージ%で決める稼働は逆算した分（segment.minutes ではない）。 */
  minutes: number;
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

/**
 * @param startDecayProgressMin プラン開始時点で減少タイマーが進んでいる分（0〜30）。
 *   ゲーム内の「次の回復まで ○分」から `decayProgressFromNextDecay` で作る。
 *   **既定の0は「たった今プレイを止めた」**＝従来の挙動。
 */
export function simulateTimeline(
  segments: readonly Segment[],
  startPercent: number,
  overheadSec: number,
  startDecayProgressMin = 0,
  spec: GaugeSpec = GAUGE_SPEC
): TimelineResult {
  let internal = (Math.max(0, Math.min(100, startPercent)) / 100) * spec.max;
  let minute = 0;
  // 次の減少に向けて累積した休憩分（ブロックを跨いで繰り越す）。
  // 開始時点で進んでいるぶんを引き継ぐ（途中参加）。30ちょうどは「いま減る」なので許す。
  let decayProgress = Math.max(0, Math.min(DECAY_INTERVAL_MIN, startDecayProgressMin));
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
    let segMinutes = 0;

    if (seg.kind === "play") {
      // プレイ中は減少タイマー停止（decayProgress は据え置き＝繰り越し）。
      const secPerPlay = playSeconds(seg.songLengthSec, overheadSec);
      const target = targetPercentOf(seg);
      segMinutes =
        target == null
          ? seg.minutes
          : minutesToTarget(
              internal,
              target,
              seg.refreshConstant,
              seg.songLengthSec,
              overheadSec,
              spec
            );
      plays = secPerPlay > 0 ? (segMinutes * 60) / secPerPlay : 0;
      const per = liveGaugeInternal(seg.refreshConstant, spec);
      const effective = per > 0 ? Math.max(0, (spec.max - internal) / per) : plays;
      // 目標%は100%以下なので、ゲージ%で決めたブロックにムダは出ない（浮動小数の端数も拾わない）。
      wasted = target == null ? Math.max(0, plays - effective) : 0;
      wastedMin = (wasted * secPerPlay) / 60;
      internal = Math.min(spec.max, internal + plays * per);
      // 逆算した時間で積むと、浮動小数の端数で 99.99999…% になる。ちょうど目標で終える。
      if (target != null && segMinutes > 0) internal = internalFromPercent(target, spec);
      minute += segMinutes;
      totalPlays += plays;
      totalWasted += wasted;
      totalWastedMinutes += wastedMin;
    } else if (seg.kind === "mysekai") {
      // マイセカイ採取も活動＝減少タイマー停止（progress据え置き＝繰り越し）。
      // ゲージは 700/スタミナ（双葉は別枠だがUIではメモリ入力に集約）。
      internal = Math.min(
        spec.max,
        internal + mySekaiGaugeInternal(mysekaiMemoriOf(seg) * spec.staminaPerMemori, 0, spec)
      );
      segMinutes = Math.max(0, seg.minutes);
      minute += segMinutes;
    } else {
      const target = targetPercentOf(seg);
      if (target == null) {
        // 休憩: 進捗を繰り越し加算し、30分ごとに減少。
        segMinutes = Math.max(0, seg.minutes);
        decayProgress += segMinutes;
        while (decayProgress >= DECAY_INTERVAL_MIN) {
          decayProgress -= DECAY_INTERVAL_MIN;
          internal = Math.max(0, internal - spec.decayPer30min);
        }
      } else {
        // ゲージで決める休憩: 目標以下になる段まで休み、段が下がった瞬間に止める（タイマーは 0 から）。
        // 0 分（目標が今以上）のときは何もしない。進捗 30（次の回復まで 0 分）でも段を下げない。
        const r = restMinutesToTarget(internal, target, decayProgress, spec);
        segMinutes = r.minutes;
        if (r.ticks > 0) {
          internal = Math.max(0, internal - r.ticks * spec.decayPer30min);
          decayProgress = 0;
        }
      }
      minute += segMinutes;
    }

    points.push({
      segment: seg,
      startMinute,
      endMinute: minute,
      minutes: segMinutes,
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
