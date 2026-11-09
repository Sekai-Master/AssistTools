import { describe, expect, it } from "vitest";
import { AUTO_MIN_BOARD, fontStepOf, pickBoardLayout } from "./boardLayout";

// 幅は盤面の区画の内側（ページの左右 16px と Panel の左右 24px を引いた値）、高さはブラウザの内側。
// 数は計画（plan-G-bingo.md「改訂 11/10」の B の表）と同じ。
describe("pickBoardLayout（自動）", () => {
  it("1920×1080 の画面・最大化（区画 1840px・内側 940px）", () => {
    expect(pickBoardLayout({ count: 2, width: 1840, height: 940, cols: 0 })).toEqual({
      mode: "grid",
      cols: 2,
      board: 715,
      step: "xl",
      fits: true,
    });
    expect(pickBoardLayout({ count: 3, width: 1840, height: 940, cols: 0 })).toMatchObject({ cols: 3, board: 597, fits: true });
    // 4・5 枚は文字を潰さず 2 段にして巻く（無理に詰め込まない）
    expect(pickBoardLayout({ count: 5, width: 1840, height: 940, cols: 0 })).toMatchObject({ cols: 3, board: 597, fits: false });
  });

  it("高さが足りなくても下限（文言 20px が入る 560px）より小さくしない", () => {
    expect(pickBoardLayout({ count: 2, width: 1456, height: 746, cols: 0 })).toMatchObject({
      cols: 2,
      board: AUTO_MIN_BOARD,
      step: "xl",
      fits: false,
    });
    expect(pickBoardLayout({ count: 5, width: 1200, height: 600, cols: 0 })).toMatchObject({ cols: 2, board: 560 });
  });

  it("1 枚でも横幅いっぱいにせず、1 段が画面の高さに収まる大きさにする", () => {
    expect(pickBoardLayout({ count: 1, width: 1840, height: 940, cols: 0 })).toMatchObject({ cols: 1, board: 715 });
  });

  it("区画が下限より狭い（スマホ）は並べずに切り替え式", () => {
    expect(pickBoardLayout({ count: 3, width: 326, height: 844, cols: 0 })).toEqual({ mode: "tabs" });
    expect(pickBoardLayout({ count: 3, width: 559, height: 844, cols: 3 })).toEqual({ mode: "tabs" });
  });
});

describe("pickBoardLayout（列を選んだとき）", () => {
  it("選んだ列で並べ、下限は見ない（1 画面に入れたい人向け）", () => {
    expect(pickBoardLayout({ count: 5, width: 1840, height: 940, cols: 5 })).toMatchObject({
      cols: 5,
      board: 348,
      step: "xs",
      fits: true,
    });
    expect(pickBoardLayout({ count: 5, width: 1840, height: 940, cols: 4 })).toMatchObject({ cols: 4, board: 442, step: "md" });
  });

  it("1 列でも高さの上限は同じ。カードの枚数より多い列は枚数にそろえる", () => {
    expect(pickBoardLayout({ count: 5, width: 1840, height: 940, cols: 1 })).toMatchObject({ cols: 1, board: 715 });
    expect(pickBoardLayout({ count: 2, width: 1840, height: 940, cols: 5 })).toMatchObject({ cols: 2, board: 715 });
  });
});

describe("fontStepOf（盤面の幅から文字の段）", () => {
  it("段の境目", () => {
    expect([560, 559, 460, 459, 410, 409, 370, 369].map(fontStepOf)).toEqual([
      "xl",
      "lg",
      "lg",
      "md",
      "md",
      "sm",
      "sm",
      "xs",
    ]);
  });
});
