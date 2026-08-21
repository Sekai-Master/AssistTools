/**
 * 周回プランを画像(canvas)に描画する。共有用にPNGで書き出す。
 * UI側で行の文字列を整形して渡す（canvasは描画専任）。ジャケットは非同期ロード。
 *
 * R6: ポイント調整の統合画像から「目標スコア域・焚き数・目標ボーナス」を
 * 強調表示したい要望が来たため、任意フィールド（scoreBand/lb/bonusLabel）を
 * 追加した。これらを持たない行（refresh 本来の周回行・worktime）は
 * 従来通りの1行54px描画のまま1pxも変えない（isEmphasisRow が false を返す）。
 */
import { TOOLS } from "../../../tools";
import { ensureContrast } from "../../../lib/canvasColor";

/** 画像右下の透かし。ツール名の正本は登録簿（src/tools.ts）。 */
export function watermark(toolId: string): string {
  const name = TOOLS.find((t) => t.id === toolId)?.name;
  return name ? `Sekai-Master / ${name}` : "Sekai-Master";
}

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
  /**
   * scoreBand を持たない強調行の、下段先頭に出す代替テキスト（例「叩かない（スコア0）」）。
   * scoreBand と scoreText はどちらか一方だけを使う（両方あれば scoreBand 優先）。
   * これにより「スコア0で締める」行も他行と同じ横一列レイアウトに揃う。
   */
  scoreText?: string;
}

export interface PlanCanvasData {
  songTitle: string;
  meta: string[];
  rows: PlanCanvasRow[];
  summary: { label: string; value: string }[];
  accent: string;
  /** 左上の小見出し（既定「リフレッシュゲージ 周回プラン」）。 */
  heading?: string;
  /**
   * 右下の透かし。**流用するツールは必ず渡すこと。**
   * ★ 既定はリフレッシュゲージ計算機の名前なので、渡し忘れると
   *   **別のツールの画像に「リフレッシュゲージ計算機」と書かれて出る**
   *  （必要稼働時間計算で実際にそうなっていた。2026-08-21 修正）。
   *   `watermark(toolId)` を使えば tools.ts の名前から作れる。
   */
  footer?: string;
  /** 右カラム（percent）の確保幅px。大きい数字（累積pt等）を出すとき広げる。既定72。 */
  rightColW?: number;
  /** 焚き数アイコン（LB.png）のURL。lb を持つ行が1つでもあるときだけ使う。 */
  lbIconUrl?: string;
  /**
   * 獲得Pt・フッター数値の色。省略時は accent（＝ユニットカラー。refresh 従来どおり）。
   * 明るいユニットカラーは薄グレー背景でコントラストが弱いため、ポイント調整の
   * 統合画像は濃い緑（ANALYZER_GREEN）を渡してPtの視認性を上げる。
   */
  valueColor?: string;
  /**
   * ヘッダーの目標の直下に緑・太字で大きく出す差分行（例「差分 80,527 Pt」）。
   * ユーザーが一番知りたい「あといくつか」を視線の起点にする。省略時は出さない。
   */
  diffLabel?: string;
}

/**
 * 文字に使うアクセント色。**地に対して読める濃さを必ず通す。**
 * ★ 上辺の帯のような面はユニット色そのままでよいが、**数字は潰れる**。
 *   MORE MORE JUMP! の緑は地に対して約1.7:1 で、到達ポイントが最初に読めなくなる。
 */
function textAccent(data: PlanCanvasData): string {
  return ensureContrast(data.valueColor ?? data.accent, BG);
}

/**
 * Pt強調用の濃い緑（ポイント調整アナライザーが渡す）。
 * ★ これ自体も地に対して 3.01:1 しかないので、textAccent() がさらに少し暗くする。
 *   色を選び直すのではなく、通り道を1つにして全ツールまとめて面倒を見る。
 */
export const ANALYZER_GREEN = "#2e9e4f";

const W = 700;
const PAD = 24;
const HEADER_H = 128;
const ROW_H = 54;
/** scoreBand/lb/bonusLabel のいずれかを持つ行の高さ。2段組で情報を大きく出す分、広げる。 */
const ROW_H_EMPHASIS = 84;
const FOOTER_H = 96;
/** 書き出し画像の地。文字色のコントラストはこれを基準に決める。 */
const BG = "#f0f0f0";
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

export async function drawPlanCanvas(
  canvas: HTMLCanvasElement,
  data: PlanCanvasData,
): Promise<void> {
  // ジャケットを先読み（失敗は無視）
  const urls = [
    ...new Set(data.rows.map((r) => r.jacket).filter((u): u is string => !!u)),
  ];
  const imgs = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map((u) =>
      loadImage(u)
        .then((img) => imgs.set(u, img))
        .catch(() => undefined),
    ),
  );
  // 焚き数アイコンは全行共通の1枚なので、ジャケットのSetループとは別に単発ロードする。
  const lbImg = data.lbIconUrl
    ? await loadImage(data.lbIconUrl).catch(() => undefined)
    : undefined;

  const H = planCanvasHeight(data.rows);
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "middle";

  ctx.fillStyle = BG;
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
  // 差分（あといくつか）を目標の右に緑・太字で添え、視線の起点にする。
  if (data.diffLabel) {
    const tw = ctx.measureText(
      truncate(ctx, data.songTitle, W - PAD * 2),
    ).width;
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = textAccent(data);
    ctx.fillText(data.diffLabel, PAD + tw + 16, 61);
  }
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
    ctx.fillStyle = textAccent(data);
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(s.value, cx, fy + 44);
  });

  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = "11px sans-serif";
  ctx.fillText(
    data.footer ?? "Sekai-Master / リフレッシュゲージ計算機",
    W - PAD,
    H - 12,
  );
}

/** 通常行（従来通り54px・1段組）。新フィールドを持つ行では呼ばれない＝旧描画を1pxも変えない。 */
function drawNormalRow(
  ctx: CanvasRenderingContext2D,
  r: PlanCanvasRow,
  y: number,
  data: PlanCanvasData,
  imgs: Map<string, HTMLImageElement>,
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
  ctx.fillStyle = r.warn ? WARN : textAccent(data);
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(r.percent, W - PAD - 4, cy);
}

/**
 * 強調行（84px・グリッド）。依頼者の構成案どおり4ブロックに固定する:
 *   [左] ジャケット（縦センター・大）
 *   [中央 上段] 種別ラベル（小・灰）＋ 曲名（大）
 *   [中央 下段] 目標スコア帯 or「叩かない」｜ 🔋焚き数 ｜ ボーナス% を横一列
 *   [右] 獲得Pt（縦センター・右端揃え・濃い緑）
 * どの行も同じ座標系で描くので、スコア0行（scoreBand なし）も他行とレイアウトが揃う。
 * ジャケットの上には一切テキストを描かない（旧実装のオーバーラップを解消）。
 */
function drawEmphasisRow(
  ctx: CanvasRenderingContext2D,
  r: PlanCanvasRow,
  y: number,
  rh: number,
  data: PlanCanvasData,
  imgs: Map<string, HTMLImageElement>,
  lbImg: HTMLImageElement | undefined,
): void {
  const cy = y + rh / 2;
  const valueColor = textAccent(data);
  const rightColW = data.rightColW ?? 110;

  // [左] ジャケット（縦センター）。以降のテキストはすべてこの右側にしか描かない。
  let textX = PAD + 8;
  const jimg = r.jacket ? imgs.get(r.jacket) : undefined;
  if (jimg) {
    roundedImage(
      ctx,
      jimg,
      PAD + 8,
      cy - JACKET_EMPHASIS / 2,
      JACKET_EMPHASIS,
      8,
    );
    textX = PAD + 8 + JACKET_EMPHASIS + 12;
  }
  const textMax = W - PAD - rightColW - textX;

  // [右] 獲得Pt（縦センター・右端揃え・濃い緑）。右端の縦ラインを全行で揃える。
  ctx.textAlign = "right";
  ctx.fillStyle = r.warn ? WARN : valueColor;
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(r.percent, W - PAD - 4, cy);

  // [中央 上段] 種別ラベル（灰・小）＋ 曲名（大）。曲名の位置は全行で統一。
  ctx.textAlign = "left";
  const topY = y + 26;
  let tx = textX;
  if (r.time) {
    ctx.fillStyle = r.warn ? WARN : MUTED;
    ctx.font = "12px sans-serif";
    ctx.fillText(r.time, tx, topY);
    tx += ctx.measureText(r.time).width + 8;
  }
  ctx.fillStyle = r.warn ? WARN : INK;
  ctx.font = "bold 15px sans-serif";
  ctx.fillText(truncate(ctx, r.label, textX + textMax - tx), tx, topY);

  // [中央 下段] スコア帯(or 叩かない) → 焚き数 → ボーナス を横一列。ここが主役。
  const botY = y + 58;
  let cx = textX;
  if (r.scoreBand) {
    ctx.fillStyle = r.warn ? WARN : INK;
    ctx.font = "bold 17px monospace";
    const text = `${r.scoreBand.min.toLocaleString()}〜${r.scoreBand.max.toLocaleString()}`;
    ctx.fillText(text, cx, botY);
    cx += ctx.measureText(text).width + 16;
  } else if (r.scoreText) {
    ctx.fillStyle = r.warn ? WARN : INK;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(r.scoreText, cx, botY);
    cx += ctx.measureText(r.scoreText).width + 16;
  }
  if (r.lb !== undefined) {
    if (lbImg) {
      ctx.drawImage(lbImg, cx, botY - LB_ICON / 2, LB_ICON, LB_ICON);
      cx += LB_ICON + 3;
    }
    ctx.fillStyle = r.warn ? WARN : valueColor;
    ctx.font = "bold 16px sans-serif";
    const lbText = `×${r.lb}`;
    ctx.fillText(lbText, cx, botY);
    cx += ctx.measureText(lbText).width + 16;
  }
  if (r.bonusLabel) {
    ctx.fillStyle = r.warn ? WARN : valueColor;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(
      truncate(ctx, r.bonusLabel, W - PAD - rightColW - cx),
      cx,
      botY,
    );
  }
}

function roundedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  r: number,
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

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW)
    t = t.slice(0, -1);
  return t + "…";
}
