/**
 * 知識ガイドの画像（public/guide/）が、伏せた版から作ったものだけであることと、台帳と実物が合うこと。
 *
 * ★ public/guide/ に置いてよいのは、他のプレイヤーの名前・称号と運営者の表示名を伏せた版
 *  （screenshots-masked）から作った下の一覧だけ。元の撮影を紛れ込ませないよう、**名前の一覧を固定**して照合する。
 *   一覧を変えるのは、伏せた版を確かめ直して載せると決めたときだけ（ガイドの作業フォルダの figures/README.md）。
 */
/// <reference types="node" />
import crypto from "node:crypto";
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

/**
 * public/guide/ の画像・zip・manifest の中身（SHA-256）を固定する（検分 G1 の M4・M5）。
 * ★ ファイル名と寸法だけでは、同じ名前・同じ寸法のまま伏せる前の撮影に差し替えても通ってしまう。
 *   差し替えたら中身を確かめてから、テストが落ちたときに出る今の値でここを書き換える（docs/guide/README.md）。
 *   README.md（出どころの説明）は対象にしない。
 */
const ASSET_SHA256: Record<string, string> = {
  "02-room-select.webp": "dc55227c3abbd10926cf1f9ac380fedd962a3bd0ae6e4116766133762ff4c7d1",
  "05-private-room.webp": "9fc3de5c7be6049aa847118548b5be91be186d650a01b8a3f66859494eb2d92e",
  "09-room-matching.webp": "857f3710ab061bb7077a953b013f8b29dae1caa4db8aad8f9294e8d6ed6a56ce",
  "10-stamp-favorites-edit.webp": "df12cf946016f6bbc5eba9a297e26db6382a84fb161d77e8e6e0042e0644091d",
  "11-menu-stamp.webp": "4bf910bd4a1d9f4db1352e92ce15f1474e9e4ee91fb3b253a6e32c273ab4c6ea",
  "13-livebonus-consume-matching.webp": "788e714237ca42b8dcdb9250be7105bc7ecec6363b495f3dc1da4dc0592c8e2d",
  "14-livebonus-consume-countdown.webp": "a11393083e01e12857c448f0eb6fd064788147129c8e55208a5d2a5ffd1bf1f5",
  "16-deck.webp": "dc6efdfab38d3c16d76f64c95bfda4952a2138728225a7189f014be2c4a06818",
  "17-skill-judge-dependent.webp": "375bff1aa6f111f297042b1631c6e6dcc28f4c9af84a226f988424182102396f",
  "23-event-top.webp": "f453a1afc44edb706960a8e0c0a1e8d724296ad6147ede5de838560e8f371701",
  "24-event-top-refresh-tooltip.webp": "174b0b98b8f2aaf4d3ced63eece4eaaac6ed268a71b1c4b75764eca5e99a06ff",
  "26-refresh-gauge-info.webp": "a55f02898cc237691e7548f7747881eba904b5c8460abde4b26c3f26273b2089",
  "30-option-timing-20.webp": "183d959b83c4ad5ad78532a7eaf0045c76b3f6d42144ba67f00eb284caffbae5",
  "31-result-points.webp": "906ceebcc79aa113aeaf3fb94fd0cd1f2e0d2a123ac018959aa9d6f1204f58b3",
  "32-result-score.webp": "6a033c66bc1a543d7401afc0d1ed85badf3318ea5022fe30b0ccad2c9d26416a",
  "annotated/02-room-select.webp": "28a7475f6ee3691017799726cedcceaa898bc24c908e67dccf29d8b83b2e2d64",
  "annotated/09-room-matching.webp": "211d8c710749c8869d7152332cee5080c64c4dc76c77ad6ecca89c92f76b78ee",
  "annotated/13-livebonus-consume-matching.webp": "38ba4fbaabda6af2bde39617aa6ec60d90987ccce9f7b7ae5758f5c9ef463457",
  "annotated/24-event-top-refresh-tooltip.webp": "422b14963faa013f2f4820082978bd199654664237efc4417da7a68f7e08a2d4",
  "annotated/31-result-points.webp": "833e83ed8ded19fe1eef59742d8c5cf5f5b0d7d1ddd7323fe82b95542b78a997",
  "cards/card-1.png": "0467afa89cee7c352acc9900820c4cab34f5b2062ec6b99216a4b8483baf8199",
  "cards/card-2.png": "b2639aaf92f2b2212ef44e3ca93f84d03b240b14dcb3e53219e7d7cd41c817df",
  "cards/card-3.png": "411cc59eaad7adee4c1cbd604014a0d9a750295c289ad23a3fa2ac57b2481dc0",
  "cards/card-4.png": "bac8e4ff922aebf9dce7f702862f72e3b15096b04ead044a5720e427b7d41beb",
  "cards/card-5.png": "6d4ba9cdb26db6a3dceadc3ab07b65c238f3c82b9eadc60e79de90850574e885",
  "cards/card-6.png": "bcfcc340d00109e120a06d40bf416f12304380f4310478e55664f82c71c7a81a",
  "cards/preview/card-1.webp": "05957e14532a1cf3627eb1eb08f314006704745eadad76168ab4ab3f459de07d",
  "cards/preview/card-2.webp": "fc5c6759c9bec866a699c8c3d853ff1e93aeeaf3da4f4bbf8b3208fca95e837e",
  "cards/preview/card-3.webp": "36f41f8cdfe5593a18913c11362eae3bae2a248029c03d9247a7bc03381f2833",
  "cards/preview/card-4.webp": "2c8205a69dbaab058473da2a48d79c53d42685ead9ea10ab48a6601e466936ad",
  "cards/preview/card-5.webp": "ef8c845d8a5c41a0c0ec4d498b7c28de9360c23a802fa567fb6edd8998feb30e",
  "cards/preview/card-6.webp": "ba4d0c9122866206510fcf00f03391ca38d6881bf27cb1ac521919e5b89a8944",
  "cards/sekaimaster-guide-cards.zip": "b7273f07241f24fc18227324737311dae45732f683f594649963d5a0993d9fa6",
  "stamps/manifest.json": "ff27d2492c2825ea2e226d249ce1baab397b662b4e0e37fc2e8b475e55d40518",
  "stamps/stamp0001.webp": "b5c14d0b224e0537f082fcff0c84fe53666efef6f2b6ff59676a241aef748d73",
  "stamps/stamp0008.webp": "6cb41cda9a0b74d604cee964b53503ec4bfc8788ff7c74bbf721fa88f70de7d8",
  "stamps/stamp0011.webp": "4d0fa3660a7caa0ee5570a82913a80f8d1efa2357f4f56e2a80305b9ba4d1203",
  "stamps/stamp0014.webp": "04835309b953fd97bad3aa9f08162f895fabc6e17bd88bd11dd1ce0ff428e568",
  "stamps/stamp0071.webp": "b714cd63ae5d849dbe223419f5cbbdc05c180b903c110432a95c1919a823220e",
  "stamps/stamp0095.webp": "b2969cb81dee585c88f38fa436e7378dc7eab8ddbac4068a1b378cad8df3a975",
  "stamps/stamp0168.webp": "f86d9065e994aca4131a8ea14979ed9b700c0de50f25b83a34dc8503eafe3bde",
  "stamps/stamp0239.webp": "424ad768eeb783d5e9c53977fb187e8a57a511b536fb87f533613fa50f6ed6d5",
  "stamps/stamp0285.webp": "2f16e4aa258e9b20f91ccc4f44a91a7e51d1cf4e860804ed8e6aea140a23018a",
  "stamps/stamp0383.webp": "3891cc73fc82f7bdb992f54041ac9170d25e4037d3a902496ec628ffda1d2980",
  "stamps/stamp0421.webp": "4f9a00d86e711d7dff880b0a6ed9c2cfd6cf20ad06303f429aa47c5b34380d54",
  "stamps/stamp0424.webp": "e10d3204781a54601a0f9f143e19a5ea9c50f9b2ebf62a4add1840489a41eb80",
  "stamps/stamp0447.webp": "2566d3742759e3ad3e08a457f6b9ee624306bba7f67e4d467ed5b225481b5215",
  "stamps/stamp0530.webp": "6e2001fc930228afffd6ac90de6496bd5adab3de86a81a3e2d74ee1aebf13270",
  "stamps/stamp0531.webp": "9090ce50833331b2a47abb3a495fdf28c36a2e8d183ae94427dd07199239f0c5",
  "stamps/stamp0532.webp": "2dfb10a27f186c2dd9b59fa20b31a13a0d59e027ab4210b0fb022c14fcc78239",
  "stamps/stamp0623.webp": "250bb0d68343327bfb8bb9732a445ef2e0172494e15668c95e66bb7e4f508c52",
  "stamps/stamp0649.webp": "695eeadece66ea4126fa57ae1d68a0f61f67aa1a531c57557b23b1a81fc50e22",
  "stamps/stamp0650.webp": "45359a36d9721c4b83c8312c8bd63933717f2cd3db66cfff2536e7002cfbac74",
  "stamps/stamp0655.webp": "aaa9b0e67997b488af6a2b26ca5ec07ebcc8b80de764c1ec3c720c5e9da8dae7",
  "stamps/stamp0656.webp": "8a8cb5288da0edf5399d1785200369033e584366b225059cea06b8d8166638c3",
};

function walk(dir: string, base = dir): string[] {
  return fs.readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) return walk(p, base);
    return f.endsWith(".md") ? [] : [path.relative(base, p).split(path.sep).join("/")];
  });
}

describe("public/guide/ の中身の固定（SHA-256）", () => {
  it("画像・zip・manifest の中身が一覧と一致する（差し替えたら一覧を更新する）", () => {
    const actual = Object.fromEntries(
      walk(DIR)
        .sort()
        .map((f) => [f, crypto.createHash("sha256").update(fs.readFileSync(path.join(DIR, f))).digest("hex")]),
    );
    expect(actual).toEqual(ASSET_SHA256);
  });
});
