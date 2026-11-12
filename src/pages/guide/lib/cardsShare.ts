/**
 * まとめ画像を「まとめて保存」する。
 *
 * - 画像を共有できる端末（iPhone・Android）: 6 枚を File にして navigator.share({ files }) で共有シートを開く。
 *   シートの「画像を保存」で写真に入る
 * - それ以外（PC など）: まとめた zip（public/guide/cards/sekaimaster-guide-cards.zip）をダウンロードする
 * - 作法はビンゴの共有（src/pages/bingo/bingoShare.ts）と同じ: canShare は投げる端末があるので try の中で聞く。
 *   共有シートを閉じただけ（AbortError）なら、ほかの方法に切り替えない
 * ★ Safari は、押してから時間が空く（画像を取りに行く）と共有を拒む（NotAllowedError）。取った画像は
 *   覚えておき、拒まれたら「もう一度押す」を案内する。2 回目は取りに行かずにすぐ共有の画面を開ける
 */
export type SaveAllResult = "shared" | "cancelled" | "zip" | "retry";

export interface SaveAllEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  /** 画像を取ってくる（fetch）。 */
  fetchBlob: (url: string) => Promise<Blob>;
  /** zip などのファイルを保存させる（a[download] を押す）。 */
  downloadUrl: (url: string, fileName: string) => void;
}

export interface SaveAllInput {
  cards: { url: string; fileName: string }[];
  zip: { url: string; fileName: string };
  /** 前に取った File（2 回目の押下用）。 */
  cached?: File[];
}

/** 共有の画面を出せる端末か（ファイルを渡す前の見込み。最後は File を渡した canShare で決める）。 */
export function canShareFiles(env: Pick<SaveAllEnv, "share" | "canShare">): boolean {
  if (!env.share || !env.canShare || typeof File === "undefined") return false;
  try {
    return env.canShare({ files: [new File([""], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export async function saveAllCards(
  input: SaveAllInput,
  env: SaveAllEnv,
  onFiles?: (files: File[]) => void,
): Promise<SaveAllResult> {
  if (canShareFiles(env)) {
    try {
      const files =
        input.cached ??
        (await Promise.all(
          input.cards.map(async (c) => new File([await env.fetchBlob(c.url)], c.fileName, { type: "image/png" })),
        ));
      onFiles?.(files);
      const data: ShareData = { files };
      if (env.canShare!(data)) {
        await env.share!(data);
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      if (e instanceof Error && e.name === "NotAllowedError") return "retry";
      // 画像を取れない・共有に失敗した: zip へ回す
    }
  }
  env.downloadUrl(input.zip.url, input.zip.fileName);
  return "zip";
}

export function browserSaveAllEnv(): SaveAllEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    share: nav?.share ? (data) => nav.share(data) : undefined,
    canShare: nav?.canShare ? (data) => nav.canShare(data) : undefined,
    fetchBlob: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`画像を取れませんでした（${res.status}）`);
      return res.blob();
    },
    downloadUrl: (url, fileName) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
    },
  };
}

export const SAVE_ALL_TEXT: Record<SaveAllResult, string | null> = {
  shared: null,
  cancelled: null,
  zip: "6 枚をまとめた zip を保存しました",
  retry: "準備ができました。もう一度「まとめて保存」を押してください",
};
