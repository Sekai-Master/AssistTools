/**
 * スキル実効値計算のロジック（純関数）。UIから分離してテスト可能にする。
 * 現行 vanilla 版（legacy evc_script.js）の仕様は docs/porting/02-evc.md 参照。
 * 定数・計算式はすべて現行実装から移植。
 */

export type SkillLevel = 1 | 2 | 3 | 4;

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

/** 特訓後の基礎スキル値（Lv1=90, Lv2=95, Lv3=100, Lv4=110）。 */
export function baseSkillValueTrained(lv: SkillLevel): number {
  return { 1: 90, 2: 95, 3: 100, 4: 110 }[lv] ?? 110;
}

/** バーチャルシンガー特訓前の基礎スキル値（Lv1=70, Lv2=75, Lv3=80, Lv4=90）。 */
export function baseSkillValueVS(lv: SkillLevel): number {
  return { 1: 70, 2: 75, 3: 80, 4: 90 }[lv] ?? 90;
}

/** オリジナルキャラクター特訓前の基礎スキル値（Lv1=60, Lv2=65, Lv3=70, Lv4=80）。 */
export function baseSkillValueOC(lv: SkillLevel): number {
  return { 1: 60, 2: 65, 3: 70, 4: 80 }[lv] ?? 80;
}

/** OC特訓前のスキル値上限（Lv1=120, Lv2=130, Lv3=140, Lv4=150）。 */
export function skillValueLimitOC(lv: SkillLevel): number {
  return [120, 130, 140, 150][lv - 1] ?? 150;
}

/** 特訓後の発動スキル値 = base + floor(min(rank,100) / 2)。 */
export function trainedSkillValue(lv: SkillLevel, characterRank: number): number {
  const rank = Math.min(Math.max(0, characterRank), 100);
  return baseSkillValueTrained(lv) + Math.floor(rank / 2);
}

/** VS特訓前の発動スキル値 = baseVS + 30 * min(非VSユニット数, 2)。 */
export function vsSkillValue(lv: SkillLevel, nonVsUnitCount: number): number {
  return baseSkillValueVS(lv) + 30 * Math.min(Math.max(0, nonVsUnitCount), 2);
}

/**
 * OC特訓前の発動スキル値候補。2〜5枠それぞれの内部値について
 * min(baseOC + floor(inner/2), 上限) を計算し、値ごとの個数を集計する。
 */
export interface SkillCandidate {
  value: number;
  count: number;
}
export function ocSkillCandidates(lv: SkillLevel, innerSlots: number[]): SkillCandidate[] {
  const base = baseSkillValueOC(lv);
  const limit = skillValueLimitOC(lv);
  const counts = new Map<number, number>();
  for (const inner of innerSlots) {
    const v = Math.min(base + Math.floor(inner / 2), limit);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  // 挿入順（＝値の出現順）を保つ
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

/** 候補を「150 or 140(2)」形式に整形（count>1のときだけ個数を括弧書き）。 */
export function formatCandidates(cands: SkillCandidate[]): string {
  return cands
    .map((c) => (c.count > 1 ? `${c.value}(${c.count})` : `${c.value}`))
    .join(" or ");
}

/** 順方向: 実効値 = round(先頭 + (内部 - 先頭) × 0.2)。 */
export function effectiveValue(leaderSkill: number, innerValue: number): number {
  return Math.round(leaderSkill + (innerValue - leaderSkill) * 0.2);
}

/** 逆算: 内部値 = ((実効値 - 先頭) / 0.2) + 先頭。 */
export function innerValueFromEffective(effective: number, leaderSkill: number): number {
  return (effective - leaderSkill) / 0.2 + leaderSkill;
}

/** 逆算の判定結果。 */
export type ReverseVerdict =
  | { kind: "value"; inner: number; bulfes: boolean }
  | { kind: "recheck" } // 内部値が先頭未満（あり得ない）
  | { kind: "none" }; // 上限超過で該当なし

/**
 * 逆算1件の判定。範囲は現行実装踏襲：
 *  inner < leader          → 実効値を再確認
 *  inner > leader+640      → 該当なし
 *  leader+600 < inner ≤ +640 → ブルフェス個体を含む注記
 */
export function reverseVerdict(effective: number, leaderSkill: number): ReverseVerdict {
  const inner = innerValueFromEffective(effective, leaderSkill);
  if (inner < leaderSkill) return { kind: "recheck" };
  if (inner > leaderSkill + 640) return { kind: "none" };
  return { kind: "value", inner, bulfes: inner > leaderSkill + 600 };
}

/** 逆算で先頭スキル値未指定のとき一覧表示する代表値（現行の並び順を踏襲、末尾160）。 */
export const REVERSE_DEFAULT_LEADERS = [150, 140, 130, 120, 110, 100, 160] as const;
