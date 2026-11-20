/**
 * まとめ画像を、スマホの共有の画面で「写真に保存」する。
 *
 * - ボタンは 2 つ（検分 G1 の H1 を受けた指揮の判断 2026-11-12）
 *   - 「まとめてダウンロード（zip）」: いつも出す。ただの a[download]（このファイルの外）
 *   - 「写真に保存（共有）」: 指で操作する端末（pointer: coarse）で、ファイルを共有できるときだけ出す。
 *     パソコンの Chrome・Edge・Safari も canShare({ files }) が真になるが、OS の共有の画面には
 *     「保存」が無いので、パソコンには出さない
 * - 作法はビンゴの共有（src/pages/bingo/bingoShare.ts）と同じ: canShare は投げる端末があるので try の中で聞く
 * - 共有の画面を閉じただけ（AbortError）なら何も出さない
 * ★ Safari は、押してから時間が空く（画像を取りに行く）と共有を拒む（NotAllowedError）。画像は
 *   ボタンに指を置いた時点で先読みし、それでも拒まれたら「もう一度押す」を案内する。2 回目は取りに行かずに開ける。
 *   取ってあったのに拒まれる端末には、zip を案内する
 */
export type ShareCardsResult = "shared" | "cancelled" | "retry" | "failed";

export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  /** 指で操作する端末か（matchMedia("(pointer: coarse)")）。 */
  coarse: () => boolean;
  /** 画像を取ってくる（fetch）。 */
  fetchBlob: (url: string) => Promise<Blob>;
}

export interface ShareCardsInput {
  cards: { url: string; fileName: string }[];
  /** 前に取った File（先読み・2 回目の押下）。 */
  cached?: File[];
}

/** 6 枚を File にする（先読みにも使う）。 */
export async function fetchCardFiles(input: Pick<ShareCardsInput, "cards">, env: Pick<ShareEnv, "fetchBlob">): Promise<File[]> {
  return Promise.all(
    input.cards.map(async (c) => new File([await env.fetchBlob(c.url)], c.fileName, { type: "image/png" })),
  );
}

/** 「写真に保存（共有）」を出すか: 指で操作する端末で、画像のファイルを共有できる。 */
export function canShareToPhotos(env: Pick<ShareEnv, "share" | "canShare" | "coarse">): boolean {
  if (!env.share || !env.canShare || typeof File === "undefined") return false;
  try {
    return env.coarse() && env.canShare({ files: [new File([""], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export async function shareCards(
  input: ShareCardsInput,
  env: ShareEnv,
  onFiles?: (files: File[]) => void,
): Promise<ShareCardsResult> {
  if (!canShareToPhotos(env)) return "failed";
  try {
    const files = input.cached ?? (await fetchCardFiles(input, env));
    onFiles?.(files);
    const data: ShareData = { files };
    if (!env.canShare!(data)) return "failed";
    await env.share!(data);
    return "shared";
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return "cancelled";
    // 取りに行ったせいで拒まれたなら、もう一度押してもらう。取ってあったのに拒まれる端末は zip を案内
    if (e instanceof Error && e.name === "NotAllowedError" && !input.cached) return "retry";
    return "failed";
  }
}

export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    share: nav?.share ? (data) => nav.share(data) : undefined,
    canShare: nav?.canShare ? (data) => nav.canShare(data) : undefined,
    coarse: () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
    fetchBlob: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`画像を取れませんでした（${res.status}）`);
      return res.blob();
    },
  };
}

export const SHARE_RESULT_TEXT: Record<ShareCardsResult, string | null> = {
  shared: null,
  cancelled: null,
  retry: "準備ができました。もう一度「写真に保存」を押してください",
  failed: "共有の画面を開けませんでした。「まとめてダウンロード（zip）」か、1 枚ずつの「保存」を使ってください",
};
