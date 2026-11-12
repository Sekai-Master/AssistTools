/**
 * まとめ画像の台帳と「まとめて保存」の分岐（navigator はモック）。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { buildCards, CARD_COUNT, CARD_HEIGHT, CARD_WIDTH, CARDS_ZIP, parseCardTexts } from "./cards";
import { canShareFiles, saveAllCards, type SaveAllEnv } from "./cardsShare";

const DIR = path.join(__dirname, "../../../../public/guide/cards");

describe("まとめ画像の台帳", () => {
  it("cards.md の枚ごとの題と本文から alt を作る（記法・印は外す）", () => {
    const md = "# まとめ画像\n\n## 部屋を探す\n\n**プライベートルーム**を使います〔走っている人の実感〕。\n- ①フリー〔実感〕\n\n## 炊き数\n\n- 5 炊きまで横ばい";
    expect(parseCardTexts(md).get(1)).toEqual({ title: "部屋を探す", body: "プライベートルームを使います。①フリー。" });
    const cards = buildCards(md);
    expect(cards).toHaveLength(CARD_COUNT);
    expect(cards[0].alt).toBe("部屋を探す。プライベートルームを使います。①フリー。");
    expect(cards[1].alt).toBe("炊き数。5 炊きまで横ばい。");
    // 番号つきの見出しなら、その番号の枚
    expect([...parseCardTexts("## 3. アンコール\n- 本文").keys()]).toEqual([3]);
    expect(cards[5].alt).toBe("まとめ画像 6");
    expect(cards.map((c) => c.file)).toEqual(["card-1.png", "card-2.png", "card-3.png", "card-4.png", "card-5.png", "card-6.png"]);
  });

  it("public/guide/cards/ に 6 枚（2400×2000 の PNG）と zip がある", async () => {
    for (const c of buildCards(undefined)) {
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

describe("実際の cards.md", () => {
  it("6 枚ぶんの題と本文があり、alt に印・記法が残らない", () => {
    const md = fs.readFileSync(path.join(__dirname, "../../../../docs/guide/cards.md"), "utf8");
    const cards = buildCards(md);
    expect(parseCardTexts(md).size).toBe(CARD_COUNT);
    for (const c of cards) {
      expect(c.alt.length, c.file).toBeGreaterThan(20);
      expect(c.alt, c.file).not.toMatch(/[〔〕*`#［]/);
    }
  });
});
