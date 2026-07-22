/**
 * 周回プランを画像(canvas)に描画する。共有用にPNGで書き出す。
 * UI側で行の文字列を整形して渡す（canvasは描画専任）。ジャケットは非同期ロード。
 */

export interface PlanCanvasRow {
  /** "21:00 → 22:00" などの時刻レンジ */
  time: string;
  /** "独りんぼエンヴィー 1時間" / "休憩 30分" */
  label: string;
  /** "≈28回" / "次の減少まで20分" などの補足 */
  sub?: string;
  /** 終了時点のゲージ表示（"23.5%"） */
  percent: string;
  /** 警告行（100%到達など）は赤で強調 */
  warn: boolean;
  /** プレイ行のジャケット画像URL（あれば行頭に描く） */
  jacket?: string;
}

export interface PlanCanvasData {
  songTitle: string;
  meta: string[];
  rows: PlanCanvasRow[];
  summary: { label: string; value: string }[];
  accent: string;
  /** 左上の小見出し（既定「リフレッシュゲージ 周回プラン」）。 */
  heading?: string;
  /** 右カラム（percent）の確保幅px。大きい数字（累積pt等）を出すとき広げる。既定72。 */
  rightColW?: number;
}

const W = 700;
const PAD = 24;
const HEADER_H = 128;
const ROW_H = 54;
const FOOTER_H = 96;
const INK = "#334155";
const MUTED = "#64748b";
const WARN = "#e11d48";
const JACKET = 34;

export function planCanvasHeight(rowCount: number): number {
  return HEADER_H + rowCount * ROW_H + FOOTER_H;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function drawPlanCanvas(canvas: HTMLCanvasElement, data: PlanCanvasData): Promise<void> {
  // ジャケットを先読み（失敗は無視）
  const urls = [...new Set(data.rows.map((r) => r.jacket).filter((u): u is string => !!u))];
  const imgs = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map((u) =>
      loadImage(u)
        .then((img) => imgs.set(u, img))
        .catch(() => undefined)
    )
  );

  const H = planCanvasHeight(data.rows.length);
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

  // ヘッダー
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "bold 15px sans-serif";
  ctx.fillText(data.heading ?? "リフレッシュゲージ 周回プラン", PAD, 30);
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(truncate(ctx, data.songTitle, W - PAD * 2), PAD, 60);
  ctx.font = "13px sans-serif";
  ctx.fillStyle = MUTED;
  data.meta.forEach((m, i) => ctx.fillText(m, PAD, 88 + i * 20));

  // 行
  let y = HEADER_H;
  for (let i = 0; i < data.rows.length; i++) {
    const r = data.rows[i];
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(0,0,0,0.03)";
      ctx.fillRect(PAD, y, W - PAD * 2, ROW_H);
    }
    const cy = y + ROW_H / 2;
    // 時刻
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED;
    ctx.font = "12px sans-serif";
    ctx.fillText(r.time, PAD + 4, cy);

    // ジャケット
    let labelX = PAD + 150;
    const jimg = r.jacket ? imgs.get(r.jacket) : undefined;
    if (jimg) {
      const jy = cy - JACKET / 2;
      roundedImage(ctx, jimg, labelX, jy, JACKET, 6);
      labelX += JACKET + 8;
    }

    // ラベル
    const labelMax = W - PAD - (data.rightColW ?? 72) - labelX;
    ctx.fillStyle = r.warn ? WARN : INK;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(truncate(ctx, r.label, labelMax), labelX, cy - (r.sub ? 8 : 0));
    if (r.sub) {
      ctx.fillStyle = r.warn ? WARN : MUTED;
      ctx.font = "11px sans-serif";
      ctx.fillText(truncate(ctx, r.sub, labelMax), labelX, cy + 10);
    }

    // ゲージ%
    ctx.textAlign = "right";
    ctx.fillStyle = r.warn ? WARN : data.accent;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(r.percent, W - PAD - 4, cy);
    y += ROW_H;
  }

  // フッター
  const fy = y + 12;
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.fillRect(PAD, fy, W - PAD * 2, FOOTER_H - 24);
  const cellW = (W - PAD * 2) / data.summary.length;
  data.summary.forEach((s, i) => {
    const cx = PAD + cellW * i + cellW / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = "11px sans-serif";
    ctx.fillText(s.label, cx, fy + 20);
    ctx.fillStyle = data.accent;
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(s.value, cx, fy + 44);
  });

  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = "11px sans-serif";
  ctx.fillText("Sekai-Master / リフレッシュゲージ計算機", W - PAD, H - 12);
}

function roundedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  r: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
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
