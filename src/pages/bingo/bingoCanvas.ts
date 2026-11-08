import type { Cell } from "./bingoLogic";
import { BINGO_LINES, progressOf } from "./bingoProgress";

/** カード描画の定数（現行 draw.js 準拠）。 */
export const CELL = 100;
export const MARGIN = 20;
export const CANVAS_SIZE = CELL * 5 + MARGIN * 2; // 520

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * 埋めた印: 色で薄く覆い、丸を付ける。絵や文字が読める濃さにする
 * （以前の赤い斜めの「CLEARED」判子は、絵と文字を隠してうるさかった）。
 */
export function drawFilledMark(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, CELL, CELL);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawFree(ctx: CanvasRenderingContext2D, x: number, y: number, icon: HTMLImageElement | null) {
  if (icon) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.drawImage(icon, x, y, CELL, CELL);
    ctx.restore();
  } else {
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(x, y, CELL, CELL);
  }
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.font = "italic 25px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FREE", x + CELL / 2, y + CELL / 2);
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface DrawOptions {
  jacketBase: string; // 例: /MusicDatas/jacket/
  freeIconUrl: string;
  borderColor: string;
  /** 埋めた印と BINGO の線の色（ページの --unit-color を canvas が読める形にしたもの）。 */
  markColor: string;
}

/**
 * カードを canvas に描画する（ジャケット画像を非同期ロード）。
 * isCancelled: 描画中に新しい描画が始まったら true を返す関数。古い描画が
 * 新しいカードを上書きしないよう、要所で確認して中断する。
 */
export async function drawBingoCard(
  canvas: HTMLCanvasElement,
  card: readonly Cell[],
  opts: DrawOptions,
  isCancelled: () => boolean = () => false
): Promise<void> {
  // 画像を全部読んでから一度に描く（埋めるたびに描き直すので、途中の白い画面を見せない）
  const [freeIcon, jackets] = await Promise.all([
    loadImage(opts.freeIconUrl).catch(() => null),
    Promise.all(
      card.map((cell) =>
        cell === "FREE" ? null : loadImage(`${opts.jacketBase}${cell.jacketLink}`).catch(() => null)
      )
    ),
  ]);
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
    if (cell === "FREE") {
      drawFree(ctx, x, y, freeIcon);
      return;
    }
    const img = jackets[i];
    if (img) {
      ctx.drawImage(img, x, y, CELL, CELL);
    } else {
      ctx.fillStyle = "#999999";
      ctx.fillRect(x, y, CELL, CELL);
    }
    if (cell.cleared) drawFilledMark(ctx, x, y, opts.markColor);
  });

  drawFinish(ctx, card, { ...opts, outline: true });
}

/** そろった列の線・埋めた数・署名・枠（曲名・お題で共通）。 */
export function drawFinish(
  ctx: CanvasRenderingContext2D,
  card: readonly ("FREE" | { cleared: boolean })[],
  opts: { borderColor: string; markColor: string; outline?: boolean }
) {
  const progress = progressOf(card);
  const center = (i: number) => [MARGIN + (i % 5) * CELL + CELL / 2, MARGIN + Math.floor(i / 5) * CELL + CELL / 2];
  ctx.save();
  ctx.lineCap = "round";
  // 下の絵や文字が読めるよう半透明に
  ctx.globalAlpha = 0.65;
  for (const li of progress.lines) {
    const line = BINGO_LINES[li];
    const [x1, y1] = center(line[0]);
    const [x2, y2] = center(line[4]);
    const strokes: [string, number][] = opts.outline ? [["#ffffff", 14], [opts.markColor, 8]] : [[opts.markColor, 8]];
    for (const [color, width] of strokes) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 左下に埋めた数。そろっていれば BINGO!
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.font = "bold 14px sans-serif";
  ctx.fillStyle = "#334155";
  const base = `埋めたマス ${progress.filled}/${progress.total}`;
  ctx.fillText(base, MARGIN, CANVAS_SIZE - 2);
  if (progress.bingo) {
    ctx.fillStyle = opts.markColor;
    ctx.fillText("BINGO!", MARGIN + ctx.measureText(base).width + 8, CANVAS_SIZE - 2);
  }

  drawSignatureAndFrame(ctx, opts.borderColor);
}

/** 右下の署名と角丸の枠（曲名・お題で共通）。 */
export function drawSignatureAndFrame(ctx: CanvasRenderingContext2D, borderColor: string) {
  ctx.fillStyle = "#000000";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("Created by Sekai-Master @YesNoritake", CANVAS_SIZE - 4, CANVAS_SIZE - 2);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, MARGIN, MARGIN, CELL * 5, CELL * 5, 10);
  ctx.stroke();
}
