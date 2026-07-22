/** プロセカ6ユニットのキー。各ツールページのテーマ色に使う。 */
export type UnitKey = "vs" | "ln" | "mmj" | "vbs" | "wxs" | "n25";

/** ユニットキー → CSS変数（index.css の @theme で定義済み）。 */
export const UNIT_COLOR_VAR: Record<UnitKey, string> = {
  vs: "var(--color-vs)",
  ln: "var(--color-ln)",
  mmj: "var(--color-mmj)",
  vbs: "var(--color-vbs)",
  wxs: "var(--color-wxs)",
  n25: "var(--color-n25)",
};

export const UNIT_LABEL: Record<UnitKey, string> = {
  vs: "VIRTUAL SINGER",
  ln: "Leo/need",
  mmj: "MORE MORE JUMP!",
  vbs: "Vivid BAD SQUAD",
  wxs: "ワンダーランズ×ショウタイム",
  n25: "25時、ナイトコードで。",
};
