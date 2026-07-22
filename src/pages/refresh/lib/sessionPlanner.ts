/**
 * 休憩を織り込んだ周回プランの核。時間モデル込み。
 *
 * リフレッシュゲージは「非活動が累計30分ごと」に減るので、走行中は減らない。
 * よって長時間マラソンでは「100%まで走る→休む」のサイクルになる。
 * その償却レート（持続可能な周回/時）と、現在ゲージからの走行可能量を出す。
 *
 * 前提: 1周回の所要時間 = 曲の長さ + オーバーヘッド（結果画面・選曲・マッチング等）。
 * オーバーヘッドはパラメータ（要実測チューニング）。根拠は docs/refresh-gauge/design.md。
 */
import { GAUGE_SPEC, type GaugeSpec, liveGaugeInternal } from "./gaugeModel";

/**
 * 1周回の所要時間 = 曲の長さ + オーバーヘッド。
 * オーバーヘッドは協力ライブのマッチング・結果画面・支援者交代・ロード等。
 * 実測(@Nori, エビ74.8s)基準: 理論32回/h→OH約38s、実測平均28回/h→OH約54s。
 * 環境で大きく変わるので、UIで実測レートから overheadFromRate() で較正する前提。
 */
export const OVERHEAD_PRESETS = {
  theoretical: 38, // エビ 約32回/h 相当
  realistic: 54, // エビ 約28回/h 相当（支援者交代・ロード込み）
} as const;

/** 既定は実測平均側（支援者交代・ロード込み）。 */
export const DEFAULT_OVERHEAD_SEC: number = OVERHEAD_PRESETS.realistic;

/** 1周回の実所要秒。 */
export function playSeconds(songLengthSec: number, overheadSec = DEFAULT_OVERHEAD_SEC): number {
  return songLengthSec + overheadSec;
}

/** 曲長とオーバーヘッドから周回ペース（回/時）。 */
export function playsPerHour(songLengthSec: number, overheadSec = DEFAULT_OVERHEAD_SEC): number {
  return 3600 / playSeconds(songLengthSec, overheadSec);
}

/**
 * 実測レート(回/時)と曲長から、その環境のオーバーヘッド秒を逆算する（キャリブレーション）。
 * 例: エビ(74.8s)を28回/h → OH = 3600/28 − 74.8 ≈ 53.8s。以後この OH を全曲に適用。
 */
export function overheadFromRate(measuredPlaysPerHour: number, songLengthSec: number): number {
  // 1周は曲長を下回れない。非現実的な高レート入力でオーバーヘッドが負にならないよう 0 でクランプ。
  return Math.max(0, 3600 / measuredPlaysPerHour - songLengthSec);
}

/** 現在ゲージ(内部)から、その曲を叩き続けて100%に達するまでの周回数と所要分。 */
export function runwayToFull(
  refreshConstant: number,
  songLengthSec: number,
  currentInternal = 0,
  overheadSec = DEFAULT_OVERHEAD_SEC,
  spec: GaugeSpec = GAUGE_SPEC
): { plays: number; minutes: number } {
  const per = liveGaugeInternal(refreshConstant, spec);
  const plays = Math.max(0, Math.ceil((spec.max - currentInternal) / per));
  const minutes = (plays * playSeconds(songLengthSec, overheadSec)) / 60;
  return { plays, minutes };
}

/** 1周回ぶんのゲージを相殺するのに必要な休憩分（償却）。 */
export function restMinutesPerPlay(refreshConstant: number, spec: GaugeSpec = GAUGE_SPEC): number {
  return (liveGaugeInternal(refreshConstant, spec) / spec.decayPer30min) * 30;
}

/**
 * ゲージ制約下で持続可能な周回ペース。
 * 走行時間＋償却休憩の合計で1周回にかかる実時間から算出する。
 * 「ゲージ無し」の理論ペースと比べて、どれだけ休憩に食われるかを可視化する。
 */
export function sustainableRate(
  refreshConstant: number,
  songLengthSec: number,
  overheadSec = DEFAULT_OVERHEAD_SEC,
  spec: GaugeSpec = GAUGE_SPEC
): { playsPerHour: number; theoreticalPerHour: number; restSharePercent: number } {
  const playMin = playSeconds(songLengthSec, overheadSec) / 60;
  const restMin = restMinutesPerPlay(refreshConstant, spec);
  const perPlayMin = playMin + restMin;
  return {
    playsPerHour: 60 / perPlayMin,
    theoreticalPerHour: 60 / playMin,
    restSharePercent: (restMin / perPlayMin) * 100,
  };
}

export interface SessionResult {
  /** ゲージ100%到達までに叩ける周回数 */
  runwayPlays: number;
  /** 100%到達までの所要分（連続走行） */
  runwayMinutes: number;
  /** 100%からの全回復に要する分（6時間） */
  fullRecoveryMinutes: number;
  /** 持続可能な周回/時（ゲージ制約込み） */
  sustainablePerHour: number;
  /** ゲージ無しの理論周回/時 */
  theoreticalPerHour: number;
  /** 実時間のうち休憩が占める割合(%) */
  restSharePercent: number;
}

/** 現在ゲージ・曲から、走行可能量と持続ペースをまとめて出す。 */
export function planSession(
  refreshConstant: number,
  songLengthSec: number,
  currentPercent = 0,
  overheadSec = DEFAULT_OVERHEAD_SEC,
  spec: GaugeSpec = GAUGE_SPEC
): SessionResult {
  const currentInternal = (Math.max(0, Math.min(100, currentPercent)) / 100) * spec.max;
  const runway = runwayToFull(refreshConstant, songLengthSec, currentInternal, overheadSec, spec);
  const rate = sustainableRate(refreshConstant, songLengthSec, overheadSec, spec);
  return {
    runwayPlays: runway.plays,
    runwayMinutes: runway.minutes,
    fullRecoveryMinutes: Math.ceil(spec.max / spec.decayPer30min) * 30,
    sustainablePerHour: rate.playsPerHour,
    theoreticalPerHour: rate.theoreticalPerHour,
    restSharePercent: rate.restSharePercent,
  };
}
