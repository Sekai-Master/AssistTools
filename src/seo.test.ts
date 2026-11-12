import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOT_FOUND,
  PAGES,
  docTitle,
  guideChapterMeta,
  htmlFileOf,
  knowledgeMeta,
  renderHead,
  renderRobots,
  renderSitemap,
} from "./seo";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** index.html の <head> の形を写した最小の殻 */
const SHELL = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sekai-Master</title>
    <meta name="description" content="プロセカをより楽しむためのツール集。" />
    <meta property="og:title" content="Sekai-Master" />
    <meta property="og:description" content="プロセカをより楽しむためのツール集" />
    <meta property="og:image" content="/images/icon.png" />
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("ページの一覧（PAGES）", () => {
  it("App.tsx のルートと過不足なく一致する（ルートを足したら seo.ts にも足す）", () => {
    const routes = [...read("src/App.tsx").matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((p) => p !== "*" && !p.includes(":"));
    expect(Object.keys(PAGES).sort()).toEqual([...new Set(routes)].sort());
  });

  it("Nori 指定の検索語が、そのページの説明に入っている", () => {
    const text = (p: string) => `${PAGES[p].title} ${PAGES[p].description}`;
    expect(text("/border")).toContain("ボーダー予測");
    expect(text("/border/history")).toContain("ボーダー");
    expect(text("/analyzer")).toContain("ポ調");
    expect(text("/analyzer")).toContain("ポイント調整");
    expect(text("/analyzer")).toContain("基礎点");
    expect(text("/deck")).toContain("編成");
    expect(text("/tweet")).toContain("ついぼ");
  });

  it("説明文は検索結果で切られにくい長さ（120字以内）", () => {
    const long = Object.entries(PAGES).filter(([, m]) => m.description.length > 120);
    expect(long.map(([p, m]) => `${p}: ${m.description.length}字`)).toEqual([]);
  });

  it("検索に出さないのは設定と404だけ", () => {
    expect(Object.entries(PAGES).filter(([, m]) => m.noindex).map(([p]) => p)).toEqual(["/settings"]);
    expect(NOT_FOUND.noindex).toBe(true);
  });
});

describe("<head> の差し替え（renderHead）", () => {
  it("タイトル・説明文・canonical・OG を、そのページのものにする", () => {
    const html = renderHead(SHELL, "/border", PAGES["/border"]);
    expect(html).toContain("<title>ボーダー予測｜プロセカのイベントの最終ボーダー｜Sekai-Master</title>");
    expect(html).toContain(`<meta name="description" content="${PAGES["/border"].description}" />`);
    expect(html).toContain(`<link rel="canonical" href="https://sekaimaster.pages.dev/border" />`);
    expect(html).toContain(`<meta property="og:url" content="https://sekaimaster.pages.dev/border" />`);
    // X のカードは相対パスの画像を読まない
    expect(html).toContain(`<meta property="og:image" content="https://sekaimaster.pages.dev/images/icon.png" />`);
    // 元のものは残さない（二重にしない）
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
    expect(html.match(/og:title/g)).toHaveLength(1);
    expect(html).not.toContain("より楽しむ");
    // 本体（アプリ）はそのまま
    expect(html).toContain(`<div id="root"></div>`);
  });

  it("トップはサイト名を先に出し、canonical は / で終わる", () => {
    const html = renderHead(SHELL, "/", PAGES["/"]);
    expect(html).toContain("<title>Sekai-Master（セカイマスター）｜プロセカのイベラン支援ツール集</title>");
    expect(html).toContain(`<link rel="canonical" href="https://sekaimaster.pages.dev/" />`);
    // サイト名の構造化データはトップだけ。読める JSON で、別名に SekaiMaster・セカイマスター
    const ld = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html);
    expect(ld).not.toBeNull();
    expect(JSON.parse(ld![1])).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Sekai-Master",
      alternateName: ["SekaiMaster", "セカイマスター"],
      url: "https://sekaimaster.pages.dev/",
    });
    expect(renderHead(html, "/", PAGES["/"])).toBe(html);
    expect(renderHead(SHELL, "/border", PAGES["/border"])).not.toContain("ld+json");
  });

  it("2回かけても同じ（canonical などが重ならない）", () => {
    const once = renderHead(SHELL, "/deck", PAGES["/deck"]);
    expect(renderHead(once, "/deck", PAGES["/deck"])).toBe(once);
  });

  it("検索に出さないページは noindex を付け、canonical を付けない", () => {
    const html = renderHead(SHELL, "/404", NOT_FOUND);
    expect(html).toContain(`<meta name="robots" content="noindex" />`);
    expect(html).not.toContain("canonical");
  });

  it("説明文の記号はエスケープする。「$&」も置換の記号として化けない", () => {
    const html = renderHead(SHELL, "/x", { title: `a"b<c>`, description: `d&"e $& $1` });
    expect(html).toContain("<title>a&quot;b&lt;c&gt;｜Sekai-Master</title>");
    expect(html).toContain(`content="d&amp;&quot;e $&amp; $1"`);
  });

  it("<head> の形が変わって読めなければ止める（黙って素通しにしない）", () => {
    expect(() => renderHead("<html><body></body></html>", "/", PAGES["/"])).toThrow();
  });

  it("本物の index.html でも差し替えられる", () => {
    const html = renderHead(read("index.html"), "/analyzer", PAGES["/analyzer"]);
    expect(html).toContain("<title>ポイント調整アナライザー（ポ調）｜プロセカ｜Sekai-Master</title>");
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/og:description/g)).toHaveLength(1);
  });
});

describe("知見ノート（knowledgeMeta）", () => {
  it("タイトル・最終更新・本文の最初の段落を取る（表・見出し・記法は飛ばす）", () => {
    const src = [
      "# 1周のうち、曲以外にかかる秒数",
      "",
      "- **状態**: 有力",
      "- **最終更新**: 2026-08-21",
      "",
      "## 結論",
      "",
      "| a | b |",
      "|---|---|",
      "",
      "1周の所要時間は **曲の長さ ＋ オーバーヘッド**。[計測](https://example.com)で確かめた。",
      "次の行も同じ段落。",
      "",
      "別の段落。",
    ].join("\r\n");
    expect(knowledgeMeta("overhead", src)).toEqual({
      slug: "overhead",
      title: "1周のうち、曲以外にかかる秒数",
      updated: "2026-08-21",
      description: "1周の所要時間は 曲の長さ ＋ オーバーヘッド。計測で確かめた。 次の行も同じ段落。",
    });
  });

  it("太字で始まる段落は箇条書きと取り違えない", () => {
    const src = "# t\n\n- **最終更新**: 2026-08-21\n\n## 結論\n\n**1枠だけが得ている上乗せがある。** 不具合ではない。\n\n- 箇条書き\n";
    expect(knowledgeMeta("s", src).description).toBe("1枠だけが得ている上乗せがある。 不具合ではない。");
  });

  it("実際のノートすべてで、空でない説明と日付が取れる", () => {
    const dir = path.join(ROOT, "docs/knowledge");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const m = knowledgeMeta(f.replace(/\.md$/, ""), fs.readFileSync(path.join(dir, f), "utf8"));
      expect(m.description, f).not.toBe(m.title);
      expect(m.description.length, f).toBeLessThanOrEqual(120);
      expect(m.updated, f).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("sitemap・robots・ファイル名", () => {
  it("sitemap は noindex を除いた全ページと知見ノートを載せる", () => {
    const xml = renderSitemap(PAGES, [{ slug: "overhead", title: "t", description: "d", updated: "2026-08-21" }]);
    expect(xml).toContain("<loc>https://sekaimaster.pages.dev/</loc>");
    expect(xml).toContain("<loc>https://sekaimaster.pages.dev/border/history</loc>");
    expect(xml).toContain("<url><loc>https://sekaimaster.pages.dev/knowledge/overhead</loc><lastmod>2026-08-21</lastmod></url>");
    expect(xml).not.toContain("/settings");
    expect(xml.match(/<url>/g)).toHaveLength(Object.keys(PAGES).length - 1 + 1);
  });

  it("robots は sitemap を指し、API だけ巡回させない", () => {
    expect(renderRobots()).toBe("User-agent: *\nDisallow: /api/\n\nSitemap: https://sekaimaster.pages.dev/sitemap.xml\n");
  });

  it("dist のファイル名は「パス.html」（Cloudflare Pages はパスと同じ名前の HTML を返す）", () => {
    expect(htmlFileOf("/")).toBe("index.html");
    expect(htmlFileOf("/deck")).toBe("deck.html");
    expect(htmlFileOf("/border/history")).toBe("border/history.html");
  });

  it("タブの名前: トップはサイト名が先、ほかは後ろ", () => {
    expect(docTitle("/", PAGES["/"])).toBe("Sekai-Master（セカイマスター）｜プロセカのイベラン支援ツール集");
    expect(docTitle("/lap", PAGES["/lap"])).toBe("周回ラップ計測｜プロセカの1周の秒数と周/時｜Sekai-Master");
  });
});

describe("public/_redirects", () => {
  // ★ Cloudflare Pages の _redirects は静的ファイルより先に効く。SPA のフォールバックを戻すと、
  //   書き出したページごとの HTML が全部 index.html に化ける（_redirects のコメント参照）
  it("有効な規則を持たない（SPA のフォールバックを戻さない）", () => {
    const rules = read("public/_redirects")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"));
    expect(rules).toEqual([]);
  });
});

describe("Google Search Console の所有権の確認", () => {
  it("index.html にあり、ページごとの head を作っても消えない（消すと確認が外れる）", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    const tag = /<meta name="google-site-verification" content="[^"]+" \/>/;
    expect(html).toMatch(tag);
    expect(renderHead(html, "/deck", PAGES["/deck"])).toMatch(tag);
    expect(renderHead(html, "/nope", NOT_FOUND)).toMatch(tag);
  });
});

describe("知識ガイドの章（guideChapterMeta）", () => {
  it("題は「第N章 名前」、説明は最初の段落から差し込みの行と確かさの印を外したもの", () => {
    const src = [
      "## 3. 協力ライブの仕組み",
      "",
      "### 3.1 ルームとマッチング",
      "",
      "［画像1: ルームを選ぶ画面］",
      "",
      "ルームは3種類あります〔公式〕。**総合力**の線で分かれます〔ゲームのデータ〕。",
      "",
      "別の段落。",
    ].join("\r\n");
    expect(guideChapterMeta(3, src)).toEqual({
      path: "/guide/3",
      title: "第3章 協力ライブの仕組み｜プロセカの知識ガイド",
      description: "ルームは3種類あります。総合力の線で分かれます。",
    });
  });

  it("実際の章すべてで、空でない説明が取れ、印・差し込みが残らない", () => {
    const dir = path.join(ROOT, "docs/guide");
    const files = fs.readdirSync(dir).filter((f) => /^ch\d+\.md$/.test(f));
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {
      const n = Number(/\d+/.exec(f)![0]);
      const m = guideChapterMeta(n, fs.readFileSync(path.join(dir, f), "utf8"));
      expect(m.title.startsWith(`第${n}章 `), f).toBe(true);
      expect(m.title, f).not.toContain(`第${n}章 ｜`);
      expect(m.description.length, f).toBeGreaterThan(10);
      expect(m.description.length, f).toBeLessThanOrEqual(120);
      expect(m.description, f).not.toMatch(/[〔［]/);
    }
  });

  it("sitemap に章のページを足せる（第 0 章は /guide に載るので渡さない）", () => {
    const xml = renderSitemap(PAGES, [], ["/guide/1", "/guide/9"]);
    expect(xml).toContain("<url><loc>https://sekaimaster.pages.dev/guide</loc></url>");
    expect(xml).toContain("<url><loc>https://sekaimaster.pages.dev/guide/1</loc></url>");
    expect(xml).toContain("<url><loc>https://sekaimaster.pages.dev/guide/9</loc></url>");
    expect(xml).not.toContain("/guide/0");
  });
});
