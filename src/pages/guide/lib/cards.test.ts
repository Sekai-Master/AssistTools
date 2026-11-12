/**
 * まとめ画像の台帳と「まとめて保存」の分岐（navigator はモック）。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { buildCards, CARD_COUNT, CARD_HEIGHT, CARD_TEXTS, CARD_WIDTH, CARDS_ZIP } from "./cards";
import { canShareFiles, saveAllCards, type SaveAllEnv } from "./cardsShare";

const DIR = path.join(__dirname, "../../../../public/guide/cards");

describe("まとめ画像の台帳", () => {
  it("題は 6 枚とも指揮の指定どおり。1 枚目の alt は入口のページの手順の題から作る", () => {
    expect(CARD_TEXTS.map((t) => t.title)).toEqual([
      "はじめての周回の流れ",
      "募集の文の読み方",
      "スタンプの使い分け",
      "炊き数とイベントポイント",
      "アンコール",
      "リフレッシュゲージ",
    ]);
    const cards = buildCards(["1. 部屋を探す・作る", "2. 募集の文を読む"]);
    expect(cards).toHaveLength(CARD_COUNT);
    expect(cards[0].alt).toBe("はじめての周回の流れ。1 部屋を探す・作る、2 募集の文を読むの2つの手順。");
    expect(cards[1].alt.startsWith("募集の文の読み方。主は募集者の編成")).toBe(true);
    expect(cards.map((c) => c.file)).toEqual(["card-1.png", "card-2.png", "card-3.png", "card-4.png", "card-5.png", "card-6.png"]);
  });

  it("2〜6 枚目の alt は箇条をつないだ文で、確かさの印・記法が残らない", () => {
    for (const c of buildCards([]).slice(1)) {
      expect(c.alt.length, c.file).toBeGreaterThan(40);
      expect(c.alt, c.file).not.toMatch(/[〔〕*`#［]/);
    }
  });

  it("public/guide/cards/ に 6 枚（2400×2000 の PNG）と zip がある", async () => {
    for (const c of buildCards([])) {
      const meta = await sharp(path.join(DIR, c.file)).metadata();
      expect(meta.format, c.file).toBe("png");
      expect([meta.width, meta.height], c.file).toEqual([CARD_WIDTH, CARD_HEIGHT]);
    }
    expect(fs.existsSync(path.join(DIR, CARDS_ZIP))).toBe(true);
  });
});

const input = {
  cards: [1, 2, 3, 4, 5, 6].map((n) => ({ url: `/guide/cards/card-${n}.png`, fileName: `card-${n}.png` })),
  zip: { url: "/guide/cards/z.zip", fileName: "z.zip" },
};

function env(over: Partial<SaveAllEnv> = {}): SaveAllEnv & { downloadUrl: ReturnType<typeof vi.fn> } {
  return {
    fetchBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    downloadUrl: vi.fn(),
    ...over,
  } as SaveAllEnv & { downloadUrl: ReturnType<typeof vi.fn> };
}

describe("まとめて保存", () => {
  it("canShare が真なら、6 枚を File にして共有シートを開く（zip は落とさない）", async () => {
    const share = vi.fn(async () => {});
    const e = env({ share, canShare: () => true });
    const got: File[][] = [];
    expect(await saveAllCards(input, e, (f) => got.push(f))).toBe("shared");
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.files).toHaveLength(6);
    expect(data.files![0].name).toBe("card-1.png");
    expect(data.files![0].type).toBe("image/png");
    expect(e.downloadUrl).not.toHaveBeenCalled();
    expect(got[0]).toHaveLength(6);
  });

  it("canShare が偽（PC）なら zip をダウンロード。画像は取りに行かない", async () => {
    const share = vi.fn(async () => {});
    const e = env({ share, canShare: () => false });
    expect(await saveAllCards(input, e)).toBe("zip");
    expect(e.downloadUrl).toHaveBeenCalledWith("/guide/cards/z.zip", "z.zip");
    expect(share).not.toHaveBeenCalled();
    expect(e.fetchBlob).not.toHaveBeenCalled();
  });

  it("navigator.share が無ければ zip", async () => {
    const e = env();
    expect(canShareFiles(e)).toBe(false);
    expect(await saveAllCards(input, e)).toBe("zip");
  });

  it("共有シートを閉じただけ（AbortError）なら、zip に切り替えない", async () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    const e = env({ share: vi.fn(async () => Promise.reject(abort)), canShare: () => true });
    expect(await saveAllCards(input, e)).toBe("cancelled");
    expect(e.downloadUrl).not.toHaveBeenCalled();
  });

  it("押してから時間が空いて拒まれた（NotAllowedError）ら、もう一度押してもらう。2 回目は取りに行かない", async () => {
    const denied = Object.assign(new Error("x"), { name: "NotAllowedError" });
    const share = vi.fn().mockRejectedValueOnce(denied).mockResolvedValueOnce(undefined);
    const e = env({ share, canShare: () => true });
    let cached: File[] | undefined;
    expect(await saveAllCards(input, e, (f) => (cached = f))).toBe("retry");
    expect(e.fetchBlob).toHaveBeenCalledTimes(6);
    expect(await saveAllCards({ ...input, cached }, e)).toBe("shared");
    expect(e.fetchBlob).toHaveBeenCalledTimes(6);
  });

  it("canShare が投げる端末・画像を取れないときは zip", async () => {
    const throws = env({ share: vi.fn(), canShare: () => { throw new Error("x"); } });
    expect(await saveAllCards(input, throws)).toBe("zip");
    const noFetch = env({ share: vi.fn(), canShare: () => true, fetchBlob: async () => Promise.reject(new Error("404")) });
    expect(await saveAllCards(input, noFetch)).toBe("zip");
  });
});

describe("まとめて保存（取ってあったのに拒まれる端末）と zip の中身", () => {
  it("先読みした画像でも NotAllowedError なら、もう一度を求めず zip へ", async () => {
    const denied = Object.assign(new Error("x"), { name: "NotAllowedError" });
    const e = env({ share: vi.fn(async () => Promise.reject(denied)), canShare: () => true });
    const cached = [new File(["x"], "card-1.png", { type: "image/png" })];
    expect(await saveAllCards({ ...input, cached }, e)).toBe("zip");
    expect(e.downloadUrl).toHaveBeenCalledTimes(1);
  });

  it("zip に card-1.png〜card-6.png が入っている（画像だけ差し替えて zip が古いまま、を拾う手がかり）", () => {
    const zip = fs.readFileSync(path.join(DIR, CARDS_ZIP)).toString("latin1");
    for (let n = 1; n <= CARD_COUNT; n++) expect(zip, `card-${n}.png`).toContain(`card-${n}.png`);
  });
});
