import type { Cell } from "./bingoLogic";

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

export function drawClearedOverlay(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "#cccccc";
  ctx.fillRect(x, y, CELL, CELL);
  ctx.globalAlpha = 1;
  ctx.translate(x + CELL / 2, y + CELL / 2);
  ctx.rotate((-20 * Math.PI) / 180);
  ctx.fillStyle = "#e01e5a";
  ctx.font = "italic 20px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CLEARED", 0, 0);
  ctx.strokeStyle = "#e01e5a";
  ctx.lineWidth = 2;
  for (const dy of [-15, 15]) {
    ctx.beginPath();
    ctx.moveTo(-CELL / 2, dy);
    ctx.lineTo(CELL / 2, dy);
    ctx.stroke();
  }
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
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const freeIcon = await loadImage(opts.freeIconUrl).catch(() => null);
  if (isCancelled()) return;

  await Promise.all(
    card.map(async (cell, i) => {
      const x = MARGIN + (i % 5) * CELL;
      const y = MARGIN + Math.floor(i / 5) * CELL;
      if (cell === "FREE") {
        drawFree(ctx, x, y, freeIcon);
        return;
      }
      try {
        const img = await loadImage(`${opts.jacketBase}${cell.jacketLink}`);
        if (isCancelled()) return;
        ctx.drawImage(img, x, y, CELL, CELL);
      } catch {
        if (isCancelled()) return;
        ctx.fillStyle = "#999999";
        ctx.fillRect(x, y, CELL, CELL);
      }
      if (cell.cleared) drawClearedOverlay(ctx, x, y);
    })
  );
  if (isCancelled()) return;

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
