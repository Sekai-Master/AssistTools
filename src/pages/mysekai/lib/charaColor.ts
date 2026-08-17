/**
 * メンバーカラーを、白文字が読める濃さまで沈める。
 *
 * ★ **生のメンバーカラーに白文字を載せてはいけない。** 26色のうち25色は白との
 *   コントラストが 4.5:1 未満で、鏡音レン(#ffee11)は 1.20:1——10px では物理的に読めない
 *  （2026-08-18 実測）。明るい色に黒文字を置く手も試したが、中間明度の12色が
 *   白でも黒でも 4.5:1 に届かなかったので、**色相を保ったまま暗くする**方を採る。
 *
 * ★ これは既存ツールと同じ判断。`useRankingMusics.ts` の難易度色にも
 *  「白抜き文字を載せる前提なので、原色より少し沈めて可読性を取っている」とある。
 *
 * ★ `index.css` は淡いユニットカラーに白文字を載せる箇所で必ず
 *   `text-shadow: 0 1px 2px rgba(0,0,0,0.38)` を添えている（`.neu-cta` / `.neu-selected` /
 *   `.unit-title`）。影は輪郭を締めるだけで比そのものは上げないので、両方やる。
 */

/** 小さい文字に載せる前提なので、AA（4.5:1）を目標にする。 */
const TARGET_RATIO = 4.5;

function parse(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(rgb: [number, number, number]): number {
  const ch = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** 白（輝度1）に対するコントラスト比。 */
const ratioToWhite = (l: number): number => 1.05 / (l + 0.05);

const toHex = (rgb: [number, number, number]): string =>
  "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/**
 * 白文字が AA を満たすまで暗くした色を返す。
 * 各チャンネルに同じ係数を掛けるので**色相はほぼ保たれる**（キャラの見分けが付く）。
 * 既に条件を満たす色はそのまま返す。
 */
export function chipBg(color: string): string {
  const rgb = parse(color);
  if (!rgb) return "var(--unit-color)";
  if (ratioToWhite(luminance(rgb)) >= TARGET_RATIO) return color;

  // 二分探索。40回も回せば 1/2^40 まで詰まるが、実用上は 20 回で十分。
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const scaled: [number, number, number] = [rgb[0] * mid, rgb[1] * mid, rgb[2] * mid];
    if (ratioToWhite(luminance(scaled)) >= TARGET_RATIO) lo = mid;
    else hi = mid;
  }
  return toHex([rgb[0] * lo, rgb[1] * lo, rgb[2] * lo]);
}

/** 白文字の輪郭を締める影。小さい字の可読性を上げる。 */
export const CHIP_SHADOW = "0 1px 2px rgba(0,0,0,0.38)";
