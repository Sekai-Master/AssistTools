/**
 * @vitest-environment jsdom
 *
 * ★ ここで守りたいのは「canvas が読めない文字列を素通ししない」こと。
 *   通すと例外は出ず、**色が抜けた画像が黙って出てくる**（実際に3ツールで起きていた）。
 */
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  ensureContrast,
  isCanvasColor,
  resolveColor,
} from "./canvasColor";

describe("resolveColor", () => {
  it("ふつうの色は解決して返す", () => {
    expect(resolveColor(null, "#ff9900")).toBe("rgb(255, 153, 0)");
  });

  /**
   * ★ `var(--unit-color)` や `light-dark()` の解決はブラウザの仕事で、jsdom では再現しない
   *  （実ブラウザで /plan・/worktime・/analyzer の書き出しを見て確認した 2026-08-21）。
   *   ここでは「解決した結果を通してよいか」の判定だけを固定する。
   */
  it("解決できない値は既定に倒す（黒で描き続けない）", () => {
    expect(resolveColor(null, "", "#123456")).toBe("#123456");
  });
});

describe("isCanvasColor — canvas が黙って無視する形を弾く", () => {
  it("読める形は通す", () => {
    for (const v of [
      "#abc",
      "#4455dd",
      "#4455ddcc",
      "rgb(1, 2, 3)",
      "rgba(1,2,3,.5)",
      "hsl(10 20% 30%)",
      "red",
      "transparent",
    ]) {
      expect(isCanvasColor(v), v).toBe(true);
    }
  });

  /** ★ この2つが本題。例外を投げないので、通すと色が抜けた画像が黙って出る。 */
  it("CSS の関数記法は弾く", () => {
    for (const v of [
      "light-dark(#88dd44, #9ee85c)",
      "color-mix(in srgb, red 50%, blue)",
      "var(--unit-color)",
      "",
    ]) {
      expect(isCanvasColor(v), v).toBe(false);
    }
  });

  it("探り用の要素を残さない", () => {
    const before = document.body.childElementCount;
    resolveColor(null, "#000");
    expect(document.body.childElementCount).toBe(before);
  });
});

describe("ensureContrast — 画像の中の数字が読める濃さになる", () => {
  const BG = "#f0f0f0";

  /**
   * ★★ これが動機。**6ユニット色のうち4つが、書き出し画像の地では読めない。**
   *   VS 1.76 / MMJ 1.48 / WxS 1.88 / VBS 3.75（2026-08-21 実測）。
   *   MMJ を「計画」に割り当てたことで目立ったが、元から全ツールで起きていた。
   */
  it("地に対して弱いユニット色は 4.5:1 まで落とす", () => {
    for (const c of ["#33ccbb", "#88dd44", "#ff9900", "#ee1166"]) {
      expect(contrastRatio(c, BG), c).toBeLessThan(4.5);
      expect(
        contrastRatio(ensureContrast(c, BG), BG),
        c,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("もともと十分な色は1文字も変えない", () => {
    for (const c of ["#4455dd", "#884499"]) {
      expect(contrastRatio(c, BG), c).toBeGreaterThanOrEqual(4.5);
      expect(ensureContrast(c, BG)).toBe(c);
    }
  });

  it("色相は残る（緑は緑のまま）", () => {
    const out = ensureContrast("#88dd44", BG);
    const [r, g, b] = out.match(/\d+/g)!.map(Number);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("rgb() でも受け取れる", () => {
    expect(
      contrastRatio(ensureContrast("rgb(136, 221, 68)", BG), BG),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("読めない値はそのまま返す（描画側で既定に倒れる）", () => {
    expect(ensureContrast("light-dark(#88dd44, #9ee85c)")).toBe(
      "light-dark(#88dd44, #9ee85c)",
    );
  });
});
