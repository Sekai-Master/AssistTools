/**
 * まとめ画像の台帳・zip の中身と、「写真に保存（共有）」の分岐（navigator・matchMedia はモック）。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { buildCards, CARD_COUNT, CARD_HEIGHT, CARD_TEXTS, CARD_WIDTH, CARDS_ZIP, PREVIEW_HEIGHT, PREVIEW_WIDTH } from "./cards";
import { canShareToPhotos, shareCards, type ShareEnv } from "./cardsShare";

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

  it("原寸は 2400×2000 の PNG、一覧に見せる縮小版は 1200×1000 の WebP で 120KB 未満", async () => {
    for (const c of buildCards([])) {
      const png = await sharp(path.join(DIR, c.file)).metadata();
      expect(png.format, c.file).toBe("png");
      expect([png.width, png.height], c.file).toEqual([CARD_WIDTH, CARD_HEIGHT]);
      const preview = path.join(DIR, c.preview);
      const meta = await sharp(preview).metadata();
      expect(meta.format, c.preview).toBe("webp");
      expect([meta.width, meta.height], c.preview).toEqual([PREVIEW_WIDTH, PREVIEW_HEIGHT]);
      expect(fs.statSync(preview).size, c.preview).toBeLessThan(120 * 1024);
    }
  });
});

/** zip の中央ディレクトリから、ファイル名 → CRC32 を読む。 */
function zipCrcs(buf: Buffer): Map<string, number> {
  const out = new Map<string, number>();
  const SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02]); // 中央ディレクトリの見出し
  for (let at = buf.indexOf(SIG); at >= 0; ) {
    const crc = buf.readUInt32LE(at + 16);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    out.set(buf.subarray(at + 46, at + 46 + nameLen).toString("utf8"), crc);
    at = buf.indexOf(SIG, at + 46 + nameLen + extraLen + commentLen);
  }
  return out;
}

describe("zip の中身", () => {
  /** ★ 名前だけでなく中身を見る。画像だけ差し替えて zip を作り直し忘れると落ちる（検分 G1 の M4）。 */
  it("zip に入っている card-1〜6.png は、public/guide/cards/ の PNG と同じ中身（CRC32 が一致）", () => {
    const crcs = zipCrcs(fs.readFileSync(path.join(DIR, CARDS_ZIP)));
    expect([...crcs.keys()].sort()).toEqual(buildCards([]).map((c) => c.file).sort());
    for (const c of buildCards([])) {
      expect(crcs.get(c.file), c.file).toBe(zlib.crc32(fs.readFileSync(path.join(DIR, c.file))));
    }
  });
});

const input = {
  cards: [1, 2, 3, 4, 5, 6].map((n) => ({ url: `/guide/cards/card-${n}.png`, fileName: `card-${n}.png` })),
};

function env(over: Partial<ShareEnv> = {}): ShareEnv & { fetchBlob: ReturnType<typeof vi.fn> } {
  return {
    coarse: () => true,
    fetchBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    ...over,
  } as ShareEnv & { fetchBlob: ReturnType<typeof vi.fn> };
}

describe("「写真に保存（共有）」を出すか", () => {
  it("指で操作する端末で canShare({ files }) が真のときだけ", () => {
    expect(canShareToPhotos(env({ share: vi.fn(), canShare: () => true }))).toBe(true);
    // パソコンの Chrome・Edge は canShare が真でも出さない（OS の共有の画面に「保存」が無い）
    expect(canShareToPhotos(env({ share: vi.fn(), canShare: () => true, coarse: () => false }))).toBe(false);
    expect(canShareToPhotos(env({ share: vi.fn(), canShare: () => false }))).toBe(false);
    expect(canShareToPhotos(env())).toBe(false);
    expect(canShareToPhotos(env({ share: vi.fn(), canShare: () => { throw new Error("x"); } }))).toBe(false);
  });
});

describe("写真に保存（共有）", () => {
  it("6 枚を File にして共有の画面を開く", async () => {
    const share = vi.fn(async () => {});
    const got: File[][] = [];
    expect(await shareCards(input, env({ share, canShare: () => true }), (f) => got.push(f))).toBe("shared");
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.files).toHaveLength(6);
    expect(data.files![0].name).toBe("card-1.png");
    expect(data.files![0].type).toBe("image/png");
    expect(got[0]).toHaveLength(6);
  });

  it("共有の画面を閉じただけ（AbortError）なら何も出さない", async () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    expect(await shareCards(input, env({ share: vi.fn(async () => Promise.reject(abort)), canShare: () => true }))).toBe(
      "cancelled",
    );
  });

  it("押してから時間が空いて拒まれた（NotAllowedError）ら、もう一度押してもらう。2 回目は取りに行かない", async () => {
    const denied = Object.assign(new Error("x"), { name: "NotAllowedError" });
    const share = vi.fn().mockRejectedValueOnce(denied).mockResolvedValueOnce(undefined);
    const e = env({ share, canShare: () => true });
    let cached: File[] | undefined;
    expect(await shareCards(input, e, (f) => (cached = f))).toBe("retry");
    expect(e.fetchBlob).toHaveBeenCalledTimes(6);
    expect(await shareCards({ ...input, cached }, e)).toBe("shared");
    expect(e.fetchBlob).toHaveBeenCalledTimes(6);
  });

  it("先読みした画像でも拒まれる・画像を取れない・パソコンでは failed（zip を案内する）", async () => {
    const denied = Object.assign(new Error("x"), { name: "NotAllowedError" });
    const cached = [new File(["x"], "card-1.png", { type: "image/png" })];
    expect(await shareCards({ ...input, cached }, env({ share: vi.fn(async () => Promise.reject(denied)), canShare: () => true }))).toBe(
      "failed",
    );
    expect(
      await shareCards(input, env({ share: vi.fn(), canShare: () => true, fetchBlob: vi.fn(async () => Promise.reject(new Error("404"))) })),
    ).toBe("failed");
    const pc = vi.fn();
    expect(await shareCards(input, env({ share: pc, canShare: () => true, coarse: () => false }))).toBe("failed");
    expect(pc).not.toHaveBeenCalled();
  });
});
