/**
 * 知識ガイドの画像（public/guide/ の WebP）を作る。
 *
 * ★ 入力は**伏せた版（screenshots-masked）と、それから作ったものだけ**。他のプレイヤーの名前・称号を
 *   伏せる前の元の撮影は、このスクリプトにもリポジトリにも通さない。
 * - 撮影（screenshots-masked）: 幅 1600px・品質 78 の WebP にして public/guide/ に出す（元は 2360×1640）
 * - 番号の囲みを描き込んだ版（annotated。元は伏せた版）: 同じく public/guide/annotated/ に出す
 * - まとめ画像（cards。card-N.png）: 一覧に見せる縮小版（幅 1200px の WebP）を public/guide/cards/preview/ に出す。
 *   PNG と zip は手で public/guide/cards/ に置く（保存・共有はそちらを使う）
 * - 寸法は src/pages/guide/lib/images.ts・cards.ts の台帳とテストが照合する。作り直したら images.test.ts の
 *   SHA-256 の一覧も更新する（docs/guide/README.md）
 *
 * 使い方: node scripts/make-guide-images.mjs <screenshots-masked・annotated・cards のどれかのフォルダ>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("使い方: node scripts/make-guide-images.mjs <screenshots-masked・annotated・cards のフォルダ>");
  process.exit(1);
}
const base = path.basename(path.resolve(src));
const kind = /masked/i.test(base) ? "shots" : /annotated/i.test(base) ? "annotated" : /^cards$/i.test(base) ? "cards" : null;
if (!kind) {
  console.error("伏せた版（screenshots-masked）・囲みを描いた版（annotated）・まとめ画像（cards）のフォルダだけを渡してください");
  process.exit(1);
}
const out = path.join(
  root,
  { shots: "public/guide", annotated: "public/guide/annotated", cards: "public/guide/cards/preview" }[kind],
);
const width = kind === "cards" ? 1200 : 1600;
fs.mkdirSync(out, { recursive: true });

const files = fs
  .readdirSync(src)
  .filter((f) => f.endsWith(".png") && (kind !== "cards" || /^card-\d+\.png$/.test(f)))
  .sort();
for (const f of files) {
  const dest = path.join(out, f.replace(/\.png$/, ".webp"));
  const info = await sharp(path.join(src, f)).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(dest);
  console.log(`${path.basename(dest)} ${info.width}x${info.height} ${Math.round(info.size / 1024)}KB`);
}
