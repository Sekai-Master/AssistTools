import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../../../tools";
import {
  chapterNumberOf,
  chapterParam,
  chapterText,
  figureNumberOf,
  inlineText,
  internalPath,
  isolateInserts,
  markKindOf,
  parseChapter,
  sectionId,
  type GuideBlock,
} from "./guide";

const DOC_DIR = "docs/guide";
const FIG_DIR = "src/pages/guide/figures";

const figFiles = readdirSync(FIG_DIR).filter((f) => f.endsWith(".svg"));
const FIGS = new Set(figFiles.map((f) => figureNumberOf(f)!).filter((n) => n != null));
const docs = readdirSync(DOC_DIR)
  .filter((f) => chapterNumberOf(f) != null)
  .map((f) => ({ n: chapterNumberOf(f)!, src: readFileSync(`${DOC_DIR}/${f}`, "utf8") }))
  .sort((a, b) => a.n - b.n);

const tableOf = (bs: GuideBlock[]) => bs.find((b) => b.kind === "table") as Extract<GuideBlock, { kind: "table" }>;

describe("差し込みの行", () => {
  it("段落が［図N: 題］だけなら図にする", () => {
    const c = parseChapter(1, "## 1. 章\n\n本文。\n\n［図1: イベントポイントの決まり方］\n\n続き。", new Set([1]));
    expect(c.blocks.map((b) => b.kind)).toEqual(["para", "figure", "para"]);
    expect(c.blocks[1]).toEqual({ kind: "figure", n: 1, title: "イベントポイントの決まり方" });
    expect(c.problems).toEqual([]);
  });

  it("段落が［画像N: 題］だけなら画像にする（全角・半角のコロンどちらも）", () => {
    const c = parseChapter(1, "［画像3: ルームの待機画面］\n\n［画像9：イベントのトップ］", new Set());
    expect(c.blocks).toEqual([
      { kind: "image", n: 3, title: "ルームの待機画面" },
      { kind: "image", n: 9, title: "イベントのトップ" },
    ]);
  });

  /** ★ md.ts は空行の無い連続行を 1 段落につなぐ。原稿の第 4 章に実際にこの形がある。 */
  it("空行なしで続けて書かれた差し込みも 1 つずつ拾う", () => {
    const c = parseChapter(4, "本文。\n［画像3: 待機画面］\n［画像4: スタンプを選ぶ画面］\n続き。", new Set());
    expect(c.blocks.map((b) => b.kind)).toEqual(["para", "image", "image", "para"]);
    expect(isolateInserts("a\n［図1: x］\nb")).toBe("a\n\n［図1: x］\n\nb");
  });

  it("文の途中の［…］は差し込みにしない", () => {
    const c = parseChapter(1, "これは［図1: 題］の話です。", new Set([1]));
    expect(c.blocks[0].kind).toBe("para");
  });

  it("存在しない図・画像の番号は problems に出る（テストで落とすため）", () => {
    const c = parseChapter(1, "［図99: 無い図］\n\n［画像99: 無い画像］", new Set([1]));
    expect(c.problems).toHaveLength(2);
    expect(c.problems.join()).toContain("図99");
    expect(c.problems.join()).toContain("画像99");
  });
});

describe("確かさの印", () => {
  it("〔…〕を印に割り、文字は残す", () => {
    const c = parseChapter(1, "倍率は35倍です〔ゲームのデータ〕。改定は〔公式・2024年9月から〕。", new Set());
    const b = c.blocks[0] as Extract<GuideBlock, { kind: "para" }>;
    const marks = b.text.filter((x) => x.kind === "mark");
    expect(marks.map((m) => m.kind === "mark" && m.text)).toEqual(["ゲームのデータ", "公式・2024年9月から"]);
    expect(marks.map((m) => m.kind === "mark" && m.mark?.key)).toEqual(["ゲームのデータ", "公式"]);
    // 描画される文字としては元のまま
    expect(inlineText(b.text)).toBe("倍率は35倍です〔ゲームのデータ〕。改定は〔公式・2024年9月から〕。");
  });

  it("実感・見立て・プレイヤーの間では soft、それ以外は firm", () => {
    expect(markKindOf("走っている人の実感")?.tone).toBe("soft");
    expect(markKindOf("走っている人の見立て")?.tone).toBe("soft");
    expect(markKindOf("プレイヤーの間で")?.tone).toBe("soft");
    expect(markKindOf("このサイトの計算")?.tone).toBe("firm");
    expect(markKindOf("ゲームの画面")?.tone).toBe("firm");
    expect(markKindOf("公式・2026年2月から")?.tone).toBe("firm");
  });

  it("知らない印は種類なし（公式に似た別の語も拾わない）", () => {
    expect(markKindOf("公式っぽい")).toBeUndefined();
    expect(markKindOf("コード")).toBeUndefined();
  });
});

describe("第 9 章の表（説明の列）", () => {
  it("ツールの列のリンクから tools.ts を引き、説明の列を足す", () => {
    const src = "| カテゴリ | ツール | 出る節 |\n|---|---|---|\n| 編成 | [編成ビルダー](https://sekaimaster.pages.dev/deck) | 2.1 |\n| イベント | [歴代ボーダー](https://sekaimaster.pages.dev/border/history) | 1.4 |";
    const t = tableOf(parseChapter(9, src, new Set()).blocks);
    expect(t.head.map(inlineText)).toEqual(["カテゴリ", "ツール", "説明", "出る節"]);
    expect(inlineText(t.rows[0][2])).toBe(TOOLS.find((x) => x.path === "/deck")!.description);
    expect(inlineText(t.rows[1][2])).toBe(TOOLS.find((x) => x.path === "/border/history")!.description);
  });

  it("「パス」の列があればそちらで引き、その右に足す", () => {
    const src = "| カテゴリ | ツール | パス | 出る節 |\n|---|---|---|---|\n| 計画 | 周回プラン | `/plan` | 1.3 |";
    const t = tableOf(parseChapter(9, src, new Set()).blocks);
    expect(t.head.map(inlineText)).toEqual(["カテゴリ", "ツール", "パス", "説明", "出る節"]);
    expect(inlineText(t.rows[0][3])).toBe(TOOLS.find((x) => x.path === "/plan")!.description);
  });

  it("tools.ts に無いパスは problems に出る", () => {
    const src = "| ツール |\n|---|\n| [無い](https://sekaimaster.pages.dev/nope) |";
    expect(parseChapter(9, src, new Set()).problems).toHaveLength(1);
  });

  it("ツールの列が無い表は触らない", () => {
    const src = "| 本文の印 | 出どころ |\n|---|---|\n| 〔公式〕 | 公式サイト |";
    expect(tableOf(parseChapter(0, src, new Set()).blocks).head.map(inlineText)).toEqual(["本文の印", "出どころ"]);
  });
});

describe("リンク・見出し・URL の番号", () => {
  it("自サイトの絶対 URL はサイトの中の移動にする", () => {
    expect(internalPath("https://sekaimaster.pages.dev/knowledge/overhead")).toBe("/knowledge/overhead");
    expect(internalPath("https://sekaimaster.pages.dev")).toBe("/");
    expect(internalPath("/deck")).toBe("/deck");
    expect(internalPath("https://example.com/deck")).toBeNull();
    expect(internalPath("https://sekaimaster.pages.dev.evil.example/")).toBeNull();
    expect(internalPath("//evil.example/")).toBeNull();
  });

  it("リンクの文字のバッククォートはコードにする", () => {
    const c = parseChapter(9, "[`/knowledge/overhead`](https://sekaimaster.pages.dev/knowledge/overhead)", new Set());
    const b = c.blocks[0] as Extract<GuideBlock, { kind: "para" }>;
    expect(b.text[0]).toEqual({
      kind: "link",
      href: "https://sekaimaster.pages.dev/knowledge/overhead",
      to: "/knowledge/overhead",
      parts: [{ kind: "code", text: "/knowledge/overhead" }],
    });
  });

  it("節の見出しにアンカー（3.2 → s3-2）", () => {
    expect(sectionId("3.2 スキルの発動とアンコール", 0)).toBe("s3-2");
    expect(sectionId("用語", 7)).toBe("h7");
    const c = parseChapter(3, "## 3. 協力ライブの仕組み\n\n### 3.1 ルーム\n\n本文。\n\n### 3.2 スキル", new Set());
    expect(c.title).toBe("協力ライブの仕組み");
    expect(c.sections).toEqual([
      { id: "s3-1", label: "3.1 ルーム" },
      { id: "s3-2", label: "3.2 スキル" },
    ]);
  });

  it("URL の章の番号は 1 桁の数字だけ", () => {
    expect(chapterParam("3")).toBe(3);
    expect(chapterParam("0")).toBe(0);
    for (const v of ["03", "10", "1a", "", "-1", undefined]) expect(chapterParam(v), String(v)).toBeNull();
  });
});

/**
 * ★ 実際の原稿（docs/guide/chN.md）を全部流す。原稿は指揮が差し替えるので、
 *   差し込みの書き損じ・存在しない番号・記法の残骸はここで落とす。
 */
describe("実際の原稿（docs/guide/*.md）", () => {
  it("第 0 章から第 9 章まで、番号が飛ばずにある", () => {
    expect(docs.map((d) => d.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  for (const d of docs) {
    describe(`第${d.n}章`, () => {
      const c = parseChapter(d.n, d.src, FIGS);

      it("章の見出し（## N. 名前）が読め、番号がファイル名と合う", () => {
        expect(d.src).toMatch(new RegExp(`^## ${d.n}\\.\\s`, "m"));
        expect(c.title).not.toBe(`第${d.n}章`);
      });

      it("参照した図・画像・ツールが全部ある", () => {
        expect(c.problems).toEqual([]);
      });

      it("［で始まる置き換え漏れ・記法の残骸が無い", () => {
        const t = chapterText(c.blocks.filter((b) => b.kind !== "code" && b.kind !== "figure" && b.kind !== "image"));
        expect(t, "置き換えられていない差し込みがある").not.toMatch(/^［/m);
        expect(t, "差し込みの書き損じがある").not.toMatch(/［(図|画像)/);
        expect(t, "太字の記号が残っている").not.toMatch(/\*\*/);
        expect(t, "リンクの記法が残っている").not.toMatch(/\]\(http/);
        expect(t, "表の区切りが残っている").not.toMatch(/\|\s*-{3}/);
        expect(t, "見出しの記号が残っている").not.toMatch(/^#{1,6}\s/m);
        expect(t, "バッククォートが残っている").not.toMatch(/`/);
      });

      it("確かさの印はすべて第 0 章の表にある種類", () => {
        const unknown = [...d.src.matchAll(/〔([^〕]+)〕/g)]
          .map((m) => m[1])
          .filter((s) => !markKindOf(s) && s !== "公式・YYYY年M月から");
        expect(unknown).toEqual([]);
      });
    });
  }

  it("第 9 章の表は全行に説明が付く", () => {
    const c = parseChapter(9, docs.find((d) => d.n === 9)!.src, FIGS);
    const t = tableOf(c.blocks);
    const col = t.head.map(inlineText).indexOf("説明");
    expect(col).toBeGreaterThan(0);
    expect(t.rows.length).toBeGreaterThan(0);
    for (const r of t.rows) expect(inlineText(r[col]).length, inlineText(r[1])).toBeGreaterThan(10);
  });
});

describe("図（src/pages/guide/figures/*.svg）", () => {
  const svgs = figFiles.map((f) => ({ f, svg: readFileSync(`${FIG_DIR}/${f}`, "utf8") }));

  it("ファイル名から番号が取れ、番号が重ならない", () => {
    expect(FIGS.size).toBe(figFiles.length);
  });

  /** ★ SVG は文字列のまま DOM に入れるので、動くものと外への参照が無いことをここで縛る。 */
  it.each(figFiles)("%s に script・on〜 の属性・外への参照が無い", (f) => {
    const svg = svgs.find((s) => s.f === f)!.svg;
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    expect(svg).not.toMatch(/(xlink:)?href\s*=/i);
    expect(svg).not.toMatch(/<foreignObject/i);
    expect(svg).not.toMatch(/url\(\s*['"]?(https?:|\/\/)/i);
  });

  /** ★ 埋め込んだ <style> は文書全体に掛かる。1 ページに 2 枚並ぶ章があるので、全部同じ中身であること。 */
  it("<style> の中身が全部同じ", () => {
    const styles = new Set(svgs.map(({ svg }) => /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ""));
    expect(styles.size).toBe(1);
  });
});
