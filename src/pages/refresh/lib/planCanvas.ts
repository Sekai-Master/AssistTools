/**
 * 周回プランを画像(canvas)に描画する。共有用にPNGで書き出す。
 * UI側で行の文字列を整形して渡す（canvasは描画専任）。ジャケットは非同期ロード。
 *
 * R6: ポイント調整の統合画像から「目標スコア域・焚き数・目標ボーナス」を
 * 強調表示したい要望が来たため、任意フィールド（scoreBand/lb/bonusLabel）を
 * 追加した。これらを持たない行（refresh 本来の周回行・worktime）は
 * 従来通りの1行54px描画のまま1pxも変えない（isEmphasisRow が false を返す）。
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
  /**
   * 目標スコア帯。実行時に一番見る情報なので、あれば大きく monospace で強調する
   * （R6・ポイント調整アナライザーの統合画像刷新）。
   */
  scoreBand?: { min: number; max: number };
  /**
   * 消費ライブボーナス（焚き数）。あれば lbIconUrl のアイコン＋"×n" で強調する。
   * 0 も意味のある値（焚かない）なので undefined と区別する。
   */
  lb?: number;
  /** 編成組み替え（目標ボーナス変更）を伴う行の強調テキスト（例:「目標ボーナス 500%」）。 */
  bonusLabel?: string;
}

export interface PlanCanvasData {
  songTitle: string;
  meta: string[];
  rows: PlanCanvasRow[];
  summary: { label: string; value: string }[];
  accent: string;
  /** 左上の小見出し（既定「リフレッシュゲージ 周回プラン」）。 */
  heading?: string;
  /** 右下の透かし（既定「Sekai-Master / リフレッシュゲージ計算機」）。他ツールが流用するときに差し替える。 */
  footer?: string;
  /** 右カラム（percent）の確保幅px。大きい数字（累積pt等）を出すとき広げる。既定72。 */
  rightColW?: number;
  /** 焚き数アイコン（LB.png）のURL。lb を持つ行が1つでもあるときだけ使う。 */
  lbIconUrl?: string;
}

const W = 700;
const PAD = 24;
const HEADER_H = 128;
const ROW_H = 54;
/** scoreBand/lb/bonusLabel のいずれかを持つ行の高さ。2段組で情報を大きく出す分、広げる。 */
const ROW_H_EMPHASIS = 84;
const FOOTER_H = 96;
const INK = "#334155";
const MUTED = "#64748b";
const WARN = "#e11d48";
const JACKET = 34;
/** 強調行のジャケットは通常行より一段大きくする。 */
const JACKET_EMPHASIS = 40;
const LB_ICON = 22;

/** 強調行か（新フィールドを1つも持たない行は従来通りの通常行）。 */
function isEmphasisRow(r: PlanCanvasRow): boolean {
  return !!r.scoreBand || r.lb !== undefined || !!r.bonusLabel;
}

function rowHeight(r: PlanCanvasRow): number {
  return isEmphasisRow(r) ? ROW_H_EMPHASIS : ROW_H;
}

export function planCanvasHeight(rows: readonly PlanCanvasRow[]): number {
  return HEADER_H + rows.reduce((sum, r) => sum + rowHeight(r), 0) + FOOTER_H;
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
  // 焚き数アイコンは全行共通の1枚なので、ジャケットのSetループとは別に単発ロードする。
  const lbImg = data.lbIconUrl ? await loadImage(data.lbIconUrl).catch(() => undefined) : undefined;

  const H = planCanvasHeight(data.rows);
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
    const rh = rowHeight(r);
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(0,0,0,0.03)";
      ctx.fillRect(PAD, y, W - PAD * 2, rh);
    }
    if (isEmphasisRow(r)) {
      drawEmphasisRow(ctx, r, y, rh, data, imgs, lbImg);
    } else {
      drawNormalRow(ctx, r, y, data, imgs);
    }
    y += rh;
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
  ctx.fillText(data.footer ?? "Sekai-Master / リフレッシュゲージ計算機", W - PAD, H - 12);
}

/** 通常行（従来通り54px・1段組）。新フィールドを持つ行では呼ばれない＝旧描画を1pxも変えない。 */
function drawNormalRow(
  ctx: CanvasRenderingContext2D,
  r: PlanCanvasRow,
  y: number,
  data: PlanCanvasData,
  imgs: Map<string, HTMLImageElement>
): void {
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
}

/**
 * 強調行（84px・2段組）。実行時に確認すべき情報（スコア帯・焚き数・目標ボーナス）を
 * 上段の時刻/獲得Ptより大きく下段に描く。
 */
function drawEmphasisRow(
  ctx: CanvasRenderingContext2D,
  r: PlanCanvasRow,
  y: number,
  rh: number,
  data: PlanCanvasData,
  imgs: Map<string, HTMLImageElement>,
  lbImg: HTMLImageElement | undefined
): void {
  const topY = y + 16;
  // 上段: 時刻 ... 獲得Pt
  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = "12px sans-serif";
  ctx.fillText(r.time, PAD + 4, topY);
  ctx.textAlign = "right";
  ctx.fillStyle = r.warn ? WARN : data.accent;
  ctx.font = "bold 15px sans-serif";
  ctx.fillText(r.percent, W - PAD - 4, topY);

  // ジャケット＋曲名
  let labelX = PAD + 4;
  const jimg = r.jacket ? imgs.get(r.jacket) : undefined;
  const midY = y + 32;
  if (jimg) {
    roundedImage(ctx, jimg, labelX, midY - JACKET_EMPHASIS / 2, JACKET_EMPHASIS, 6);
    labelX += JACKET_EMPHASIS + 8;
  }
  const labelMax = W - PAD - 4 - labelX;
  ctx.textAlign = "left";
  ctx.fillStyle = r.warn ? WARN : INK;
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(truncate(ctx, r.label, labelMax), labelX, midY);

  // 下段: スコア帯 → 焚き数(LBアイコン) → 目標ボーナス の順に横並び。ここが主役。
  let cx = labelX;
  const bigY = y + rh - (r.sub ? 22 : 12);
  if (r.scoreBand) {
    ctx.fillStyle = r.warn ? WARN : INK;
    ctx.font = "bold 18px monospace";
    const text = `${r.scoreBand.min.toLocaleString()}〜${r.scoreBand.max.toLocaleString()}`;
    ctx.fillText(text, cx, bigY);
    cx += ctx.measureText(text).width + 14;
  }
  if (r.lb !== undefined) {
    if (lbImg) {
      ctx.drawImage(lbImg, cx, bigY - LB_ICON / 2, LB_ICON, LB_ICON);
      cx += LB_ICON + 4;
    }
    ctx.fillStyle = r.warn ? WARN : data.accent;
    ctx.font = "bold 17px sans-serif";
    const lbText = `×${r.lb}`;
    ctx.fillText(lbText, cx, bigY);
    cx += ctx.measureText(lbText).width + 14;
  }
  if (r.bonusLabel) {
    ctx.fillStyle = r.warn ? WARN : data.accent;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(truncate(ctx, r.bonusLabel, W - PAD - 4 - cx), cx, bigY);
  }
  if (r.sub) {
    ctx.fillStyle = r.warn ? WARN : MUTED;
    ctx.font = "10px sans-serif";
    ctx.fillText(truncate(ctx, r.sub, labelMax), labelX, y + rh - 8);
  }
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
