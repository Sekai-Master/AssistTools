/**
 * 告知画像の台帳（changelogImages.ts）が実物と食い違っていないこと。
 *
 * 台帳の width・height が実物とずれると、読み込み中に取っておく枠の高さが違い、
 * 読み終わった瞬間に下の本文が動く。版の書き間違いは画像が黙って出なくなる。どちらも見た目では気づきにくい。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import changelogMarkdown from "../../../CHANGELOG.md?raw";
import { parseChangelog } from "./changelogParser";
import { CHANGELOG_IMAGE_VERSIONS, changelogImageOf } from "./changelogImages";

const PUBLIC_DIR = path.join(__dirname, "../../../public");
/** 1 枚あたりの上限。更新履歴は画像が縦に並ぶので、重い画像を足したら止める。 */
const MAX_BYTES = 300 * 1024;

describe("告知画像の台帳", () => {
  const versions = new Set(parseChangelog(changelogMarkdown).map((r) => r.version));

  it.each(CHANGELOG_IMAGE_VERSIONS)("v%s は CHANGELOG.md にある版", (version) => {
    expect(versions.has(version)).toBe(true);
  });

  it.each(CHANGELOG_IMAGE_VERSIONS)("v%s の画像は台帳どおりの寸法・形式・重さ", async (version) => {
    const image = changelogImageOf(version)!;
    const file = path.join(PUBLIC_DIR, image.src);
    expect(fs.existsSync(file), `${image.src} が無い`).toBe(true);
    const meta = await sharp(file).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([image.width, image.height]);
    expect(fs.statSync(file).size).toBeLessThan(MAX_BYTES);
  });

  // 別の版の代替テキストを貼り間違えると、読み上げで違う版の内容が流れる。
  it.each(CHANGELOG_IMAGE_VERSIONS)("v%s の代替テキストはその版のもの", (version) => {
    expect(changelogImageOf(version)!.alt.startsWith(`Sekai-Master v${version} の更新。`)).toBe(true);
  });

  it("台帳に無い版は undefined（Object のプロトタイプの名前も拾わない）", () => {
    expect(changelogImageOf("0.0.1")).toBeUndefined();
    expect(changelogImageOf("constructor")).toBeUndefined();
  });
});
