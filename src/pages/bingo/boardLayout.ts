/**
 * まとめて遊ぶの盤面の並べ方（PC は並べる、スマホは切り替え）。
 *
 * 決め方の順は「文字が潰れない大きさを優先し、無理に詰め込まない」（指示書）:
 * 1. 自動のときは、お題の文言 20px・札 14px が正方形のマスに 3 行入る盤面の幅（AUTO_MIN_BOARD）を下限にする
 * 2. その下限で横に並ぶだけの列にする（最大はカードの枚数）
 * 3. 盤面の幅は「列の幅」と「1 段がブラウザの内側の高さに収まる大きさ」の小さい方。ただし下限より小さくしない（収まらなければ縦に巻く）
 * 4. 共有する人が列を選んだときは下限を見ず、選んだ列の幅で決める（1 画面に全部を入れたい人向け）
 * ★ 高さはモニターではなくブラウザの内側（window.innerHeight）で数える。1920×1080 の画面でも Chrome の内側は 940px 前後
 *   （計画のレビュー G-01）。数の出どころは plan-G-bingo.md の「改訂 11/10」B。
 */

/** 盤面どうしの間。 */
export const BOARD_GAP = 24;
/** サイトの見出しの高さ（Layout.tsx の py-3 と、中のリンクの h-7 py-1.5）。 */
const SITE_HEADER = 65;
/** 盤面の区画の Panel の上下の余白（24px ずつ）と、操作の列（48px＋余白 16px）。 */
const PANEL_CHROME = 24 + 64 + 24;
/** カードの見出し（名前と進み具合の 1 行 32px＋余白 8px＋プレイ開始の時刻を足すときの予備 8px）。 */
const BOARD_HEAD = 48;
/** 自動のときの盤面の下限。1 マス ≒ 余白 8＋札 14×1.25＋間 2＋文言 20×1.25×3 ≒ 103px、5 マスと間 4 つ（8px）で 547px。 */
export const AUTO_MIN_BOARD = 560;
/** 列の切り替えの上限（カードの上限と同じ）。 */
export const MAX_BOARD_COLS = 5;
/** 正方形でない（中身で伸びる）お題のマスの盤面の高さの見積もり（min-h-16 × 5 段＋間）。 */
const GROWN_BOARD_HEIGHT = 64 * 5 + 4 * 4;

/**
 * 盤面の幅から選ぶ文字の段。字の段の規約（20・16・14・12、docs/design-system.md 2 節）だけを使う。
 * xl: 文言 20／札 14、lg: 16／12、md: 14／12、sm: 12／12（ここまで正方形）、xs: 12／12 で中身に合わせて縦に伸びる。
 * 境目は、その段の文言が 3 行と札が正方形のマスに入る盤面の幅。
 */
export type FontStep = "xl" | "lg" | "md" | "sm" | "xs";

const STEP_MIN: readonly (readonly [number, FontStep])[] = [
  [AUTO_MIN_BOARD, "xl"],
  [460, "lg"],
  [410, "md"],
  [370, "sm"],
];

export function fontStepOf(board: number): FontStep {
  return STEP_MIN.find(([min]) => board >= min)?.[1] ?? "xs";
}

export type BoardLayout =
  | { mode: "tabs" }
  | {
      mode: "grid";
      cols: number;
      /** 盤面の幅（px）。 */
      board: number;
      step: FontStep;
      /** 盤面の区画の頭まで巻いたとき、全部の盤面がブラウザの内側の高さに入るか。 */
      fits: boolean;
    };

/**
 * width は盤面の区画の内側の幅、height はブラウザの内側の高さ、cols は選んだ列の数（0 は自動）。
 */
export function pickBoardLayout({
  count,
  width,
  height,
  cols,
}: {
  count: number;
  width: number;
  height: number;
  cols: number;
}): BoardLayout {
  if (width < AUTO_MIN_BOARD) return { mode: "tabs" };
  const n = Math.max(1, count);
  const auto = Math.floor((width + BOARD_GAP) / (AUTO_MIN_BOARD + BOARD_GAP));
  const c = Math.max(1, Math.min(n, cols > 0 ? cols : auto, MAX_BOARD_COLS));
  const track = (width - (c - 1) * BOARD_GAP) / c;
  const rowCap = height - SITE_HEADER - PANEL_CHROME - BOARD_HEAD;
  const board = Math.floor(Math.min(track, Math.max(rowCap, AUTO_MIN_BOARD)));
  const step = fontStepOf(board);
  const rows = Math.ceil(n / c);
  const boardHeight = step === "xs" ? Math.max(board, GROWN_BOARD_HEIGHT) : board;
  const total = SITE_HEADER + PANEL_CHROME + rows * (boardHeight + BOARD_HEAD) + (rows - 1) * BOARD_GAP;
  return { mode: "grid", cols: c, board, step, fits: total <= height };
}
