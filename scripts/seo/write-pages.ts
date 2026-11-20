/**
 * ビルドのあと（vite build の後）に、ページごとの HTML・404.html・sitemap.xml・robots.txt を dist に書く。
 * 定義と組み立ては src/seo.ts。ここはファイルの読み書きだけ。
 *
 * - どのページの HTML も中身は dist/index.html と同じ（<head> だけ違う）。アプリはどれを開いても同じに動く
 * - 404.html があると Cloudflare Pages は SPA の扱い（知らないパスにトップを返す）をやめ、知らないパスに 404 を返す。
 *   404.html も同じアプリなので、書き出し漏れのページを開いても画面は出る（状態が 404 になるだけ）
 *
 * 使い方: node scripts/seo/write-pages.ts [dist のパス]（npm run build の最後に走る）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NOT_FOUND,
  PAGES,
  guideChapterMeta,
  htmlFileOf,
  knowledgeMeta,
  renderHead,
  renderRobots,
  renderSitemap,
} from "../../src/seo.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.resolve(process.argv[2] ?? path.join(root, "dist"));
const shell = fs.readFileSync(path.join(dist, "index.html"), "utf8");

function write(rel: string, text: string): void {
  const file = path.join(dist, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

for (const [p, meta] of Object.entries(PAGES)) write(htmlFileOf(p), renderHead(shell, p, meta));

const noteDir = path.join(root, "docs/knowledge");
const notes = fs
  .readdirSync(noteDir)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => knowledgeMeta(f.replace(/\.md$/, ""), fs.readFileSync(path.join(noteDir, f), "utf8")));
for (const n of notes) {
  const p = `/knowledge/${n.slug}`;
  write(htmlFileOf(p), renderHead(shell, p, { title: n.title, description: n.description }));
}

// 知識ガイドの章（第 0 章は /guide の一覧に載せるので、章のページは 1 章から）
const guideDir = path.join(root, "docs/guide");
const chapters = fs
  .readdirSync(guideDir)
  .flatMap((f) => {
    const m = /^ch(\d+)\.md$/.exec(f);
    return m && Number(m[1]) > 0 ? [guideChapterMeta(Number(m[1]), fs.readFileSync(path.join(guideDir, f), "utf8"))] : [];
  })
  .sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));
for (const c of chapters) write(htmlFileOf(c.path), renderHead(shell, c.path, c));

write("404.html", renderHead(shell, "/404", NOT_FOUND));
write("sitemap.xml", renderSitemap(PAGES, notes, chapters.map((c) => c.path)));
write("robots.txt", renderRobots());

console.log(`seo: ${Object.keys(PAGES).length} ページ・知見ノート ${notes.length} 本・ガイド ${chapters.length} 章・404・sitemap・robots を書いた`);
