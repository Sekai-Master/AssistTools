/**
 * 編成の紹介カード（PNG）。
 *
 * 周回プランの画像出力（refresh/lib/planCanvas.ts）と同じ作法:
 * **UI 側で文字列を整形して渡し、ここは描画専任**。画像は非同期で先読みし、
 * 失敗しても描画は続ける（1枚落ちても編成の数字は出る）。
 *
 * ── 構成（Nori 指示 2026-08-02）─────────────────────────────────
 *   全体は **16:9**（SNS に貼ったときに切れない）。
 *   [左]   リーダーの立ち絵。**数字はその上に重ねて左寄せ**にする
 *   [中央] 情報が薄くなるので、あしらい（丸・輪・三角）をここに寄せる
 *   [右]   5枚を1行ずつ。属性の光は**右端から半円**で入れる
 *   [下]   総合力の内訳（載せるモードのときだけ）
 *
 * ★ **立ち絵は★4と birthday しか持っていない**（容量）。無いときはサムネイルを
 *   大きく置く簡易版に落ちる。外部からは取らない（cardArt.ts に理由）。
 */

import { resolveColor } from "../../../lib/canvasColor";

export interface DeckCanvasCard {
  /** サムネイルの URL（無ければ属性色の枠だけ描く）。 */
  thumb?: string;
  name: string;
  character: string;
  /** 「Lv60 特訓 SL4」のような育成状態。**マスターランクは含めない**（ひし形で描く）。 */
  sub: string;
  /** そのカードのスキル値（「150%」）。 */
  skill?: string;
  /** マスターランク（0〜5）。ゲームと同じくカードの左下にひし形で出す。 */
  masterRank?: number;
  leader: boolean;
  attrColor: string;
}

export interface DeckCanvasData {
  deckName: string;
  /** 任意のプレイヤー名。入っていれば右上に小さく出す。 */
  playerName?: string;
  eventName?: string;
  cards: DeckCanvasCard[];
  /** 左に積む数字。文字列に整形済みで渡す（描画は数字の意味を知らない）。 */
  stats: { label: string; value: string; sub?: string }[];
  accent: string;
  footer?: string;
  /** イベントのロゴ（自前配信の1枚）。無ければイベント名のテキストだけ。 */
  eventLogo?: HTMLImageElement | null;
  /** 総合力の内訳など。**載せるモードのときだけ**渡す。 */
  details?: { label: string; value: string }[];
  /** リーダーの立ち絵。無ければサムネイルの簡易版になる。 */
  heroArt?: HTMLImageElement | null;
}

/** ★ 16:9。SNS のプレビューで上下が切られないための比率。 */
const W = 1200;
const H = 675;
const PAD = 32;

/** 立ち絵を敷く幅。右のカード欄の手前まで伸ばして、境目はぼかす。 */
const ART_W = 812;
/**
 * 右カラム（5枚）。
 * ★ ロゴを右上からどけたぶん、**一回り大きく**取る（Nori 指示 2026-08-02）。
 *   上に詰めて、行の高さとサムネイルも上げる。
 */
const RIGHT_X = 828;
const RIGHT_W = W - PAD - RIGHT_X;
const ROW_H = 96;
const CARDS_TOP = 92;
const THUMB = 66;
/** 内訳の帯（載せるときだけ）。**16:9 の中に収める**ので高さは増やさない。 */
const DETAIL_H = 76;

const INK = "#f1f5f9";
const MUTED = "#a7b0be";
const PANEL = "rgba(255,255,255,0.07)";
const BG = "#12151c";

/** プロセカらしいあしらいの色（ピンク・エメラルド・白）。 */
const DECO_COLORS = ["#ff5fa2", "#3ddc97", "#ffffff"];

export const deckCanvasSize = () => ({ width: W, height: H });

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function drawDeckCanvas(
  canvas: HTMLCanvasElement,
  data: DeckCanvasData,
): Promise<void> {
  const urls = [
    ...new Set(data.cards.map((c) => c.thumb).filter((u): u is string => !!u)),
  ];
  const imgs = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map((u) =>
      loadImage(u)
        .then((img) => imgs.set(u, img))
        .catch(() => undefined),
    ),
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
   * ★ 地の色は**リーダーの属性色**に寄せる。その編成の顔になっているカードの色に
   *   することで、クール染め・キュート染めが一目で分かる。
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

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  if (data.heroArt) drawHeroArt(ctx, data.heroArt);
  else drawHeroFallback(ctx, leader, imgs, theme);

  drawTypeGlow(ctx, theme);
  drawDeco(ctx);
  drawScrim(ctx);

  drawHeader(ctx, data);
  drawStats(ctx, data, theme, !!data.details?.length);
  drawLeader(ctx, leader, theme, !!data.details?.length);
  drawCards(ctx, data, imgs, theme);
  if (data.details?.length) drawDetails(ctx, data);

  // ★ 上端の線は**立ち絵の上まで通す**。地の上に描くと絵で切れて、
  //   線が途中から始まっているように見える。
  ctx.fillStyle = theme;
  ctx.fillRect(0, 0, W, 5);

  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = "11px sans-serif";
  ctx.fillText(data.footer ?? "Sekai-Master / 編成ビルダー", W - PAD, H - 14);
}

/**
 * リーダーの立ち絵。左を広く使い、右端は地の色へ溶かす。
 *
 * ★ 立ち絵は横長（2338×1440）。縦を合わせて中央を切り出す（cover）。顔が切れないよう
 *   やや上寄りに置く。
 * ★★ **ぼかしはクリップの中だけで行う。** ★★ クリップの外まで地の色を塗ると、
 *   背景の光がその矩形だけ消えて縦に明るさの段差が出る（＝境界が汚く見える正体）。
 */
function drawHeroArt(
  ctx: CanvasRenderingContext2D,
  art: HTMLImageElement,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ART_W, H);
  ctx.clip();

  const scale = Math.max(ART_W / art.width, H / art.height);
  const w = art.width * scale;
  const h = art.height * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art, (ART_W - w) / 2, (H - h) * 0.32, w, h);

  const fadeW = 240;
  const fade = ctx.createLinearGradient(ART_W - fadeW, 0, ART_W, 0);
  fade.addColorStop(0, "rgba(18,21,28,0)");
  fade.addColorStop(0.4, "rgba(18,21,28,0.4)");
  fade.addColorStop(0.75, "rgba(18,21,28,0.86)");
  fade.addColorStop(1, "rgba(18,21,28,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(ART_W - fadeW, 0, fadeW, H);
  ctx.restore();
}

/** 立ち絵を持たないカード（★3以下）のとき。サムネイルを大きめに置く。 */
function drawHeroFallback(
  ctx: CanvasRenderingContext2D,
  leader: DeckCanvasCard | undefined,
  imgs: Map<string, HTMLImageElement>,
  theme: string,
): void {
  if (!leader) return;
  const size = 210;
  const x = 84;
  const y = 190;
  ctx.save();
  ctx.shadowColor = withAlpha(theme, 0.5);
  ctx.shadowBlur = 36;
  ctx.fillStyle = "#0b0d12";
  roundRect(ctx, x, y, size, size, 18);
  ctx.fill();
  ctx.restore();

  const img = leader.thumb ? imgs.get(leader.thumb) : undefined;
  if (img) {
    ctx.imageSmoothingQuality = "high";
    roundedImage(ctx, img, x, y, size, 18);
  } else {
    ctx.fillStyle = leader.attrColor;
    roundRect(ctx, x, y, size, size, 18);
    ctx.fill();
  }
  ctx.strokeStyle = leader.attrColor;
  ctx.lineWidth = 3;
  roundRect(ctx, x + 1.5, y + 1.5, size - 3, size - 3, 17);
  ctx.stroke();
  drawMasterRank(ctx, x + 26, y + size - 24, 40, leader.masterRank);
}

/**
 * 属性の光。**右端から半円**で入れる（Nori 指示 2026-08-02）。
 * 左は立ち絵、右はカード欄なので、光は右の縁から中央へ向かって効かせる。
 */
function drawTypeGlow(ctx: CanvasRenderingContext2D, theme: string): void {
  const g = ctx.createRadialGradient(W, H / 2, 40, W, H / 2, 620);
  g.addColorStop(0, withAlpha(theme, 0.42));
  g.addColorStop(0.5, withAlpha(theme, 0.16));
  g.addColorStop(1, withAlpha(theme, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * プロセカらしいあしらい（ピンク・エメラルド・白の丸・輪・三角）。
 *
 * ★ **右端から湧かせる**（Nori 指示 2026-08-02）。属性の光と発生源を揃えると、
 *   右から光と粒が一緒に流れてくる形になって画面がまとまる。左へ行くほど疎になり、
 *   立ち絵と数字の側は空けたままになる。
 * ★ カードの一覧より**先に**描く。カードの板は半透明なので、粒が奥に透けて見える。
 * ★ 数は少なく、大きさはばらつかせる。乱数は**固定の種**から作る
 *  （毎回違う配置だと「同じ編成なのに違う画像」に見える）。
 */
function drawDeco(ctx: CanvasRenderingContext2D): void {
  let seed = 20260802;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  ctx.save();
  for (let i = 0; i < 24; i++) {
    // 右端を基点に、左へ行くほど疎になるよう偏らせる（t を累乗して寄せる）。
    const t = rand();
    const x = W - t * t * 700 + (rand() - 0.5) * 40;
    const y = 30 + rand() * (H - 90);
    const color = DECO_COLORS[Math.floor(rand() * DECO_COLORS.length)];
    // ★ 大小の差を大きく取る（小さい粒と大きい輪が混ざっている状態にする）。
    const s = rand();
    const size = 6 + s * s * 62;
    // カードの一覧に重なる粒は少し薄くする（スキル値の数字を潰さない）。
    const overCards =
      x > RIGHT_X - 20 && y > CARDS_TOP - 20 && y < CARDS_TOP + ROW_H * 5;
    ctx.globalAlpha = (0.08 + rand() * 0.2) * (overCards ? 0.6 : 1);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    const kind = rand();
    if (kind < 0.3) {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind < 0.7) {
      // 縁だけの輪。塗りつぶしばかりだと単調になる。
      ctx.lineWidth = Math.max(1.5, size * 0.1);
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, size / 2);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * 文字を乗せる場所だけ暗く落とす。
 * ★ 数字を絵の上に重ねるので、**背景処理をしないと読めない**（Nori 指示）。
 *   絵そのものは殺したくないので、左端と下端からのグラデーションだけにする。
 */
function drawScrim(ctx: CanvasRenderingContext2D): void {
  const left = ctx.createLinearGradient(0, 0, 560, 0);
  left.addColorStop(0, "rgba(10,12,17,0.86)");
  left.addColorStop(0.55, "rgba(10,12,17,0.45)");
  left.addColorStop(1, "rgba(10,12,17,0)");
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, 560, H);

  const bottom = ctx.createLinearGradient(0, H - 190, 0, H);
  bottom.addColorStop(0, "rgba(10,12,17,0)");
  bottom.addColorStop(1, "rgba(10,12,17,0.8)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H - 190, ART_W, 190);

  const top = ctx.createLinearGradient(0, 0, 0, 140);
  top.addColorStop(0, "rgba(10,12,17,0.72)");
  top.addColorStop(1, "rgba(10,12,17,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, ART_W, 140);
}

function drawHeader(ctx: CanvasRenderingContext2D, data: DeckCanvasData): void {
  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("編成", PAD, 42);
  ctx.fillStyle = INK;
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(truncate(ctx, data.deckName, 460), PAD, 72);
  // ロゴを出しているときは、同じことを2回書かない。
  if (data.eventName && !data.eventLogo) {
    ctx.fillStyle = MUTED;
    ctx.font = "13px sans-serif";
    ctx.fillText(truncate(ctx, data.eventName, 460), PAD, 98);
  }

  // ★ プレイヤー名は任意。入っているときだけ、右上の空いた場所に小さく置く
  //   （ロゴをボーナスの隣へ移したので、ここが空いている）。
  if (data.playerName) {
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(truncate(ctx, data.playerName, 280), W - PAD, 44);
  }
}

/** 数字は左寄せで絵に重ねる。上ほど大きく（見たい順）。 */
function drawStats(
  ctx: CanvasRenderingContext2D,
  data: DeckCanvasData,
  theme: string,
  hasDetails: boolean,
): void {
  // 内訳を載せるときは、その帯のぶん上へ詰める。
  let y = hasDetails ? 210 : 250;
  data.stats.forEach((s, i) => {
    const big = i === 0;
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED;
    ctx.font = "12px sans-serif";
    ctx.fillText(s.label, PAD, y);

    ctx.fillStyle = big ? theme : INK;
    ctx.font = `bold ${big ? 54 : 32}px sans-serif`;
    // 絵の上なので、数字にだけ薄い影を落として輪郭を立てる。
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 10;
    const shown = truncate(ctx, s.value, 420);
    const valueY = y + (big ? 42 : 28);
    ctx.fillText(shown, PAD, valueY);
    ctx.restore();

    // ★ イベントのロゴは**イベントボーナスの値の右隣**（Nori 指示 2026-08-02）。
    //   どのイベントのボーナスなのかが、数字とひと続きで読める。
    if (data.eventLogo && s.label.includes("イベントボーナス")) {
      const logo = data.eventLogo;
      const maxH = 62;
      const maxW = 250;
      const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
      const w = logo.width * scale;
      const h = logo.height * scale;
      ctx.drawImage(
        logo,
        PAD + ctx.measureText(shown).width + 22,
        valueY - h / 2,
        w,
        h,
      );
    }

    if (s.sub) {
      ctx.fillStyle = MUTED;
      ctx.font = "12px sans-serif";
      ctx.fillText(truncate(ctx, s.sub, 420), PAD, y + (big ? 74 : 54));
    }
    y += big ? 104 : 82;
  });
}

/** リーダーの名前。絵の主役なので左下に置く。 */
function drawLeader(
  ctx: CanvasRenderingContext2D,
  leader: DeckCanvasCard | undefined,
  theme: string,
  hasDetails: boolean,
): void {
  if (!leader) return;
  const bottom = H - (hasDetails ? DETAIL_H + 18 : 30);
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(truncate(ctx, leader.character, 460), PAD, bottom - 46);
  ctx.fillStyle = MUTED;
  ctx.font = "13px sans-serif";
  ctx.fillText(truncate(ctx, leader.name, 460), PAD, bottom - 24);
  ctx.fillStyle = theme;
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("リーダー", PAD, bottom - 5);
}

/** 右の5枚。1行に「誰の何を・どこまで育てて・スキルいくつ」。 */
function drawCards(
  ctx: CanvasRenderingContext2D,
  data: DeckCanvasData,
  imgs: Map<string, HTMLImageElement>,
  theme: string,
): void {
  data.cards.forEach((c, i) => {
    const y = CARDS_TOP + i * ROW_H;
    ctx.fillStyle = PANEL;
    roundRect(ctx, RIGHT_X, y, RIGHT_W, ROW_H - 10, 12);
    ctx.fill();

    const tx = RIGHT_X + 12;
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
    // マスターランクはゲームと同じくカードの左下にひし形で。
    drawMasterRank(ctx, tx + 12, ty + THUMB - 11, 21, c.masterRank);

    const textX = tx + THUMB + 12;
    const skillW = 68;
    const textMax = RIGHT_X + RIGHT_W - 12 - skillW - textX;

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
      ctx.fillStyle = theme;
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(c.skill, RIGHT_X + RIGHT_W - 12, y + 30);
      ctx.fillStyle = MUTED;
      ctx.font = "10px sans-serif";
      ctx.fillText("スキル", RIGHT_X + RIGHT_W - 12, y + 48);
    }
  });
}

/**
 * マスターランクのひし形。
 *
 * ★ ゲームではカードの**左下**に、緑基調のグラデーション＋銀の縁取りのひし形で出る。
 *   同じ見え方にしておくと、ゲーム画面と見比べたときに迷わない（Nori 指示 2026-08-02）。
 *   0 のときは出さない（ゲームでも付かない）。
 */
function drawMasterRank(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  mr: number | undefined,
): void {
  if (!mr) return;
  const r = size / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  // 上が緑・下が暗い灰（45度回してあるので回転前の対角が画面の上下になる）。
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, "#1D6633");
  g.addColorStop(1, "#515151");
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, size, size);
  const s = ctx.createLinearGradient(-r, -r, r, r);
  s.addColorStop(0, "#ffffff");
  s.addColorStop(0.5, "#c8ccd4");
  s.addColorStop(1, "#8b93a1");
  ctx.strokeStyle = s;
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  ctx.strokeRect(-r, -r, size, size);
  ctx.restore();

  // ★ 数字はひし形いっぱいまで大きく（小さいと何の数字か分からない）。
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(size * 0.82)}px sans-serif`;
  ctx.fillText(String(mr), cx, cy + size * 0.02);
  ctx.restore();
}

/** 総合力の内訳など。**16:9 の中の下端**に敷く（画像は高くしない）。 */
function drawDetails(
  ctx: CanvasRenderingContext2D,
  data: DeckCanvasData,
): void {
  const items = data.details ?? [];
  const y = H - DETAIL_H - 4;
  const x0 = PAD;
  const bandW = W - PAD * 2;
  ctx.fillStyle = "rgba(10,12,17,0.62)";
  roundRect(ctx, x0, y, bandW, DETAIL_H - 24, 12);
  ctx.fill();

  const cols = Math.min(items.length, 7);
  const cellW = bandW / Math.max(cols, 1);
  items.forEach((d, i) => {
    const cx = x0 + cellW * (i % cols) + cellW / 2;
    const cy = y + 18 + Math.floor(i / cols) * 30;
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = "11px sans-serif";
    ctx.fillText(truncate(ctx, d.label, cellW - 8), cx, cy);
    ctx.fillStyle = INK;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(truncate(ctx, d.value, cellW - 8), cx, cy + 19);
  });
}

/** 呼び出し側（SharePanel）が従来どおり deckCanvas から取れるように通す。 */
export { resolveColor };

/**
 * 色に不透明度を足す。
 *
 * ★★ canvas は CSS の関数記法（`light-dark(...)` など）を解釈できない。★★
 *   このアプリのユニット色は配色切り替えのために `light-dark()` で定義されていて、
 *   CSS 変数の中身をそのまま渡すと `addColorStop` が例外を投げ、
 *   **描画が途中で止まって真っ黒な画像が出る**（実際にそうなった）。
 *   呼び出し側は resolveColor() で解決済みの色を渡すこと。
 */
function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    // 3桁（#abc）は6桁へ、8桁（#rrggbbaa）は末尾を落とす。
    if (h.length === 3) h = h.replace(/./g, (ch) => ch + ch);
    if (h.length >= 6) {
      const n = parseInt(h.slice(0, 6), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (r && g && b) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
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
  r: number,
): void {
  ctx.save();
  roundRect(ctx, x, y, size, size, r);
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
