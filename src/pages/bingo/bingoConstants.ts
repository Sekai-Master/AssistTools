import type { UnitKey } from "../../lib/units";

/** transformedMusics の Unit 文字列 → 表示ラベル＋テーマ用ユニットキー。 */
export const UNIT_OPTIONS: { value: string; label: string; unit?: UnitKey }[] = [
  { value: "0_VS", label: "VS", unit: "vs" },
  { value: "1_L/n", label: "L/n", unit: "ln" },
  { value: "2_MMJ", label: "MMJ", unit: "mmj" },
  { value: "3_VBS", label: "VBS", unit: "vbs" },
  { value: "4_WxS", label: "WxS", unit: "wxs" },
  { value: "5_25", label: "25時", unit: "n25" },
  { value: "9_oth", label: "その他" },
];

export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "mv_3d", label: "3D MV" },
  { value: "mv_2d", label: "2D MV" },
  { value: "original", label: "オリジナル" },
  { value: "image", label: "イメージ" },
];

export const TYPE_OPTIONS: { value: boolean; label: string }[] = [
  { value: false, label: "既存曲" },
  { value: true, label: "書き下ろし" },
];

export const ALL_UNIT_VALUES = UNIT_OPTIONS.map((o) => o.value);
export const ALL_CATEGORY_VALUES = CATEGORY_OPTIONS.map((o) => o.value);
export const ALL_TYPE_VALUES = TYPE_OPTIONS.map((o) => o.value);
