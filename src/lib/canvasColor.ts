/**
 * CSS の色を canvas が読める形に直す。
 *
 * ★★ **canvas は CSS の関数記法を解釈できない。** ★★
 * このサイトのユニット色は明暗の切り替えのために `light-dark(#88dd44, #9ee85c)` の形で
 * 定義してある。`getComputedStyle(el).getPropertyValue("--unit-color")` が返すのも
 * **この文字列のまま**で、canvas に渡しても解決されない。
 *
 * しかも `ctx.fillStyle = "light-dark(...)"` は **例外を投げずに黙って無視される**。
 * 直前の色（＝本文の黒）で描き続けるので、**色が抜けた画像が何ごともなく出てくる**。
 * 2026-08-01 の明暗テーマ導入から、周回プラン・必要稼働時間・アナライザーの
 * 画像出力がずっとこの状態だった（2026-08-21 に Nori が「ツールの色と乖離してない？」と気付いた）。
 * 編成ビルダーだけは `addColorStop` が例外を投げる書き方だったので早期に発覚し、
 * この関数の元になった対処が入っていた。**画像に色を出すときは必ずここを通す。**
 */

/**
 * canvas の fillStyle が読める形か。
 * ★ `light-dark(...)` や `color-mix(...)` は**投げずに無視される**ので、
 *   ここで弾いて既定色へ倒す。無視されると直前の色（本文の黒）のまま描き続ける。
 */
export function isCanvasColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (/^#[0-9a-f]{3,8}$/.test(v)) return true;
  if (/^(rgb|rgba|hsl|hsla)\([^()]*\)$/.test(v)) return true;
  // transparent / red / currentcolor など、括弧を持たない名前
  return /^[a-z]+$/.test(v);
}
export function resolveColor(
  source: Element | null,
  value: string,
  fallback = "#884499",
): string {
  if (typeof document === "undefined") return fallback;
  // ★ 空文字は「未設定」であって色ではない。探りに入れると継承された黒が返り、
  //   まさに避けたい「黙って黒」になる。
  if (!value.trim()) return fallback;
  // ブラウザに一度解決させて、計算済みの rgb(...) を読む。
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  (source?.parentElement ?? document.body).appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  // ★ 解決できたように見えて canvas が読めない値なら既定へ倒す。
  //   素通しすると、また黙って色が消える。
  return isCanvasColor(resolved) ? resolved.trim() : fallback;
}

/* ── 画像の中で「文字として」使える色にする ───────────────────── */

/** `#rgb` / `#rrggbb` / `rgb(...)` を 0–255 の3値へ。読めなければ null。 */
function toRgb(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (x) => x + x) : hex[1];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (p.length >= 3 && p.slice(0, 3).every((v) => Number.isFinite(v))) {
      return [p[0], p[1], p[2]];
    }
  }
  return null;
}

const srgb = (v: number) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

/** WCAG の相対輝度。 */
export function luminance(color: string): number {
  const rgb = toRgb(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(srgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG のコントラスト比（1〜21）。 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * 背景に対して読める濃さまで暗くした色を返す。
 *
 * ★★ **画像の中の数字はユニット色そのままでは読めないことがある。** ★★
 * MORE MORE JUMP! の緑 `#88dd44` は書き出し画像の地（`#f0f0f0`）に対して約1.7:1 で、
 * 到達ポイントのような**一番読ませたい数字**が最初に潰れる。
 * ユニット色は不可侵なので、**色相はそのままに明度だけ落とす**（黒へ寄せる）。
 * すでに十分なら何もしない ── 濃い色まで一律に暗くすると別物になる。
 */
export function ensureContrast(
  color: string,
  bg = "#f0f0f0",
  min = 4.5,
): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  // 足りているなら**受け取った文字列のまま返す**（形式を勝手に変えない）。
  if (contrastRatio(color, bg) >= min) return color;
  let [r, g, b] = rgb;
  // 1回あたり 6% ずつ黒へ寄せる。40回で実質黒になるので必ず止まる。
  for (let i = 0; i < 40; i++) {
    if (
      contrastRatio(
        `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`,
        bg,
      ) >= min
    )
      break;
    r *= 0.94;
    g *= 0.94;
    b *= 0.94;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
