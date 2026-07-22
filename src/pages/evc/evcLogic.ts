/**
 * スキル実効値計算のロジック（純関数）。UIから分離してテスト可能にする。
 * 現行 vanilla 版（legacy evc_script.js）の仕様は docs/porting/02-evc.md 参照。
 */

/** 全角数字を半角化してから数値化する。空/非数値は null。 */
export function toHalfWidthNumber(raw: string): number | null {
  const half = (raw ?? "").replace(/[０-９．]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
  const cleaned = half.trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 順方向: 実効値 = round(先頭 + (内部 - 先頭) × 0.2)。 */
export function effectiveValue(leaderSkill: number, innerValue: number): number {
  return Math.round(leaderSkill + (innerValue - leaderSkill) * 0.2);
}

/** 逆算: 内部値 = ((実効値 - 先頭) / 0.2) + 先頭。 */
export function innerValueFromEffective(effective: number, leaderSkill: number): number {
  return (effective - leaderSkill) / 0.2 + leaderSkill;
}
