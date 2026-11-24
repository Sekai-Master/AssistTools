/**
 * ダイヤル（Dial.tsx）の角度の計算。画面に依らない部分だけをここに置いて試験する。
 *
 * 角度は真上を 0°、時計回りを正にとる。目盛りは下に 60° の切れ目を残した 300°（左下が最小、右下が最大）。
 */
export const DIAL_SWEEP_DEG = 300;
const HALF = DIAL_SWEEP_DEG / 2;

/** 値 → 角度（-150°〜+150°）。 */
export function dialAngle(value: number, min: number, max: number): number {
  const t = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
  return -HALF + t * DIAL_SWEEP_DEG;
}

/**
 * 指の位置（円の中心からのずれ。画面の座標なので下が +dy）→ 整数の値。
 *
 * prev は回している途中のひとつ前の値（押した瞬間は渡さない）。
 * - 下の切れ目に入ったら端に寄せる。回している途中は prev に近い端、押した瞬間は角度の近い端
 * - 回している途中に半周より大きく跳んだら（最大を越えて切れ目をまたぎ、最小の側へ回り込んだとき）、prev に近い端で止める
 */
export function dialValueFromPoint(
  dx: number,
  dy: number,
  min: number,
  max: number,
  prev?: number,
): number {
  const span = max - min;
  const nearEnd = (v: number) => (v - min < span / 2 ? min : max);
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  let v: number;
  if (deg < -HALF || deg > HALF) {
    v = prev != null ? nearEnd(prev) : deg > 0 ? max : min;
  } else {
    v = min + Math.round(((deg + HALF) / DIAL_SWEEP_DEG) * span);
  }
  if (prev != null && Math.abs(v - prev) > span / 2) v = nearEnd(prev);
  return v;
}
