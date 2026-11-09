import { describe, expect, it } from "vitest";
import {
  AUTO_MIN_BOARD,
  STEP_PX,
  cellNeed,
  cellOf,
  fontStepOf,
  longTextPxOf,
  longTextTight,
  pickBoardLayout,
} from "./boardLayout";

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
    expect([560, 559, 470, 469, 415, 414, 380, 379].map(fontStepOf)).toEqual([
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

  // ★ 前は行の高さを 1.25 倍で数え、マスの枠線（上下 1px）を数えていなかった。盤面 560px で
  //   「雄之助 & CircusP feat. Hatsune Miku」が切れた（検分 M1 高-1）。境目は枠線ごと数える
  it("どの段も、境目の盤面で札 1 行と文言 3 行が正方形のマスに入る（枠線・余白ごと）", () => {
    for (const board of [AUTO_MIN_BOARD, 470, 415, 380]) {
      const step = fontStepOf(board);
      const { caption, text } = STEP_PX[step];
      expect(cellOf(board), `${board}px（${step}）`).toBeGreaterThanOrEqual(cellNeed(caption, text, 3));
    }
  });

  it("マスに要る高さ: 余白 8＋札と文言の間 2＋枠線 2＋行の高さ 1.25 倍", () => {
    // 560px の盤面: マス 105.6px に、札 14px（17.5）と文言 20px 3 行（75）で 104.5px
    expect(cellOf(560)).toBeCloseTo(105.6);
    expect(cellNeed(14, 20, 3)).toBeCloseTo(104.5);
    // マスの間は 448px から 8px、それより狭いと 4px（BingoCardGrid の gap-2・gap-1）
    expect(cellOf(440)).toBeCloseTo((440 - 16) / 5);
  });
});

describe("longTextPxOf（名前の長い作者の文言）", () => {
  it("ふつうの文言より 1 段下げ、4 行が正方形のマスに入らない盤面ではもう 1 段下げる", () => {
    // 盤面 560〜579px（ノート PC の自動の並べ方）は 14px。580px 以上で 16px 4 行が入る
    expect([560, 575, 579, 580, 592, 715].map((b) => longTextPxOf(b, "xl"))).toEqual([14, 14, 14, 16, 16, 16]);
    expect([470, 516, 517, 559].map((b) => longTextPxOf(b, "lg"))).toEqual([12, 12, 14, 14]);
    // 12px より下げない
    expect(longTextPxOf(415, "md")).toBe(12);
    expect(longTextPxOf(380, "sm")).toBe(12);
    expect(longTextPxOf(300, "xs")).toBe(12);
  });

  // ★ 12px より下げられない盤面では字の間を詰めて 3 行に収める。列を 3 つ選んだ 1400 幅（盤面 419px の md）で、
  //   1 位が 12px で 4 行になり切れた（直したあとの計測で見つけた。sm・xs は前から詰めている）
  it("選んだ大きさでも 4 行が正方形のマスに入らない盤面では、字の間を詰める", () => {
    expect(longTextTight(419, "md")).toBe(true);
    expect(longTextTight(415, "md")).toBe(true);
    expect(longTextTight(407, "sm")).toBe(true);
    expect(longTextTight(345, "xs")).toBe(true);
    expect(longTextTight(469, "md")).toBe(false);
    expect(longTextTight(470, "lg")).toBe(false);
    expect(longTextTight(560, "xl")).toBe(false);
    expect(longTextTight(715, "xl")).toBe(false);
  });

  it("xl・lg の段では、選んだ大きさで 4 行が正方形のマスに入る", () => {
    for (const board of [560, 575, 579, 580, 597, 715, 855]) {
      expect(cellOf(board), `${board}px`).toBeGreaterThanOrEqual(cellNeed(STEP_PX.xl.caption, longTextPxOf(board, "xl"), 4));
    }
    for (const board of [470, 500, 516, 517, 559]) {
      expect(cellOf(board), `${board}px`).toBeGreaterThanOrEqual(cellNeed(STEP_PX.lg.caption, longTextPxOf(board, "lg"), 4));
    }
  });
});
