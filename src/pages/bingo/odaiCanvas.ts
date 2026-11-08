import type { UnitKey } from "../../lib/units";
import {
  CANVAS_SIZE,
  CELL,
  MARGIN,
  drawClearedOverlay,
  drawFree,
  drawSignatureAndFrame,
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

/** 区切りの中では折らずに行へ詰める。1 つの区切りが幅を超えるときだけ字の単位で折る。 */
export function layoutChunks(chunks: readonly string[], maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (piece: string) => {
    if (line && measure(line + piece) > maxWidth) {
      lines.push(line);
      line = "";
    }
    line += piece;
  };
  for (const chunk of chunks) {
    if (measure(chunk) <= maxWidth) {
      push(chunk);
      continue;
    }
    for (const ch of chunk) push(ch);
  }
  if (line) lines.push(line);
  return lines;
}

/** 2 行以内（だめなら 3 行以内）に収まるいちばん大きい字の大きさと、その行分け。 */
export function fitOdaiText(
  chunks: readonly string[],
  maxWidth: number,
  measureAt: (size: number) => (s: string) => number
): { size: number; lines: string[] } {
  for (const maxLines of [2, MAX_LINES]) {
    for (const size of MAIN_SIZES) {
      const measure = measureAt(size);
      const lines = layoutChunks(chunks, maxWidth, measure);
      if (lines.length <= maxLines && lines.every((l) => measure(l) <= maxWidth)) return { size, lines };
    }
  }
  const size = MAIN_SIZES[MAIN_SIZES.length - 1];
  return { size, lines: layoutChunks(chunks, maxWidth, measureAt(size)) };
}

function drawOdaiCell(ctx: CanvasRenderingContext2D, x: number, y: number, cell: Exclude<OdaiCell, "FREE">) {
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
  const captionGap = 6;
  const mainHeight = fit.lines.length * fit.size * LINE_HEIGHT;
  const blockHeight = CAPTION_SIZE + captionGap + mainHeight;
  const top = y + STRIPE + (CELL - STRIPE - blockHeight) / 2;

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

  if (cell.cleared) drawClearedOverlay(ctx, x, y);
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
    else drawOdaiCell(ctx, x, y, cell);
  });
  drawGridLines(ctx);
  drawSignatureAndFrame(ctx, opts.borderColor);
}
