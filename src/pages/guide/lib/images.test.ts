/**
 * 知識ガイドの画像（public/guide/）が、伏せた版から作ったものだけであることと、台帳と実物が合うこと。
 *
 * ★ public/guide/ に置いてよいのは、他のプレイヤーの名前・称号と運営者の表示名を伏せた版
 *  （screenshots-masked）から作った下の一覧だけ。元の撮影を紛れ込ませないよう、**名前の一覧を固定**して照合する。
 *   一覧を変えるのは、伏せた版を確かめ直して載せると決めたときだけ（ガイドの作業フォルダの figures/README.md）。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GUIDE_IMAGES, guideImagesOf } from "./images";

const DIR = path.join(__dirname, "../../../../public/guide");
/** 1 枚あたりの上限。章によっては撮影が縦に並ぶので、重い画像を足したら止める。 */
const MAX_BYTES = 300 * 1024;

const MASKED_ONLY = [
  "02-room-select.webp",
  "05-private-room.webp",
  "09-room-matching.webp",
  "10-stamp-favorites-edit.webp",
  "11-menu-stamp.webp",
  "13-livebonus-consume-matching.webp",
  "14-livebonus-consume-countdown.webp",
  "16-deck.webp",
  "17-skill-judge-dependent.webp",
  "23-event-top.webp",
  "24-event-top-refresh-tooltip.webp",
  "26-refresh-gauge-info.webp",
  "30-option-timing-20.webp",
  "31-result-points.webp",
  "32-result-score.webp",
];

/** 番号の囲みを描き込んだ版（public/guide/annotated/）。元は伏せた版。 */
const ANNOTATED = [
  "02-room-select.webp",
  "09-room-matching.webp",
  "13-livebonus-consume-matching.webp",
  "24-event-top-refresh-tooltip.webp",
  "31-result-points.webp",
];

/** 直下のファイルだけ（annotated/・stamps/・cards/ のフォルダは別に見る）。 */
const filesIn = (dir: string) => fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());

const ledger = Object.values(GUIDE_IMAGES).flat();

describe("public/guide/ の中身", () => {
  it("伏せた版から作ったファイルだけがある（一覧を固定して照合）", () => {
    expect(filesIn(DIR).sort()).toEqual([...MASKED_ONLY].sort());
    expect(filesIn(path.join(DIR, "annotated")).sort()).toEqual([...ANNOTATED].sort());
  });

  it("フォルダは annotated・stamps・cards だけ", () => {
    const dirs = fs.readdirSync(DIR).filter((f) => fs.statSync(path.join(DIR, f)).isDirectory());
    expect(dirs.sort()).toEqual(["annotated", "cards", "stamps"]);
  });

  it("台帳のファイルと public/guide/ のファイルが過不足なく一致する", () => {
    expect(ledger.map((f) => f.file).sort()).toEqual(
      [...MASKED_ONLY, ...ANNOTATED.map((f) => `annotated/${f}`)].sort(),
    );
  });
});

describe("画像の台帳（images.ts）", () => {
  it.each(ledger.map((f) => [f.file, f] as const))("%s は台帳どおりの寸法・形式・重さ", async (_, f) => {
    const file = path.join(DIR, f.file);
    expect(fs.existsSync(file), `${f.file} が無い`).toBe(true);
    const meta = await sharp(file).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([f.width, f.height]);
    expect(fs.statSync(file).size).toBeLessThan(MAX_BYTES);
  });

  it("撮影の番号は 1〜12 と A1〜A5、複数あるときは note で見分けられる", () => {
    expect(Object.keys(GUIDE_IMAGES)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "A1", "A2", "A3", "A4", "A5"]);
    for (const files of Object.values(GUIDE_IMAGES)) {
      if (files.length > 1) {
        const notes = files.map((f) => f.note);
        expect(notes.every((s) => s.length > 0)).toBe(true);
        expect(new Set(notes).size).toBe(notes.length);
      }
    }
  });

  it("台帳に無い番号は undefined（Object のプロトタイプの名前も拾わない）", () => {
    expect(guideImagesOf(13)).toBeUndefined();
    expect(guideImagesOf("A9")).toBeUndefined();
    expect(guideImagesOf("A1")).toHaveLength(1);
    expect(guideImagesOf(3)).toBe(guideImagesOf("3"));
    expect(guideImagesOf("constructor" as unknown as number)).toBeUndefined();
  });
});
