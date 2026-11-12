/**
 * @vitest-environment jsdom
 *
 * モーダルを開くと背面のスクロールを止める。PC ではスクロールバーが消えた幅だけ画面が右にずれるので、
 * その幅を body の右の余白で埋める（スマホはスクロールバーが重なるので幅 0、何もしない）。
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useModalA11y } from "./a11y";

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
});

function Modal() {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(true, () => {}, ref);
  return <div ref={ref} role="dialog" tabIndex={-1} />;
}

/** スクロールバーの幅（innerWidth − clientWidth）を決める。 */
function setScrollbar(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1280 - width });
}

describe("useModalA11y の背面スクロールの停止", () => {
  it("PC（スクロールバーあり）では、消えた幅を右の余白で埋め、閉じたら戻す", () => {
    setScrollbar(15);
    const { unmount } = render(<Modal />);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.paddingRight).toBe("15px");
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.paddingRight).toBe("");
  });

  it("スマホ（スクロールバーが重なる・幅 0）では余白を足さない", () => {
    setScrollbar(0);
    render(<Modal />);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.paddingRight).toBe("");
  });
});

describe("useModalA11y のフォーカスの戻し", () => {
  it("閉じたら開く前の要素へ戻し、そのとき画面をスクロールさせない（preventScroll）", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const spy = vi.spyOn(opener, "focus");
    const { unmount } = render(<Modal />);
    unmount();
    expect(spy).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(opener);
    spy.mockRestore();
    opener.remove();
  });
});
