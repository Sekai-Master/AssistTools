/**
 * 編成の紹介カード（PNG）。
 *
 * 周回プランの画像出力（refresh/lib/planCanvas.ts）と同じ作法:
 * **UI 側で文字列を整形して渡し、ここは描画専任**。画像は非同期で先読みし、
 * 失敗しても描画は続ける（1枚落ちても編成の数字は出る）。
 *
 * ── 構成（原神の外部ビルドカードが下敷き。寄せてはいない）──────────────
 *   [左]   リーダーのカードを大きく＋編成名・イベント名
 *   [中央] 数字（総合力・ボーナス・スキル）を縦に積む
 *   [右]   5枚を1行ずつ。誰の何を、どこまで育てて、スキルがいくつか
 *
 * ★ **立ち絵は持っていない。** 配信しているのは 128px のサムネイルだけで、
 *   フルのカード絵は1枚90〜400KB・全カードで50〜200MBになる（ジャケットは9.6MB）。
 *   そこは同じにできないので、**持っている素材の中で成立する構図**にしてある。
 *   サムネを大きく引き伸ばさず、余白と数字で見せる。
 */

export interface DeckCanvasCard {
  /** サムネイルの URL（無ければ属性色の枠だけ描く）。 */
  thumb?: string;
  name: string;
  character: string;
  /** 「Lv60 特訓 MR5 SL4」のような育成状態。 */
  sub: string;
  /** そのカードのスキル値（「150%」）。 */
  skill?: string;
  leader: boolean;
  attrColor: string;
}

export interface DeckCanvasData {
  deckName: string;
  eventName?: string;
  cards: DeckCanvasCard[];
  /** 中央に積む数字。文字列に整形済みで渡す（描画は数字の意味を知らない）。 */
  stats: { label: string; value: string; sub?: string }[];
  accent: string;
  footer?: string;
  /**
   * リーダーの立ち絵（cardArt.ts が読む1枚）。
   * ★ **無くても成立する**。取れなかったときはサムネイルを大きく置く簡易版になる。
   *   外部の生死でこの機能を止めない、という決め方（cardArt.ts 参照）。
   */
  heroArt?: HTMLImageElement | null;
}

const W = 1000;
const H = 520;
const PAD = 28;
/** 左（リーダー＋編成名）／中央（数字）／右（5枚）の3カラム。 */
const LEFT_W = 300;
const MID_X = LEFT_W + PAD * 2;
const MID_W = 300;
const RIGHT_X = MID_X + MID_W + PAD;
const HERO = 200;
const ROW_H = 78;
const THUMB = 56;

const INK = "#f1f5f9";
const MUTED = "#94a3b8";
const PANEL = "rgba(255,255,255,0.06)";

export const deckCanvasSize = () => ({ width: W, height: H });

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

  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "middle";

  const leader = data.cards.find((c) => c.leader) ?? data.cards[0];

  /**
   * ★ 地の色は**リーダーの属性色**に寄せる（Nori 指示 2026-08-02）。
   *   ツールのユニット色ではなく、その編成の顔になっているカードの色にすることで、
   *   クール染め・キュート染めが一目で分かる。属性が読めない場合だけツール色に戻す。
   *
   * ★ 読めない色が1つ混じるだけで addColorStop が例外を投げ、**描きかけの真っ黒な画像**が
   *   出る（実際に light-dark() でそうなった）。ここで最後の関門を置く。
   */
  const readable = (c: string | undefined): c is string =>
    !!c && /^(#[0-9a-f]{3,8}|rgba?\()/i.test(c.trim());
  const theme = readable(leader?.attrColor)
    ? leader!.attrColor
    : readable(data.accent)
      ? data.accent
      : "#884499";
  data = { ...data, accent: theme };

  drawBackground(ctx, theme);
  // 立ち絵が取れていれば左半分を絵で埋める。取れていなければサムネの簡易版。
  if (data.heroArt) drawHeroArt(ctx, data.heroArt);
  drawLeft(ctx, data, leader, imgs, !!data.heroArt);
  drawStats(ctx, data);
  drawCards(ctx, data, imgs);

  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = "11px sans-serif";
  ctx.fillText(data.footer ?? "Sekai-Master / 編成ビルダー", W - PAD, H - 16);
}

/** 暗い地＋ユニット色の光。数字と絵を浮かせるための下地。 */
function drawBackground(ctx: CanvasRenderingContext2D, accent: string): void {
  ctx.fillStyle = "#12151c";
  ctx.fillRect(0, 0, W, H);

  // 左上から差す光。リーダーのカードの後ろが一番明るくなる。
  const glow = ctx.createRadialGradient(LEFT_W / 2 + PAD, H / 2, 20, LEFT_W / 2 + PAD, H / 2, 420);
  glow.addColorStop(0, withAlpha(accent, 0.38));
  glow.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 右下へ抜ける薄い斜めの帯（のっぺりさせない）。
  const sweep = ctx.createLinearGradient(0, H, W, 0);
  sweep.addColorStop(0, "rgba(255,255,255,0)");
  sweep.addColorStop(0.55, "rgba(255,255,255,0.04)");
  sweep.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 5);
}

/**
 * リーダーの立ち絵を左半分に敷く。
 *
 * ★ 立ち絵は横長（1024×576）で、キャラは中央寄りに描かれている。左カラムは縦長なので
 *   **高さを合わせて中央を切り出す**（cover）。顔が切れないよう、やや上寄りに置く。
 * ★ 右端は地の色へグラデーションで溶かす。切り口をそのまま出すと貼り絵に見える。
 */
function drawHeroArt(ctx: CanvasRenderingContext2D, art: HTMLImageElement): void {
  const panelW = LEFT_W + PAD * 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, panelW, H);
  ctx.clip();

  const scale = Math.max(panelW / art.width, H / art.height);
  const w = art.width * scale;
  const h = art.height * scale;
  // 横は中央、縦はやや上（顔の位置）。
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art, (panelW - w) / 2, (H - h) * 0.35, w, h);

  // 上下と右端を暗く落として、文字が乗る場所を作る。
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(18,21,28,0.85)");
  shade.addColorStop(0.35, "rgba(18,21,28,0.15)");
  shade.addColorStop(1, "rgba(18,21,28,0.9)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, panelW, H);

  const fade = ctx.createLinearGradient(panelW - 140, 0, panelW, 0);
  fade.addColorStop(0, "rgba(18,21,28,0)");
  fade.addColorStop(1, "rgba(18,21,28,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(panelW - 140, 0, 140, H);
  ctx.restore();
}

function drawLeft(
  ctx: CanvasRenderingContext2D,
  data: DeckCanvasData,
  leader: DeckCanvasCard | undefined,
  imgs: Map<string, HTMLImageElement>,
  hasHeroArt = false
): void {
  const cx = PAD + LEFT_W / 2;

  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("編成", PAD, 40);
  ctx.fillStyle = INK;
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(truncate(ctx, data.deckName, LEFT_W), PAD, 68);
  if (data.eventName) {
    ctx.fillStyle = MUTED;
    ctx.font = "13px sans-serif";
    ctx.fillText(truncate(ctx, data.eventName, LEFT_W), PAD, 92);
  }

  if (!leader) return;

  // 立ち絵が出ているときは、サムネを重ねない（絵の上に絵を置かない）。
  // 名前だけ下に置いて、絵そのものを主役にする。
  if (hasHeroArt) {
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(truncate(ctx, leader.character, LEFT_W), PAD, H - 88);
    ctx.fillStyle = MUTED;
    ctx.font = "13px sans-serif";
    ctx.fillText(truncate(ctx, leader.name, LEFT_W), PAD, H - 64);
    ctx.fillStyle = data.accent;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("リーダー", PAD, H - 44);
    return;
  }

  const top = 130;
  const x = cx - HERO / 2;

  // 影を落として、地から浮かせる。
  ctx.save();
  ctx.shadowColor = withAlpha(data.accent, 0.55);
  ctx.shadowBlur = 36;
  ctx.fillStyle = "#0b0d12";
  roundRect(ctx, x, top, HERO, HERO, 18);
  ctx.fill();
  ctx.restore();

  const img = leader.thumb ? imgs.get(leader.thumb) : undefined;
  if (img) {
    // ★ 128px のサムネを 200px に伸ばすので、少しだけ滑らかに寄せる
    //   （素材の解像度が上がったわけではないことは docs に書いてある）。
    ctx.imageSmoothingQuality = "high";
    roundedImage(ctx, img, x, top, HERO, 18);
  } else {
    ctx.fillStyle = leader.attrColor;
    roundRect(ctx, x, top, HERO, HERO, 18);
    ctx.fill();
  }
  ctx.strokeStyle = leader.attrColor;
  ctx.lineWidth = 3;
  roundRect(ctx, x + 1.5, top + 1.5, HERO - 3, HERO - 3, 17);
  ctx.stroke();

  // リーダーであることは編成の意味が変わる（ボーナスの上乗せ）ので必ず出す。
  ctx.fillStyle = data.accent;
  roundRect(ctx, cx - 34, top + HERO - 14, 68, 24, 12);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#12151c";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("リーダー", cx, top + HERO - 1);

  ctx.fillStyle = INK;
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(truncate(ctx, leader.character, LEFT_W), cx, top + HERO + 34);
  ctx.fillStyle = MUTED;
  ctx.font = "12px sans-serif";
  ctx.fillText(truncate(ctx, leader.name, LEFT_W), cx, top + HERO + 54);
}

/** 中央の数字。上ほど大きく（見たい順）。 */
function drawStats(ctx: CanvasRenderingContext2D, data: DeckCanvasData): void {
  let y = 130;
  data.stats.forEach((s, i) => {
    const big = i === 0;
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED;
    ctx.font = "12px sans-serif";
    ctx.fillText(s.label, MID_X, y);

    ctx.fillStyle = big ? data.accent : INK;
    ctx.font = `bold ${big ? 46 : 30}px sans-serif`;
    ctx.fillText(truncate(ctx, s.value, MID_W), MID_X, y + (big ? 38 : 28));

    if (s.sub) {
      ctx.fillStyle = MUTED;
      ctx.font = "12px sans-serif";
      ctx.fillText(truncate(ctx, s.sub, MID_W), MID_X, y + (big ? 68 : 52));
    }

    y += big ? 96 : 78;
    // 区切り線。数字どうしが混ざって見えないように。
    if (i < data.stats.length - 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MID_X, y - 22);
      ctx.lineTo(MID_X + MID_W, y - 22);
      ctx.stroke();
    }
  });
}

/** 右の5枚。1行に「誰の何を・どこまで育てて・スキルいくつ」。 */
function drawCards(
  ctx: CanvasRenderingContext2D,
  data: DeckCanvasData,
  imgs: Map<string, HTMLImageElement>
): void {
  const width = W - RIGHT_X - PAD;
  data.cards.forEach((c, i) => {
    const y = 108 + i * ROW_H;
    ctx.fillStyle = PANEL;
    roundRect(ctx, RIGHT_X, y, width, ROW_H - 10, 12);
    ctx.fill();

    const tx = RIGHT_X + 10;
    const ty = y + (ROW_H - 10 - THUMB) / 2;
    const img = c.thumb ? imgs.get(c.thumb) : undefined;
    if (img) roundedImage(ctx, img, tx, ty, THUMB, 8);
    else {
      ctx.fillStyle = c.attrColor;
      roundRect(ctx, tx, ty, THUMB, THUMB, 8);
      ctx.fill();
    }
    // 属性は色でしか出ないので、枠で必ず見せる。
    ctx.strokeStyle = c.attrColor;
    ctx.lineWidth = 2;
    roundRect(ctx, tx + 1, ty + 1, THUMB - 2, THUMB - 2, 7);
    ctx.stroke();

    const textX = tx + THUMB + 12;
    const skillW = 66;
    const textMax = RIGHT_X + width - 12 - skillW - textX;

    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(truncate(ctx, c.character, textMax), textX, y + 22);
    ctx.fillStyle = MUTED;
    ctx.font = "12px sans-serif";
    ctx.fillText(truncate(ctx, c.name, textMax), textX, y + 41);
    ctx.font = "11px sans-serif";
    ctx.fillText(truncate(ctx, c.sub, textMax), textX, y + 58);

    if (c.skill) {
      ctx.textAlign = "right";
      ctx.fillStyle = data.accent;
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(c.skill, RIGHT_X + width - 12, y + 30);
      ctx.fillStyle = MUTED;
      ctx.font = "10px sans-serif";
      ctx.fillText("スキル", RIGHT_X + width - 12, y + 48);
    }
  });
}

/**
 * 色に不透明度を足す。
 *
 * ★★ canvas は CSS の関数記法（`light-dark(...)` など）を解釈できない。★★
 *   このアプリのユニット色は配色切り替えのために `light-dark()` で定義されていて、
 *   CSS 変数の中身をそのまま渡すと `addColorStop` が例外を投げ、
 *   **描画が途中で止まって真っ黒な画像が出る**（実際にそうなった）。
 *   呼び出し側は resolveColor() で解決済みの色を渡すこと。ここでは
 *   #rrggbb と rgb()/rgba() の両方を受け、読めない形なら不透明度を諦めて素通しする。
 */
function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (r && g && b) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

/**
 * CSS の色（`var(--unit-color)` の中身や `light-dark()`）を、canvas が読める形へ解決する。
 * ブラウザに一度描かせて計算済みの値（rgb(...)）を読む。
 */
export function resolveColor(source: Element | null, value: string, fallback = "#884499"): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  (source?.parentElement ?? document.body).appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
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
