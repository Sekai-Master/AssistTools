/**
 * 大量のプラン候補から「おすすめ」を数件選ぶ。
 *
 * 選定の考え方は「編成し直しやすいボーナス値を優先する」。
 * 25%刻み（キャラ/属性ボーナスの単位）が最も組みやすく、次に5%刻み、その他が最後。
 *
 * 並び順は用途で変わるので比較関数を受け取る:
 *   - ライブ端数調整: ボーナスが高い順（編成を崩す量が少ない）
 *   - ラストラン: 現在のボーナスに近い順
 */
export interface PlanLike {
  bonus: number;
  /** 必要スコアの下限。ボーナスが同値のときの優先順位に使う */
  minScore: number;
}

/** 25%刻み > 5%刻み > その他 の優先度グループに分ける。 */
function tierOf(bonus: number): 0 | 1 | 2 {
  // bonus は 0.5 刻みを取りうる。0.5 と 1.0 は二進で厳密に表せるため剰余の誤差は出ない。
  if (bonus % 25 === 0) return 0;
  if (bonus % 5 === 0) return 1;
  return 2;
}

export function recommendPlans<T extends PlanLike>(
  plans: readonly T[],
  compare: (a: T, b: T) => number,
  limit = 4
): T[] {
  const tiers: T[][] = [[], [], []];
  for (const plan of plans) {
    tiers[tierOf(plan.bonus)].push(plan);
  }
  // 「その他」を必ず最後に連結する。ここを落とすと、候補が 0.5% 刻みしか無いときに
  // プランが存在するのにおすすめが1件も出ない、という状態になる。
  return tiers.flatMap((tier) => [...tier].sort(compare)).slice(0, limit);
}

// ボーナスが同値のときは必要スコアが低いほうを優先する。
// タイブレークを入れないと Array.prototype.sort の安定性により push 順（消費ライブボーナスの昇順）が
// 残り、「消費が少ない＝必要スコアが高い」案が常に先頭に来てしまう。
// 同じ編成に組み替える手間は同じなのに、エンヴィーのソロでは出せない
// 200万点を要求する案が推奨され、1個多く炊けば済む案が下に隠れる。

/** ボーナスが高い順。同値なら必要スコアが低い順。 */
export const byBonusDesc = <T extends PlanLike>(a: T, b: T): number =>
  b.bonus - a.bonus || a.minScore - b.minScore;

/** 指定ボーナスに近い順。同値なら必要スコアが低い順。 */
export const byDistanceTo =
  <T extends PlanLike>(target: number) =>
  (a: T, b: T): number =>
    Math.abs(a.bonus - target) - Math.abs(b.bonus - target) || a.minScore - b.minScore;
