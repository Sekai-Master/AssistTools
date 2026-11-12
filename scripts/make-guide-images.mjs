/**
 * 知識ガイドの画像（public/guide/*.webp）を作る。
 *
 * ★ 入力は**伏せた版（screenshots-masked）だけ**。他のプレイヤーの名前・称号を伏せる前の
 *   元の撮影は、このスクリプトにもリポジトリにも通さない。
 * - 幅 1600px・品質 78 の WebP にする（元は 2360×1640）。寸法は src/pages/guide/lib/images.ts の台帳と
 *   images.test.ts が照合する
 * - 何を載せるかは台帳（images.ts）が決める。ここは渡したフォルダの PNG を全部変換するだけ
 *
 * 使い方: node scripts/make-guide-images.mjs <screenshots-masked のフォルダ>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("使い方: node scripts/make-guide-images.mjs <screenshots-masked のフォルダ>");
  process.exit(1);
}
if (!/masked/i.test(path.basename(path.resolve(src)))) {
  console.error("伏せた版（screenshots-masked）のフォルダだけを渡してください");
  process.exit(1);
}
const out = path.join(root, "public/guide");
fs.mkdirSync(out, { recursive: true });

for (const f of fs.readdirSync(src).filter((f) => f.endsWith(".png")).sort()) {
  const dest = path.join(out, f.replace(/\.png$/, ".webp"));
  const info = await sharp(path.join(src, f))
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(dest);
  console.log(`${path.basename(dest)} ${info.width}x${info.height} ${Math.round(info.size / 1024)}KB`);
}
