/**
 * @vitest-environment jsdom
 *
 * RouteStage から aimMorph への配線（押下のイベントを第 3 引数で渡すこと）。
 *
 * ★ 修飾キーの判定は aimMorph の第 3 引数（click）に懸かっている。省ける引数なので、
 *   RouteStage が渡し忘れても型は通り、Ctrl+クリック（新しいタブ）で行が隠れたまま残る
 *   不具合が戻る（#255 の検分 中1）。ここでは描画した RouteStage に本物の click を送って確かめる。
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { MouseEvent } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { cancelMorph, captureMorph, MORPH_ATTR } from "../motion/morph";
import { RouteStage } from "./RouteStage";

function sized(el: Element, top: number, left: number, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  return el as HTMLElement;
}

// 遷移そのものは起こさない（指名されたかどうかだけを見る）。capture 段階の aimMorph はその前に走る。
const stay = (e: MouseEvent) => e.preventDefault();

function mount() {
  const view = render(
    <MemoryRouter>
      <RouteStage>
        {() => (
          <>
            <a href="/x" onClick={stay}>
              <span {...{ [MORPH_ATTR]: "tool:x" }} data-testid="c1">
                X
              </span>
            </a>
            <a href="/y" onClick={stay}>
              <span {...{ [MORPH_ATTR]: "tool:y" }} data-testid="c2">
                Y
              </span>
            </a>
          </>
        )}
      </RouteStage>
    </MemoryRouter>
  );
  const stage = view.container.querySelector(".stage") as HTMLElement;
  sized(stage, 0, 0, 800, 600);
  const c1 = sized(view.getByTestId("c1"), 10, 10, 200, 40);
  sized(view.getByTestId("c2"), 60, 10, 200, 40);
  return { stage, c1 };
}

const boxes = () => document.querySelectorAll(".morph-box");

afterEach(() => {
  cancelMorph();
  cleanup();
});

describe("RouteStage → aimMorph の配線", () => {
  it("主ボタンの押下は指名される（遷移が始まるとその行が持ち上がる）", () => {
    const { stage, c1 } = mount();
    fireEvent.click(c1, { button: 0 });
    // 候補が 2 つあるので、指名が無ければ何も持ち上がらない
    captureMorph(stage, "*");
    expect(boxes().length).toBe(1);
    expect(c1.style.visibility).toBe("hidden");
  });

  it("修飾キー付きの押下は指名されない（別タブで開くので遷移が始まらない）", () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
      const { stage, c1 } = mount();
      fireEvent.click(c1, { button: 0, ...mod });
      captureMorph(stage, "*");
      expect(boxes().length).toBe(0);
      expect(c1.style.visibility).toBe("");
      cancelMorph();
      cleanup();
    }
  });
});
