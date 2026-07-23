import { calcLivePt } from "./calcLivePt";
import { distinctBasePoints } from "./multiLiveAdjust";

/**
 * 「その残額はそもそも着地できるのか」の下限値。
 *
 * 調整ライブ1本で作れる最小Ptを下回る残額は、何本叩いても厳密一致しない。
 * このツールの価値は「1ptでもズレたら失敗」を防ぐことなので、これは機能ではなく
 * 正しさの前提（docs/point-adjust-step2-ux-brief.md 診断5）。
 *
 * 閾値はボーナス依存（990%・基礎点100 なら 1,090）なので必ず動的に計算する。
 * 固定値で書くと別ボーナスのユーザーに嘘の警告／見逃しを出す。
 */

/**
 * 現在ボーナスで1回のライブが生みうる最小Pt。
 *
 * calcLivePt は基礎点・スコア係数・ライブボーナス倍率のいずれにも単調非減少なので、
 * 「最小基礎点 × スコア0 × LB0」の1点が最小値になる（maxPtPerLive の導出と対称）。
 * 基礎点の正規化は distinctBasePoints に委ねるので、探索本体の minPtPerLive と
 * 常に一致する（landability.test.ts で不変条件として固定）。
 */
export function minAdjustablePt(bonus: number, basePoints: readonly number[]): number {
  const bases = distinctBasePoints(basePoints.map((basePoint) => ({ basePoint })));
  return calcLivePt(bases[0], bonus, 0, 0);
}
