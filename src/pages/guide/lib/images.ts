/**
 * 知識ガイドの画像（ゲームの撮影）の台帳。撮影の番号 → ファイル。
 *
 * ★ 載せるのは**伏せた版（screenshots-masked）から作ったものだけ**。他のプレイヤーの名前・称号と
 *   運営者の表示名を伏せる前の元の撮影は、リポジトリに入れない。public/guide/ にほかのファイルが
 *   紛れ込んでいないことは images.test.ts がファイル名の一覧を固定して照合している。
 * - 原稿の `［画像N: 題］` の N がここの番号。どの撮影がどのファイルかの正本は、ガイドの作業フォルダの
 *   figures/README.md の表（撮影の番号・中身・伏せた所）
 * - 1 つの撮影に複数のファイルがあるとき（4・8・10）は、並べて出す。alt は「題（note）」で区別する
 * - 画像は scripts/make-guide-images.mjs で作る（幅 1600px の WebP）。width・height は実物の画素数で、
 *   読み込み中に枠の高さを取っておくのに使う（images.test.ts が実物と照合する）
 */

export interface GuideImageFile {
  /** public/guide/ からの相対のファイル名（囲みを描いた版は annotated/…）。 */
  file: string;
  /** 同じ撮影の中で見分けるための短い説明。1 枚だけのときは空。 */
  note: string;
  width: number;
  height: number;
}

const W = 1600;
const H = 1112;
const one = (file: string, note = ""): GuideImageFile => ({ file, note, width: W, height: H });

/**
 * 撮影の番号（「3」）と、番号の囲みを描き込んだ撮影（「A1」〜。入口のページ用）→ ファイル。
 * ★ A の画像は public/guide/annotated/。囲みを描く前の元も伏せた版（screenshots-masked）。
 */
export const GUIDE_IMAGES: Readonly<Record<string, readonly GuideImageFile[]>> = {
  1: [one("02-room-select.webp")],
  2: [one("05-private-room.webp")],
  3: [one("09-room-matching.webp")],
  4: [one("10-stamp-favorites-edit.webp", "スタンプを選ぶ画面"), one("11-menu-stamp.webp", "メニューの入口")],
  5: [one("16-deck.webp")],
  6: [one("17-skill-judge-dependent.webp")],
  7: [one("13-livebonus-consume-matching.webp")],
  8: [one("31-result-points.webp", "イベントポイントの結果"), one("32-result-score.webp", "スコアの結果")],
  9: [one("23-event-top.webp")],
  10: [
    one("24-event-top-refresh-tooltip.webp", "イベントのトップの表示"),
    one("26-refresh-gauge-info.webp", "ゲージの説明"),
  ],
  11: [one("30-option-timing-20.webp")],
  12: [one("14-livebonus-consume-countdown.webp")],
  A1: [one("annotated/02-room-select.webp")],
  A2: [one("annotated/09-room-matching.webp")],
  A3: [one("annotated/13-livebonus-consume-matching.webp")],
  A4: [one("annotated/24-event-top-refresh-tooltip.webp")],
  A5: [one("annotated/31-result-points.webp")],
};

/** 台帳に無い番号は undefined（Object のプロトタイプの名前も拾わない）。 */
export function guideImagesOf(key: string | number): readonly GuideImageFile[] | undefined {
  const k = String(key);
  return Object.prototype.hasOwnProperty.call(GUIDE_IMAGES, k) ? GUIDE_IMAGES[k] : undefined;
}

/** img の src。public からの相対パスに BASE_URL を付ける。 */
export const guideImageSrc = (base: string, f: GuideImageFile) => `${base}guide/${f.file}`;
