/**
 * ダイヤル（Dial.tsx）の角度の計算。画面に依らない部分だけをここに置いて試験する。
 *
 * 角度は真上を 0°、時計回りを正にとる。目盛りは下に 60° の切れ目を残した 300°（左下が最小、右下が最大）。
 */
export const DIAL_SWEEP_DEG = 300;
const HALF = DIAL_SWEEP_DEG / 2;

/**
 * 回している途中に、1 回の移動でこれより大きく向きが変わったら「跳び」とみなす。
 * ふつうに回すぶんには 1 回の移動は数度。跳びは、中心をまたいだとき（向きがほぼ反転する）か、素早く振ったとき。
 */
export const DIAL_JUMP_DEG = 90;

/** 値 → 角度（-150°〜+150°）。 */
export function dialAngle(value: number, min: number, max: number): number {
  const t = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
  return -HALF + t * DIAL_SWEEP_DEG;
}

/** 円の中心からのずれ（画面の座標なので下が +dy）→ 向き（-180°〜+180°）。 */
export function dialAngleOfPoint(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** その向きにある整数の値。下の切れ目の中は null。 */
export function dialValueAt(deg: number, min: number, max: number): number | null {
  if (deg < -HALF || deg > HALF) return null;
  return min + Math.round(((deg + HALF) / DIAL_SWEEP_DEG) * (max - min));
}

/**
 * 回している途中の状態。
 * - value: 出している値
 * - angle: ひとつ前の指の向き
 * - held: 値を止めているか。止めている間は指を追わず、指が値の所へ戻ってきたら（±1 か、値をまたいだら）また追う
 */
export interface DialDrag {
  value: number;
  angle: number;
  held: boolean;
}

/** 押した瞬間。押した向きの値。切れ目を押したら角度の近い端。 */
export function dialStart(deg: number, min: number, max: number): DialDrag {
  return { value: dialValueAt(deg, min, max) ?? (deg > 0 ? max : min), angle: deg, held: false };
}

/**
 * 回している途中の 1 回の移動。
 * - 切れ目に入る・切れ目を一度にまたぐ: 来た側の端で止める（30 を越えて回し込んでも 0 へ飛ばない）
 * - 跳び（DIAL_JUMP_DEG より大きく向きが変わった）: 前の値で止める（中心をまたぐ・素早く振っても 0 や 30 に化けない）
 * - それ以外: 指の向きの値
 */
export function dialMove(s: DialDrag, deg: number, min: number, max: number): DialDrag {
  const delta = ((((deg - s.angle) % 360) + 540) % 360) - 180;
  const keep = (value: number): DialDrag => ({ value, angle: deg, held: true });
  if (Math.abs(delta) > DIAL_JUMP_DEG) return keep(s.value);

  const here = dialValueAt(deg, min, max);
  const before = dialValueAt(s.angle, min, max);
  // 下の切れ目の真ん中（±180°）を通ったか
  const crossedBottom = Math.abs(s.angle + delta) > 180;

  if (s.held) {
    const back =
      here != null &&
      (Math.abs(here - s.value) <= 1 ||
        (!crossedBottom && before != null && Math.sign(before - s.value) !== Math.sign(here - s.value)));
    return back ? { value: here, angle: deg, held: false } : keep(s.value);
  }
  if (here == null || crossedBottom) {
    return keep(s.value - min < (max - min) / 2 ? min : max);
  }
  return { value: here, angle: deg, held: false };
}
