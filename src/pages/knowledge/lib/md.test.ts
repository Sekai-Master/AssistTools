import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseInline, parseMarkdown, plainText } from "./md";
import { parseEntry, sortEntries, STATUSES } from "./entry";

const DIR = "docs/knowledge";
const docs = readdirSync(DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => ({
    slug: f.replace(/\.md$/, ""),
    src: readFileSync(`${DIR}/${f}`, "utf8"),
  }));

describe("行内の記法", () => {
  it("太字・コード・リンクを分解する", () => {
    expect(parseInline("a**b**c")).toEqual([
      { kind: "text", text: "a" },
      { kind: "strong", text: "b" },
      { kind: "text", text: "c" },
    ]);
    expect(parseInline("`x`")).toEqual([{ kind: "code", text: "x" }]);
    expect(parseInline("[名前](https://e.com)")).toEqual([
      { kind: "link", text: "名前", href: "https://e.com" },
    ]);
  });

  /** ★ 出典の URL は <...> で書く。落とすと山括弧つきの生文字になる。 */
  it("山括弧のURLもリンクにする", () => {
    expect(parseInline("出典 <https://e.com/a>")).toEqual([
      { kind: "text", text: "出典 " },
      { kind: "link", text: "https://e.com/a", href: "https://e.com/a" },
    ]);
  });

  it("記法が無ければそのまま1つ", () => {
    expect(parseInline("ふつうの文")).toEqual([
      { kind: "text", text: "ふつうの文" },
    ]);
  });
});

describe("ブロックの記法", () => {
  it("見出し・段落・箇条書き・番号付き", () => {
    const b = parseMarkdown(
      "## 見出し\n\n本文です。\n\n- 一\n- 二\n\n1. A\n2. B",
    );
    expect(b.map((x) => x.kind)).toEqual(["heading", "para", "list", "list"]);
    expect(b[2]).toMatchObject({ ordered: false });
    expect(b[3]).toMatchObject({ ordered: true });
  });

  it("表は区切り行がある場合だけ表になる", () => {
    const t = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(t[0].kind).toBe("table");
    // 区切り行が無ければ表ではない（段落として落ちる）
    expect(parseMarkdown("| a | b |")[0].kind).not.toBe("table");
  });

  it("コードブロックの中身は記法として解釈しない", () => {
    const b = parseMarkdown("```\n- **これは箇条書きではない**\n```");
    expect(b[0]).toEqual({
      kind: "code",
      text: "- **これは箇条書きではない**",
    });
  });

  it("引用と水平線", () => {
    const b = parseMarkdown("> 引用です\n\n---");
    expect(b[0].kind).toBe("quote");
    expect(b[1].kind).toBe("rule");
  });

  it("空文字でも落ちない", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});

/**
 * ★★ このテストがこの自前パーサの生命線 ★★
 * ライブラリを使っていないので、**扱えない記法を書いたら黙って生のまま表示される**。
 * 実際の記事を全部流して、記法の残骸が本文に出ていないことを見る。
 * 記事を書き足したときも、ここが自動的に見張る。
 */
describe("実際の記事（docs/knowledge/*.md）", () => {
  it("記事が1本以上ある", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  for (const d of docs) {
    describe(d.slug, () => {
      const entry = parseEntry(d.slug, d.src);

      it("見出しの5項目が読める", () => {
        expect(entry.title).not.toBe(d.slug);
        expect(STATUSES).toContain(entry.status);
        expect(entry.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // 状態を除いた4項目（確かめ方・出典・最終更新・関係するツール）
        expect(entry.meta.length).toBeGreaterThanOrEqual(3);
      });

      it("本文と要約がある", () => {
        expect(entry.body.length).toBeGreaterThan(3);
        expect(entry.summary.length).toBeGreaterThan(0);
      });

      it("記法が生のまま残っていない", () => {
        // コードブロックの中は素通しなので除いて見る。
        const t = plainText(entry.body.filter((b) => b.kind !== "code"));
        expect(t, "太字の記号が残っている").not.toMatch(/\*\*/);
        expect(t, "リンクの記法が残っている").not.toMatch(/\]\(http/);
        expect(t, "表の区切りが残っている").not.toMatch(/\|\s*-{3}/);
        expect(t, "見出しの記号が残っている").not.toMatch(/^#{1,6}\s/m);
        expect(t, "山括弧のURLが残っている").not.toMatch(/<https?:/);
      });
    });
  }

  it("最終更新の新しい順に並ぶ", () => {
    const sorted = sortEntries(docs.map((d) => parseEntry(d.slug, d.src)));
    const dates = sorted.map((e) => e.updated);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
