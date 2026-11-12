/**
 * 今の値と既定値の組のうち、違うものを数える（「詳しく計算する」の見出しに出す数）。
 * 文字は前後の空白を除いて比べる（入力欄の空白だけの違いは変えたことにしない）。
 */
export function countChanged(pairs: ReadonlyArray<readonly [unknown, unknown]>): number {
  const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  return pairs.filter(([now, def]) => !Object.is(norm(now), norm(def))).length;
}
