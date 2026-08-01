/**
 * 編成の紹介カード（PNG）。
 *
 * 周回プランの画像出力（refresh/lib/planCanvas.ts）と同じ作法:
 * **UI 側で文字列を整形して渡し、ここは描画専任**。画像は非同期で先読みし、
 * 失敗しても描画は続ける（1枚落ちても編成の数字は出る）。
 *
 * ★ 縦横比は SNS に貼る前提で 700×約420。カードの絵を5枚並べるので、
 *   横長のまま「5枚が一目で分かる」ことを最優先にしている。
 */

export interface DeckCanvasCard {
  /** サムネイルの URL（無ければ属性色の枠だけ描く）。 */
  thumb?: string;
  name: string;
  character: string;
  /** 「Lv60 特訓 MR5 SL4」のような育成状態。 */
  sub: string;
  leader: boolean;
  attrColor: string;
}

export interface DeckCanvasData {
  deckName: string;
  eventName?: string;
  cards: DeckCanvasCard[];
  /** 大きく出す3つ。文字列に整形済みで渡す（描画は数字の意味を知らない）。 */
  stats: { label: string; value: string; sub?: string }[];
  accent: string;
  footer?: string;
}

const W = 700;
const PAD = 24;
const HEADER_H = 84;
const CARD_H = 170;
const STAT_H = 108;
const FOOTER_H = 34;
const THUMB = 84;
const INK = "#334155";
const MUTED = "#64748b";

export const deckCanvasHeight = () => HEADER_H + CARD_H + STAT_H + FOOTER_H;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function drawDeckCanvas(canvas: HTMLCanvasElement, data: DeckCanvasData): Promise<void> {
  const urls = [...new Set(data.cards.map((c) => c.thumb).filter((u): u is string => !!u))];
  const imgs = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map((u) =>
      loadImage(u)
        .then((img) => imgs.set(u, img))
        .catch(() => undefined)
    )
  );

  const H = deckCanvasHeight();
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = data.accent;
  ctx.fillRect(0, 0, W, 6);

  // ヘッダー: 編成名（大）＋ イベント名（小）
  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("編成", PAD, 32);
  ctx.fillStyle = INK;
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(truncate(ctx, data.deckName, W - PAD * 2 - 220), PAD, 58);
  if (data.eventName) {
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "13px sans-serif";
    ctx.fillText(truncate(ctx, data.eventName, 220), W - PAD, 58);
  }

  // カード5枚
  const n = Math.max(data.cards.length, 1);
  const colW = (W - PAD * 2) / n;
  data.cards.forEach((c, i) => {
    const cx = PAD + colW * i + colW / 2;
    const top = HEADER_H + 8;

    const img = c.thumb ? imgs.get(c.thumb) : undefined;
    const x = cx - THUMB / 2;
    if (img) {
      roundedImage(ctx, img, x, top, THUMB, 10);
    } else {
      // 画像が無くても枠は描く（欠けていることが分かる）。
      ctx.fillStyle = c.attrColor;
      roundRect(ctx, x, top, THUMB, THUMB, 10);
      ctx.fill();
    }
    // 属性の色を枠として出す（誰のどのカードかが色でも分かる）。
    ctx.strokeStyle = c.attrColor;
    ctx.lineWidth = 3;
    roundRect(ctx, x + 1.5, top + 1.5, THUMB - 3, THUMB - 3, 9);
    ctx.stroke();

    if (c.leader) {
      // リーダーは編成の意味が変わる（ボーナスの上乗せ）ので必ず見せる。
      const bw = 46;
      ctx.fillStyle = data.accent;
      roundRect(ctx, cx - bw / 2, top + THUMB - 12, bw, 18, 9);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("リーダー", cx, top + THUMB - 3);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(truncate(ctx, c.character, colW - 8), cx, top + THUMB + 20);
    ctx.fillStyle = MUTED;
    ctx.font = "11px sans-serif";
    ctx.fillText(truncate(ctx, c.name, colW - 8), cx, top + THUMB + 38);
    ctx.font = "10px sans-serif";
    ctx.fillText(truncate(ctx, c.sub, colW - 8), cx, top + THUMB + 54);
  });

  // 数字（総合力・ボーナス・スキル）
  const sy = HEADER_H + CARD_H;
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  roundRect(ctx, PAD, sy, W - PAD * 2, STAT_H - 16, 12);
  ctx.fill();
  const cellW = (W - PAD * 2) / Math.max(data.stats.length, 1);
  data.stats.forEach((s, i) => {
    const cx = PAD + cellW * i + cellW / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = "12px sans-serif";
    ctx.fillText(s.label, cx, sy + 22);
    ctx.fillStyle = data.accent;
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(truncate(ctx, s.value, cellW - 12), cx, sy + 54);
    if (s.sub) {
      ctx.fillStyle = MUTED;
      ctx.font = "11px sans-serif";
      ctx.fillText(truncate(ctx, s.sub, cellW - 12), cx, sy + 76);
    }
  });

  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = "11px sans-serif";
  ctx.fillText(data.footer ?? "Sekai-Master / 編成ビルダー", W - PAD, H - 14);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  r: number
): void {
  ctx.save();
  roundRect(ctx, x, y, size, size, r);
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
