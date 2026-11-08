/**
 * カードを渡す: コード（リンク）と共有。
 *
 * コードは今までのシード値そのもの（曲名ビンゴは 50 文字、お題ビンゴは OD1:…）。
 * 埋めた状態も入っているので、リンクを開くと同じカードが同じ埋め方で出る。
 */
import { type BingoMusic, type Cell, decodeSeed, encodeSeed } from "./bingoLogic";
import { type OdaiCell, decodeOdaiSeed, encodeOdaiSeed, isOdaiSeed } from "./odaiLogic";
import type { Progress } from "./bingoProgress";

export type CardKind = "odai" | "song";

export type KindedCard = { kind: "odai"; card: OdaiCell[] } | { kind: "song"; card: Cell[] };

export const KIND_LABEL: Record<CardKind, string> = { odai: "お題ビンゴ", song: "曲名ビンゴ" };

/** リンクの ?card= の名前。 */
export const CARD_PARAM = "card";

export function cardCode(c: KindedCard): string {
  return c.kind === "odai" ? encodeOdaiSeed(c.card) : encodeSeed(c.card);
}

/** コードからカードを戻す。形で種類を見分ける。読めなければ分かる文言で例外。 */
export function decodeCardCode(code: string, musics: readonly BingoMusic[]): KindedCard {
  const trimmed = code.trim();
  if (!trimmed) throw new Error("コードが空です。");
  if (isOdaiSeed(trimmed)) return { kind: "odai", card: decodeOdaiSeed(trimmed, musics) };
  return { kind: "song", card: decodeSeed(trimmed, musics) };
}

/** 貼られたものがリンクまるごとなら ?card= の中身を、そうでなければそのままを返す。 */
export function extractCode(input: string): string {
  const trimmed = input.trim();
  const m = new RegExp(`[?&]${CARD_PARAM}=([^&#\\s]*)`).exec(trimmed);
  if (!m) return trimmed;
  try {
    return decodeURIComponent(m[1]).trim();
  } catch {
    return m[1];
  }
}

/** このカードを開くリンク。base はサイトの根（例: https://sekaimaster.pages.dev/）。 */
export function cardLink(base: string, code: string): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}bingo?${CARD_PARAM}=${encodeURIComponent(code)}`;
}

/** 共有に添える短い文。ハッシュタグは #プロセカ だけ。 */
export function shareText(kind: CardKind, p: Progress): string {
  const state = p.bingo ? "・BINGO!" : p.reach > 0 ? `・リーチ ${p.reach}` : "";
  return `チアフルカーニバルの${KIND_LABEL[kind]}（埋めたマス ${p.filled}/${p.total}${state}）#プロセカ`;
}

export type ShareResult = "shared" | "copied" | "saved" | "cancelled";

export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  copyImage?: (blob: Blob) => Promise<void>;
  download: (blob: Blob, fileName: string) => void;
}

/**
 * 画像を送れる端末（スマホ）では共有の画面へ、送れない端末（PC など）では画像をクリップボードへ、
 * それもできなければ保存する。共有の画面を閉じただけなら、ほかの方法には切り替えない。
 */
export async function shareCard(
  blob: Blob,
  meta: { text: string; url: string; fileName: string },
  env: ShareEnv
): Promise<ShareResult> {
  const file = new File([blob], meta.fileName, { type: "image/png" });
  // url を別に渡すと、画像と並べたときに文が落ちる端末がある。文の中に入れる。
  const data: ShareData = { files: [file], text: `${meta.text}\n${meta.url}` };
  if (env.share) {
    try {
      // canShare が投げる端末もあるので try の中で聞く
      if (env.canShare?.(data)) {
        await env.share(data);
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }
  if (env.copyImage) {
    try {
      await env.copyImage(blob);
      return "copied";
    } catch {
      // 権限が無いなど。保存へ回す
    }
  }
  env.download(blob, meta.fileName);
  return "saved";
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** ブラウザの機能から共有の手段を組む。 */
export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    share: nav?.share ? (data) => nav.share(data) : undefined,
    canShare: nav?.canShare ? (data) => nav.canShare(data) : undefined,
    copyImage:
      nav?.clipboard?.write && typeof ClipboardItem !== "undefined"
        ? (blob) => nav.clipboard.write([new ClipboardItem({ "image/png": blob })])
        : undefined,
    download: downloadBlob,
  };
}

export const SHARE_RESULT_TEXT: Record<ShareResult, string | null> = {
  shared: null,
  copied: "画像をコピーしました。貼り付けて共有できます",
  saved: "画像を保存しました",
  cancelled: null,
};
