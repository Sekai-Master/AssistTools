/**
 * リフレッシュゲージ（イベント休憩システム）の純モデル。2026-03-10 仕様。
 * 根拠と実測は docs/refresh-gauge/measurements.md（実測8曲で軌道検証済み）。
 *
 * 係数は過去に変更履歴あり（2/28→3/10）。仕様が動いたら GAUGE_SPEC を差し替え、
 * version を更新すること（表示・計算は全てこの定数を参照する）。
 */

export interface GaugeSpec {
  version: string;
  /** 内部MAX = 画面100% */
  max: number;
  /** ライブ1回の内部増加 = リフレッシュ定数 × liveCoef */
  liveCoef: number;
  /** マイセカイ通常素材: スタミナ1消費あたりの内部増加 */
  mySekaiMaterial: number;
  /** マイセカイ双葉: 1本あたりの内部増加 */
  mySekaiFutaba: number;
  /**
   * 画面のスタミナ1メモリ(目盛り)＝内部スタミナ何個ぶんか。
   * 攻略記事の採取コスト（最小0.2メモリ）とTomo式（700/スタミナ）を噛み合わせると、
   * 0.2メモリ＝ちょうど1スタミナになる比＝5が最も整合する（強い推測。実測で要確認）。
   */
  staminaPerMemori: number;
  /** 非活動が累計30分に到達するごとの内部減少量 */
  decayPer30min: number;
}

export const GAUGE_SPEC: GaugeSpec = {
  version: "2026-03-10",
  max: 6_600_000,
  liveCoef: 157,
  mySekaiMaterial: 700,
  mySekaiFutaba: 250,
  staminaPerMemori: 5,
  decayPer30min: 550_000,
};

/** 内部値 → 画面表示%（小数第2位切り捨て＝1桁）。 */
export function toDisplayPercent(internal: number, spec: GaugeSpec = GAUGE_SPEC): number {
  const clamped = Math.max(0, Math.min(spec.max, internal));
  return Math.floor((clamped / spec.max) * 1000) / 10;
}

/** ライブ1回の内部増加量。 */
export function liveGaugeInternal(refreshConstant: number, spec: GaugeSpec = GAUGE_SPEC): number {
  return refreshConstant * spec.liveCoef;
}

/** ライブ1回の増加（実数%、切り捨て前）。 */
export function liveGaugePercent(refreshConstant: number, spec: GaugeSpec = GAUGE_SPEC): number {
  return (liveGaugeInternal(refreshConstant, spec) / spec.max) * 100;
}

/** マイセカイ採取の内部増加（消費スタミナ数・双葉本数から）。 */
export function mySekaiGaugeInternal(
  stamina: number,
  futaba: number,
  spec: GaugeSpec = GAUGE_SPEC
): number {
  return stamina * spec.mySekaiMaterial + futaba * spec.mySekaiFutaba;
}

/** マイセカイ採取の内部増加（画面表示のメモリ数から）。1メモリ = staminaPerMemori スタミナ。 */
export function mySekaiGaugeFromMemori(memori: number, spec: GaugeSpec = GAUGE_SPEC): number {
  return mySekaiGaugeInternal(Math.max(0, memori) * spec.staminaPerMemori, 0, spec);
}

/**
 * 非活動 restMinutes 分での内部減少量。
 * 「累計30分に到達するごと」なので30分未満の端数は減らない（30分ブロック単位）。
 */
export function decayInternal(restMinutes: number, spec: GaugeSpec = GAUGE_SPEC): number {
  if (restMinutes <= 0) return 0;
  return Math.floor(restMinutes / 30) * spec.decayPer30min;
}

/** 100%（続行不可）到達までにその曲を叩ける回数。現在ゲージ(内部)から。 */
export function playsToFull(
  refreshConstant: number,
  currentInternal = 0,
  spec: GaugeSpec = GAUGE_SPEC
): number {
  const remaining = spec.max - currentInternal;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / liveGaugeInternal(refreshConstant, spec));
}

/** n回叩いた後の内部ゲージ（MAXでクランプ）。 */
export function gaugeAfterPlays(
  refreshConstant: number,
  plays: number,
  currentInternal = 0,
  spec: GaugeSpec = GAUGE_SPEC
): number {
  return Math.min(spec.max, currentInternal + Math.max(0, plays) * liveGaugeInternal(refreshConstant, spec));
}

/** 100%からの全回復に要する分（= 6時間）。 */
export function fullRecoveryMinutes(spec: GaugeSpec = GAUGE_SPEC): number {
  return Math.ceil(spec.max / spec.decayPer30min) * 30;
}
