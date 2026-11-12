/**
 * @vitest-environment jsdom
 *
 * ライトボックスの「画面に合わせる ⇔ 原寸」の切り替え（2026-11-12 運営者が検分 gate-256 の中 1 の案 (a) を選んだ）。
 *
 * jsdom にはレイアウトも画像の読み込みも無いので、画像の画素数（naturalWidth）・表示の大きさ（clientWidth）・
 * 位置（getBoundingClientRect）・枠の大きさを差し替えて縛る。実際の見え方は実ブラウザの撮影で確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ZoomableImage } from "./ImageLightbox";

/** 差し替える寸法。画像は画素数と表示の大きさ、枠（スクロールする箱）は見えている大きさ。 */
let natural = { w: 1200, h: 1000 };
let shown = { w: 600, h: 500, left: 100, top: 80 };
const viewport = { w: 800, h: 600 };
const scrolls = new WeakMap<Element, { left: number; top: number }>();

function defineGetter(proto: object, name: string, get: (this: HTMLElement) => number) {
  Object.defineProperty(proto, name, { configurable: true, get });
}

beforeEach(() => {
  natural = { w: 1200, h: 1000 };
  shown = { w: 600, h: 500, left: 100, top: 80 };
  defineGetter(HTMLImageElement.prototype, "naturalWidth", () => natural.w);
  defineGetter(HTMLImageElement.prototype, "naturalHeight", () => natural.h);
  // 全面表示の中の画像だけが表示の大きさを持つ（ページ側の画像は測らない）
  defineGetter(HTMLElement.prototype, "clientWidth", function () {
    if (this.dataset.lightboxScroll !== undefined) return viewport.w;
    return this.tagName === "IMG" ? shown.w : 0;
  });
  defineGetter(HTMLElement.prototype, "clientHeight", function () {
    if (this.dataset.lightboxScroll !== undefined) return viewport.h;
    return this.tagName === "IMG" ? shown.h : 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.tagName !== "IMG") return new DOMRect(0, 0, 0, 0);
    return new DOMRect(shown.left, shown.top, shown.w, shown.h);
  });
  for (const name of ["scrollLeft", "scrollTop"] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return scrolls.get(this)?.[name === "scrollLeft" ? "left" : "top"] ?? 0;
      },
      set(this: HTMLElement, v: number) {
        const cur = scrolls.get(this) ?? { left: 0, top: 0 };
        scrolls.set(this, name === "scrollLeft" ? { ...cur, left: v } : { ...cur, top: v });
      },
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const name of ["naturalWidth", "naturalHeight"]) delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)[name];
  for (const name of ["clientWidth", "clientHeight", "scrollLeft", "scrollTop"]) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  document.body.removeAttribute("style");
});

function openLightbox() {
  render(<ZoomableImage src="/images/a.webp" alt="告知の画像" width={1200} height={1000} title="v1.32.0 の告知画像" />);
  fireEvent.click(screen.getByRole("button", { name: /拡大して表示/ }));
  const dialog = screen.getByRole("dialog");
  const img = dialog.querySelector("img")!;
  // 読み込みが終わったところで、原寸の方が大きいかを測る
  fireEvent.load(img);
  return { dialog, img };
}

const zoomButton = (name: RegExp | string) => screen.queryByRole("button", { name });
const scrollBox = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>("[data-lightbox-scroll]")!;

describe("ライトボックスの原寸の切り替え", () => {
  it("原寸の方が大きい画像では「原寸で見る」を出し、押すと原寸、もう一度で画面に合わせるに戻る", () => {
    const { img } = openLightbox();
    expect(img.dataset.zoom).toBe("fit");
    fireEvent.click(zoomButton("原寸で見る")!);
    expect(img.dataset.zoom).toBe("actual");
    // 原寸は画像の画素数のまま出す（枠に合わせて縮めない）
    expect(img.style.width).toBe("1200px");
    expect(img.style.height).toBe("1000px");
    expect(zoomButton("原寸で見る")).toBeNull();
    fireEvent.click(zoomButton("画面に合わせる")!);
    expect(img.dataset.zoom).toBe("fit");
    expect(img.style.width).toBe("");
  });

  it("切り替えのボタンは押せる大きさ（44px）以上で、閉じるボタンと並ぶ", () => {
    openLightbox();
    const classes = zoomButton("原寸で見る")!.className.split(" ");
    expect(classes).toContain("min-h-11");
    expect(classes).toContain("min-w-11");
    expect(zoomButton("原寸で見る")!.parentElement).toBe(screen.getByRole("button", { name: "閉じる" }).parentElement);
  });

  it("画像を押しても切り替わる。押した位置が画面の中央付近に来るよう、最初のスクロールを合わせる", () => {
    const { dialog, img } = openLightbox();
    // 表示 600×500 の画像の、左から 3/4・上から 4/5 の所を押す
    fireEvent.mouseDown(img);
    fireEvent.click(img, { clientX: shown.left + 450, clientY: shown.top + 400 });
    expect(img.dataset.zoom).toBe("actual");
    const box = scrollBox(dialog);
    // 原寸 1200×1000 での同じ所は (900, 800)。枠 800×600 の中央に来るように左上を合わせる
    expect(box.scrollLeft).toBe(900 - viewport.w / 2);
    expect(box.scrollTop).toBe(800 - viewport.h / 2);
    // 原寸の画像を押すと戻る。どちらでも閉じない
    fireEvent.mouseDown(img);
    fireEvent.click(img);
    expect(img.dataset.zoom).toBe("fit");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("ボタン（キーボード）で原寸にしたときは、画像の真ん中を画面の中央に合わせる", () => {
    const { dialog } = openLightbox();
    const button = zoomButton("原寸で見る")!;
    button.focus();
    fireEvent.click(button);
    const box = scrollBox(dialog);
    expect(box.scrollLeft).toBe(600 - viewport.w / 2);
    expect(box.scrollTop).toBe(500 - viewport.h / 2);
    // 切り替えたあともフォーカスはボタンに残る（名前が「画面に合わせる」に変わる）
    expect(document.activeElement).toBe(zoomButton("画面に合わせる"));
  });

  it("原寸のときは、画像の枠がキーボードでも動かせる（Tab で止まり、矢印で送れる）", () => {
    const { dialog } = openLightbox();
    expect(scrollBox(dialog).tabIndex).toBe(-1);
    fireEvent.click(zoomButton("原寸で見る")!);
    const box = scrollBox(dialog);
    expect(box.tabIndex).toBe(0);
    expect(box.getAttribute("aria-label")).toMatch(/矢印/);
  });

  it("画像が画面より小さく、原寸にしても大きくならないときは、ボタンを出さず、押しても切り替えない", () => {
    natural = { w: 400, h: 300 };
    shown = { w: 400, h: 300, left: 200, top: 150 };
    const { img } = openLightbox();
    expect(zoomButton("原寸で見る")).toBeNull();
    fireEvent.mouseDown(img);
    fireEvent.click(img);
    expect(img.dataset.zoom).toBe("fit");
  });

  it("原寸のときも、背景（画像の外）を押せば閉じ、画像の上で押し始めて外で離したときは閉じない", () => {
    const { dialog, img } = openLightbox();
    fireEvent.click(zoomButton("原寸で見る")!);
    fireEvent.mouseDown(img);
    fireEvent.mouseUp(scrollBox(dialog));
    fireEvent.click(scrollBox(dialog));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(scrollBox(dialog));
    fireEvent.click(scrollBox(dialog));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc は原寸のときも閉じる。開き直すと画面に合わせるに戻っている", () => {
    const { img } = openLightbox();
    fireEvent.click(zoomButton("原寸で見る")!);
    expect(img.dataset.zoom).toBe("actual");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /拡大して表示/ }));
    expect(screen.getByRole("dialog").querySelector("img")!.dataset.zoom).toBe("fit");
  });
});
