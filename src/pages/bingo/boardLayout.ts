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
/**
 * 自動のときの盤面の下限。1 マス = 余白 8＋札と文言の間 2＋枠線 2＋札 14×1.25＋文言 20×1.25×3 = 104.5px、
 * 5 マスと間 4 つ（8px）で 555px なので、切りよく 560px（cellNeed・cellOf）。
 */
export const AUTO_MIN_BOARD = 560;
/** 列の切り替えの上限（カードの上限と同じ）。 */
export const MAX_BOARD_COLS = 5;
/** 正方形でない（中身で伸びる）お題のマスの盤面の高さの見積もり（min-h-16 × 5 段＋間）。 */
const GROWN_BOARD_HEIGHT = 64 * 5 + 4 * 4;

/**
 * 盤面の幅から選ぶ文字の段。字の段の規約（20・16・14・12、docs/design-system.md 2 節）だけを使う。
 * xl: 文言 20／札 14、lg: 16／12、md: 14／12、sm: 12／12（ここまで正方形）、xs: 12／12 で中身に合わせて縦に伸びる。
 * 境目は、その段の文言が 3 行と札が正方形のマスに入る盤面の幅（cellOf(境目) ≥ cellNeed(札, 文言, 3)）。
 * sm だけは名前の長い作者が収まる幅で決める（STEP_MIN の注）。
 */
export type FontStep = "xl" | "lg" | "md" | "sm" | "xs";

/**
 * 段ごとの文字の大きさ（px）。札・文言・名前の長い作者の文言（ふつうより 1 段下げる。さらに下げるのは longTextPxOf）。
 * 描く側（BingoCardGrid）はこの値から Tailwind の text-* を選ぶ。
 */
export type TextPx = 20 | 16 | 14 | 12;

export const STEP_PX: Record<FontStep, { caption: TextPx; text: TextPx; long: TextPx }> = {
  xl: { caption: 14, text: 20, long: 16 },
  lg: { caption: 12, text: 16, long: 14 },
  md: { caption: 12, text: 14, long: 12 },
  sm: { caption: 12, text: 12, long: 12 },
  xs: { caption: 12, text: 12, long: 12 },
};

/**
 * 盤面の札と文言の行の高さ（文字の大きさの倍）。
 * ★ BingoCardGrid が盤面の札と文言の span に leading-tight を付けて、この値にそろえている。Tailwind v4 の
 *   text-xl などは自分の行の高さ（20px→28px・16px→24px・14px→20px）を持ち、親（マス）の leading-tight を上書きする。
 *   前は 1.25 倍で数えたまま span に付けておらず、盤面 560px で名前の長い作者のマスが切れた（検分 M1 高-1）
 */
const BOARD_LEADING = 1.25;
/** お題のマスの縦の決まった分: 上下の余白（py-1 で 4px ずつ）・札と文言の間（mt-0.5）・枠線（上下 1px ずつ）。 */
const CELL_FIXED = 8 + 2 + 2;
/** 名前の長い作者の文言に見込む行の数（1 位「雄之助 & CircusP feat. Hatsune Miku」が 16px で 4 行になる）。 */
const LONG_LINES = 4;

/** マスの間（px）。BingoCardGrid はこれで gap-2・gap-1 を選ぶ。 */
export const cellGapOf = (board: number) => (board >= 448 ? 8 : 4);

/** 盤面の幅から、正方形のマス 1 つの高さ（枠線ごと）。 */
export const cellOf = (board: number) => (board - 4 * cellGapOf(board)) / 5;

/** 札 1 行と文言 lines 行が入るお題のマスの高さ（枠線ごと）。 */
export const cellNeed = (captionPx: number, textPx: number, lines: number) =>
  CELL_FIXED + (captionPx + textPx * lines) * BOARD_LEADING;

// ★ 計画の表の境目（460・410・370）は枠線を数えておらず、境目の盤面で 3 行の文言が 1〜1.4px はみ出す。
//   枠線ごと数えて引き直した（lg 467・md 414 → 切りよく 470・415。検分 M1 高-1）
// ★ sm の下限は、ふつうの文言の 3 行（376px）でなく、名前の長い作者 1 位「雄之助 & CircusP feat. Hatsune Miku」
//   （c286、18.95em）が 12px・字の間を詰めて 3 行に入る幅で決める。380〜385px では詰めても 4 行になり切れ、
//   386px から 3 行に入る（実測。検分 M1b 新-中-1）。少し余裕を見て 390px。これより狭い盤面はマスが中身で縦に伸びる（xs）。
//   選べる列を絞る直し方もあるが、列の切り替えは「外れたら本人が直せる」ための逃げ道なので減らさない
const STEP_MIN: readonly (readonly [number, FontStep])[] = [
  [AUTO_MIN_BOARD, "xl"],
  [470, "lg"],
  [415, "md"],
  [390, "sm"],
];

export function fontStepOf(board: number): FontStep {
  return STEP_MIN.find(([min]) => board >= min)?.[1] ?? "xs";
}

/** 字の段の規約で 1 段下の大きさ（12px より下げない）。 */
const stepDown = (px: TextPx): TextPx => (px > 16 ? 16 : px > 14 ? 14 : 12);

/**
 * 名前の長い作者（fitsCell に通らないお題）の文言の大きさ（px）。ふつうの文言より 1 段下げ、
 * その大きさで 4 行が正方形のマスに入らない盤面では、もう 1 段下げる（盤面 560〜579px の xl は 14px）。
 * md 以下は 12px のまま（12px が最小。docs/design-system.md 2 節）。
 */
export function longTextPxOf(board: number, step: FontStep): TextPx {
  const { caption, long } = STEP_PX[step];
  if (long <= 12 || cellOf(board) >= cellNeed(caption, long, LONG_LINES)) return long;
  return stepDown(long);
}

/**
 * 名前の長い作者の文言の字の間を詰めるか。longTextPxOf の大きさでも 4 行が正方形のマスに入らない盤面
 * （md の下の方・sm・xs）は 12px より下げられないので、字の間を詰めて 3 行に収める。
 * ★ 列を 3 つ選んだ 1400 幅（盤面 419px の md）で、1 位が 12px で 4 行になり切れた（sm・xs は前から詰めている）
 */
export function longTextTight(board: number, step: FontStep): boolean {
  return cellOf(board) < cellNeed(STEP_PX[step].caption, longTextPxOf(board, step), LONG_LINES);
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
