import type { UnitKey } from "../../lib/units";
import {
  CANVAS_SIZE,
  CELL,
  MARGIN,
  drawFilledMark,
  drawFinish,
  drawFree,
  loadImage,
} from "./bingoCanvas";
import type { OdaiCell } from "./odaiLogic";

/**
 * ユニットの色（画像用）。index.css の明るいテーマの値と同じ。
 * ★ canvas は `light-dark(...)` を読めず黙って無視する（src/lib/canvasColor.ts）ので、
 *   CSS 変数ではなく値を持つ。画像は地が白なので明るいテーマの色で描く。
 */
const UNIT_HEX: Record<UnitKey, string> = {
  vs: "#33ccbb",
  ln: "#4455dd",
  mmj: "#88dd44",
  vbs: "#ee1166",
  wxs: "#ff9900",
  n25: "#884499",
};

const FONT_FAMILY = "'M PLUS Rounded 1c', sans-serif";
const PAD = 6;
const STRIPE = 6;
const CAPTION_SIZE = 13;
const MAIN_SIZES = [22, 20, 18, 16, 14, 13, 12];
const MAX_LINES = 3;
const LINE_HEIGHT = 1.2;
const CAPTION_GAP = 6;
/** 札・文言を置ける高さ（上端の帯と上下の余白を除く）。 */
const BODY_HEIGHT = CELL - STRIPE - PAD * 2;
/**
 * 12px でも 3 行に収まらない長い名前（入れたいお題・差し替えで選べる作者。「雄之助 & CircusP feat. Hatsune Miku」など）だけに使う
 * 小さい字。画像は 520px の絵で、画面の字の決まり（12px より小さくしない）とは別。行の数はマスの高さに収まるだけ。
 */
const LONG_SIZES = [11, 10, 9, 8];
const LONG_MIN_SIZE = LONG_SIZES[LONG_SIZES.length - 1];

/** 幅を超える区切りの中で、この字の後ろでは折ってよい（空白・読点・連名の × ＋ &）。 */
const WORD_BREAK_AFTER = /[\s、，,×＋&]/;

/** 1 つの区切りを、空白などの後ろで分ける（「OSTER project feat.」→「OSTER 」「project 」「feat.」）。 */
function splitAtSpaces(chunk: string): string[] {
  // 後読みの正規表現は古い iOS Safari で構文エラーになるので、1 字ずつ見る
  const out: string[] = [];
  let cur = "";
  for (const ch of chunk) {
    cur += ch;
    if (WORD_BREAK_AFTER.test(ch)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * 区切りの中では折らずに行へ詰める。1 つの区切りが幅を超えるときは空白の後ろで、それでも超える語だけ字の単位で折る
 * （長い英字の続きは途中で折る）。行の端の空白は描かないので外す。
 */
export function layoutChunks(chunks: readonly string[], maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (piece: string) => {
    if (line && measure((line + piece).trimEnd()) > maxWidth) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += line === "" ? piece.trimStart() : piece;
  };
  for (const chunk of chunks) {
    if (measure(chunk.trim()) <= maxWidth) {
      push(chunk);
      continue;
    }
    for (const word of splitAtSpaces(chunk)) {
      if (measure(word.trim()) <= maxWidth) push(word);
      else for (const ch of word) push(ch);
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** maxLines 行以内に、どの行も幅に収まるか。 */
function fits(lines: readonly string[], maxLines: number, maxWidth: number, measure: (s: string) => number): boolean {
  return lines.length <= maxLines && lines.every((l) => measure(l) <= maxWidth);
}

/**
 * 2 行以内（だめなら 3 行以内）に収まるいちばん大きい字の大きさと、その行分け。12px でも 3 行に収まらない長い名前は、
 * さらに小さい字（LONG_SIZES）で、マスの高さに収まる行の数まで使う。
 */
export function fitOdaiText(
  chunks: readonly string[],
  maxWidth: number,
  measureAt: (size: number) => (s: string) => number
): { size: number; lines: string[] } {
  for (const maxLines of [2, MAX_LINES]) {
    for (const size of MAIN_SIZES) {
      const measure = measureAt(size);
      const lines = layoutChunks(chunks, maxWidth, measure);
      if (fits(lines, maxLines, maxWidth, measure)) return { size, lines };
    }
  }
  for (const size of LONG_SIZES) {
    const measure = measureAt(size);
    const lines = layoutChunks(chunks, maxWidth, measure);
    if (fits(lines, maxLinesAt(size), maxWidth, measure)) return { size, lines };
  }
  return { size: LONG_MIN_SIZE, lines: layoutChunks(chunks, maxWidth, measureAt(LONG_MIN_SIZE)) };
}

/** この字の大きさで、札の下に置ける行の数。 */
export function maxLinesAt(size: number): number {
  return Math.floor((BODY_HEIGHT - CAPTION_SIZE - CAPTION_GAP) / (size * LINE_HEIGHT));
}

function drawOdaiCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: Exclude<OdaiCell, "FREE">,
  markColor: string
) {
  const { odai } = cell;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(x, y, CELL, CELL);
  if (odai.unit) {
    ctx.fillStyle = UNIT_HEX[odai.unit];
    ctx.fillRect(x, y, CELL, STRIPE);
  }

  const maxWidth = CELL - PAD * 2;
  const fit = fitOdaiText(odai.chunks, maxWidth, (size) => {
    ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    return (s) => ctx.measureText(s).width;
  });
  const captionGap = CAPTION_GAP;
  const mainHeight = fit.lines.length * fit.size * LINE_HEIGHT;
  const blockHeight = CAPTION_SIZE + captionGap + mainHeight;
  // 高さに収まらないとき（来ないはずだが）も、上端の帯の下から描き始める
  const top = y + STRIPE + Math.max(0, (CELL - STRIPE - blockHeight) / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#64748b";
  ctx.font = `${CAPTION_SIZE}px ${FONT_FAMILY}`;
  ctx.fillText(odai.caption, x + CELL / 2, top, maxWidth);

  ctx.fillStyle = "#334155";
  ctx.font = `bold ${fit.size}px ${FONT_FAMILY}`;
  fit.lines.forEach((line, i) => {
    ctx.fillText(line, x + CELL / 2, top + CAPTION_SIZE + captionGap + i * fit.size * LINE_HEIGHT, maxWidth);
  });

  if (cell.cleared) drawFilledMark(ctx, x, y, markColor);
}

function drawGridLines(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const p = MARGIN + i * CELL + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, MARGIN);
    ctx.lineTo(p, MARGIN + CELL * 5);
    ctx.moveTo(MARGIN, p);
    ctx.lineTo(MARGIN + CELL * 5, p);
    ctx.stroke();
  }
}

/** 使う字の形を先に読み込む（Web フォントは使う字の分だけ後から届くため）。 */
async function loadFonts(card: readonly OdaiCell[]) {
  if (typeof document === "undefined" || !document.fonts) return;
  const text = card.map((c) => (c === "FREE" ? "" : c.odai.caption + c.odai.text)).join("");
  await Promise.all([
    document.fonts.load(`bold 20px ${FONT_FAMILY}`, text),
    document.fonts.load(`${CAPTION_SIZE}px ${FONT_FAMILY}`, text),
  ]).catch(() => undefined);
}

export interface OdaiDrawOptions {
  freeIconUrl: string;
  borderColor: string;
  markColor: string;
}

/** お題カードを canvas に描く。isCancelled は bingoCanvas の drawBingoCard と同じ。 */
export async function drawOdaiCard(
  canvas: HTMLCanvasElement,
  card: readonly OdaiCell[],
  opts: OdaiDrawOptions,
  isCancelled: () => boolean = () => false
): Promise<void> {
  const [freeIcon] = await Promise.all([loadImage(opts.freeIconUrl).catch(() => null), loadFonts(card)]);
  if (isCancelled()) return;
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  card.forEach((cell, i) => {
    const x = MARGIN + (i % 5) * CELL;
    const y = MARGIN + Math.floor(i / 5) * CELL;
    if (cell === "FREE") drawFree(ctx, x, y, freeIcon);
    else drawOdaiCell(ctx, x, y, cell, opts.markColor);
  });
  drawGridLines(ctx);
  drawFinish(ctx, card, opts);
}
