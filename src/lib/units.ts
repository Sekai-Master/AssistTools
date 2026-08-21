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

/**
 * ユニット色の帯に載せる文字色。
 *
 * ★ **MORE MORE JUMP! の緑だけは白文字が読めない。** #88dd44 に白は約1.9:1 で、
 *   4.5:1 どころか大きな文字の 3:1 にも届かない。ユニット色そのものは不可侵
 *  （docs/porting/design.md）なので、**色ではなく載せる文字の側を変える**。
 *   影も要らない ── 暗い文字に黒い影を敷いても輪郭が濁るだけ。
 */
export const UNIT_TITLE_INK: Record<UnitKey, { ink: string; shadow: string }> =
  {
    vs: { ink: "#fff", shadow: "0 1px 2px rgba(0,0,0,0.32)" },
    ln: { ink: "#fff", shadow: "0 1px 2px rgba(0,0,0,0.32)" },
    mmj: { ink: "#1d3b06", shadow: "none" },
    vbs: { ink: "#fff", shadow: "0 1px 2px rgba(0,0,0,0.32)" },
    wxs: { ink: "#fff", shadow: "0 1px 2px rgba(0,0,0,0.32)" },
    n25: { ink: "#fff", shadow: "0 1px 2px rgba(0,0,0,0.32)" },
  };
