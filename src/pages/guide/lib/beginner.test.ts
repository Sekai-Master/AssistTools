/**
 * 初心者向けの層（入口のページ・スタンプ早見表・ひとことで・用語のボタン）の読み取り。
 * 実際の原稿（docs/guide/start.md・stamps.md・summary.md と第 8 章）も流して、差し込みと対応の漏れを落とす。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGuide, STAMPS_AFTER_SECTION } from "./chapters";
import { annotateTerms, parseGlossary } from "./glossary";
import { chapterNumberOf, figureNumberOf, inlineText, parseChapter, type GuideBlock, type GuideInline } from "./guide";
import { parseRefs, refTo } from "./refs";
import { STAMPS, stampAlt, stampAssetsOf, stampTableBlocks } from "./stamps";
import { parseSummaryItems } from "./summary";

const ROOT = path.join(__dirname, "../../../..");
const DOC = path.join(ROOT, "docs/guide");
const read = (f: string) => fs.readFileSync(path.join(DOC, f), "utf8");
const FIGS = new Set(
  fs.readdirSync(path.join(__dirname, "../figures")).flatMap((f) => {
    const n = figureNumberOf(f);
    return n == null ? [] : [n];
  }),
);
const chapters = new Map(
  fs.readdirSync(DOC).flatMap((f) => {
    const n = chapterNumberOf(f);
    return n == null ? [] : [[n, read(f)] as const];
  }),
);
const sources = { chapters, start: read("start.md"), stamps: read("stamps.md"), summary: read("summary.md"), figures: FIGS };
const guide = buildGuide(sources);

const P = (src: string) => parseChapter(0, src, { figures: FIGS });
const terms = (xs: GuideInline[]) => xs.filter((x) => x.kind === "term").map((x) => x.kind === "term" && x.text);

describe("節の番号のリンク（refs）", () => {
  it("3.2 は章のページのアンカー、0 と 0.x は /guide", () => {
    expect(refTo("3.2")).toEqual({ label: "3.2", to: "/guide/3#s3-2" });
    expect(refTo("0.1")).toEqual({ label: "0.1", to: "/guide#s0-1" });
    expect(refTo("0")).toEqual({ label: "第0章", to: "/guide" });
    expect(refTo("第4章")).toEqual({ label: "第4章", to: "/guide/4" });
    expect(refTo("3-2")).toBeNull();
  });

  it("区切りは ・ 、 と空白。1 つでも読めなければ空（書き損じを見逃さない）", () => {
    expect(parseRefs("1.3・6.2").map((r) => r.to)).toEqual(["/guide/1#s1-3", "/guide/6#s6-2"]);
    expect(parseRefs("3.1、 5.1")).toHaveLength(2);
    expect(parseRefs("3.1・どこか")).toEqual([]);
  });
});

describe("入口のページの差し込み", () => {
  it("［画像A1: 題］は囲みを描いた撮影、［スタンプ早見表］は早見表、くわしく → は節へのリンク", () => {
    const c = P("［画像A1: ルームを選ぶ画面］\n\n［スタンプ早見表］\n\nくわしく → 3.1・5.1");
    expect(c.blocks).toEqual([
      { kind: "image", key: "A1", title: "ルームを選ぶ画面" },
      { kind: "stamps" },
      { kind: "more", refs: [{ label: "3.1", to: "/guide/3#s3-1" }, { label: "5.1", to: "/guide/5#s5-1" }] },
    ]);
    expect(c.problems).toEqual([]);
  });

  it("無い A の番号・読めない「くわしく」は problems に出る", () => {
    const c = P("［画像A9: 無い］\n\nくわしく → どこか");
    expect(c.problems).toHaveLength(2);
  });

  it("手順の見出し「1. 題」のアンカーは step1", () => {
    expect(P("### 1. 部屋を探す・作る").sections).toEqual([{ id: "step1", label: "1. 部屋を探す・作る" }]);
  });

  it("太字の中の確かさの印も印になる（文字は太字のまま）", () => {
    const b = P("**周回ではプライベートルームです〔走っている人の実感〕。**").blocks[0] as Extract<GuideBlock, { kind: "para" }>;
    expect(b.text.map((x) => x.kind)).toEqual(["strong", "mark", "strong"]);
  });
});

describe("スタンプ早見表", () => {
  const table = (cell: string) =>
    stampTableBlocks(P(`| スタンプ | いつ |\n|---|---|\n| ${cell} | 抜けるとき |`).blocks, []);

  it("asset 名を絵にし、alt は manifest の名前から「[スタンプ]」を外したもの", () => {
    const t = table("stamp0014")[0] as Extract<GuideBlock, { kind: "table" }>;
    expect(t.rows[0][0]).toEqual([{ kind: "stamp", asset: "stamp0014", alt: STAMPS.get("stamp0014")!.alt }]);
    expect(stampAlt("[スタンプ]穂波：ごめん…行くね")).toBe("穂波：ごめん…行くね");
    expect(stampAlt("[テキストスタンプ]間違えた！")).toBe("間違えた！");
  });

  it("半角の空白で区切った複数の asset 名は、1 つのセルに並べる", () => {
    const t = table("stamp0014 stamp0383 stamp0095")[0] as Extract<GuideBlock, { kind: "table" }>;
    expect(t.rows[0][0].map((x) => x.kind === "stamp" && x.asset)).toEqual(["stamp0014", "stamp0383", "stamp0095"]);
    // ほかの列はそのまま
    expect(inlineText(t.rows[0][1])).toBe("抜けるとき");
  });

  it("manifest に無い asset 名は problems に出る", () => {
    const problems: string[] = [];
    stampTableBlocks(P("| スタンプ |\n|---|\n| stamp9999 |").blocks, problems);
    expect(problems).toHaveLength(1);
  });
});

describe("ひとことで（summary.md）", () => {
  it("### N.M の次の行を、その節の見出しのすぐ下に出す。無い節には何も出さない", () => {
    const summaries = new Map(parseSummaryItems("### 3.1 ルーム\n要点です〔公式〕。\n\n### 3.2 スキル\n").map((s) => [s.id, s.text]));
    expect([...summaries.keys()]).toEqual(["s3-1"]);
    const c = parseChapter(3, "### 3.1 ルーム\n\n本文。\n\n### 3.2 スキル\n\n本文。", { figures: FIGS, summaries });
    expect(c.blocks.map((b) => b.kind)).toEqual(["heading", "summary", "para", "heading", "para"]);
  });

  it("本文に無い節の要点があれば落とす", () => {
    const g = buildGuide({ ...sources, summary: "### 9.9 無い節\n要点。" });
    expect(g.problems.join()).toContain("s9-9");
  });
});

describe("用語のボタン（第 8 章）", () => {
  const glossary = parseGlossary(
    [
      "- **支援・支援鯖**: 周回を手伝うこと〔プレイヤーの間で〕。 → 5.1",
      "- **支援者**: 支援する人。 → 5.3",
      "- **募・主**: 募集の条件と主の編成。 → 4.1",
      "- **アンコ・アンコール**: 6 回目のスキル。 → 3.2・4.5",
    ].join("\n"),
  );

  it("語・説明・行き先を読み、「・」でつながった語はそれぞれ拾う（1 字の語は拾わない）", () => {
    expect(glossary.map((e) => e.terms)).toEqual([["支援", "支援鯖"], ["支援者"], [], ["アンコ", "アンコール"]].filter((t) => t.length));
    expect(glossary[0].refs).toEqual([{ label: "5.1", to: "/guide/5#s5-1" }]);
    expect(inlineText(glossary[0].def)).toBe("周回を手伝うこと〔プレイヤーの間で〕。");
  });

  it("各節で最初の 1 回だけ。同じ位置なら長い語。見出しで数え直す", () => {
    const blocks = annotateTerms(
      P("### 5.1 支援\n\n支援鯖では支援者が支援します。アンコールとアンコ。\n\n### 5.2 次\n\n支援します。").blocks,
      glossary,
    );
    const paras = blocks.filter((b) => b.kind === "para") as Extract<GuideBlock, { kind: "para" }>[];
    expect(terms(paras[0].text)).toEqual(["支援鯖", "支援者", "アンコール"]);
    expect(terms(paras[1].text)).toEqual(["支援"]);
    // 文字は元のまま
    expect(inlineText(paras[0].text)).toBe("支援鯖では支援者が支援します。アンコールとアンコ。");
  });

  it("英数字の語は、別の英数字の語の一部では拾わない（SF を SFC の中で拾わない）", () => {
    const g = parseGlossary("- **SF・SUPER FEVER**: 説明。 → 3.3");
    const para = (src: string) => annotateTerms(P(src).blocks, g)[0] as Extract<GuideBlock, { kind: "para" }>;
    expect(terms(para("SFC気にしません。SF の話。").text)).toEqual(["SF"]);
    expect(inlineText(para("SFC気にしません。SF の話。").text)).toBe("SFC気にしません。SF の話。");
    expect(terms(para("SFは強い").text)).toEqual(["SF"]);
  });

  it("見出し・表・印・リンク・太字の中は対象にしない", () => {
    const blocks = annotateTerms(
      P("### 5.1 支援鯖\n\n| 支援 |\n|---|\n| 支援鯖 |\n\n**支援鯖** と [支援鯖](https://e.com) と〔支援〕のあと、支援鯖。").blocks,
      glossary,
    );
    const heading = blocks[0] as Extract<GuideBlock, { kind: "heading" }>;
    expect(terms(heading.text)).toEqual([]);
    const table = blocks.find((b) => b.kind === "table") as Extract<GuideBlock, { kind: "table" }>;
    expect(table.rows.flat(2).some((x) => x.kind === "term")).toBe(false);
    const para = blocks.find((b) => b.kind === "para") as Extract<GuideBlock, { kind: "para" }>;
    expect(terms(para.text)).toEqual(["支援鯖"]);
    expect(para.text[para.text.length - 2]).toMatchObject({ kind: "term", text: "支援鯖" });
  });

  it("実際の第 8 章から 30 項目以上読め、どの項目も行き先が読める", () => {
    const real = parseGlossary(chapters.get(8)!);
    expect(real.length).toBeGreaterThanOrEqual(30);
    const noRef = real.filter((e) => e.refs.length === 0).map((e) => e.label);
    expect(noRef).toEqual([]);
  });
});

describe("実際の原稿（start.md・stamps.md・summary.md）", () => {
  it("組み立てで食い違いが無い（差し込み・早見表の絵・ひとことでの節）", () => {
    expect(guide.problems).toEqual([]);
  });

  it("入口のページは手順のカードに分かれ、どの手順にも「くわしく」がある", () => {
    const start = guide.start!;
    expect(start.title).toBeTruthy();
    expect(start.sections.length).toBeGreaterThanOrEqual(5);
    expect(start.sections.every((s) => /^step\d+$/.test(s.id))).toBe(true);
    const mores = start.blocks.filter((b) => b.kind === "more");
    expect(mores.length).toBe(start.sections.length);
    expect(start.problems).toEqual([]);
  });

  it("入口のページの差し込みが、実在の画像・図・早見表に全部解決する", () => {
    const kinds = guide.start!.blocks.map((b) => b.kind);
    expect(kinds).toContain("image");
    expect(kinds).toContain("stamps");
    const t = guide.start!.blocks
      .filter((b) => b.kind === "para")
      .map((b) => (b.kind === "para" ? inlineText(b.text) : ""))
      .join("\n");
    expect(t).not.toMatch(/^［/m);
    expect(t).not.toMatch(/^くわしく/m);
  });

  it("早見表の asset 名が全部 public/guide/stamps/ にあり、manifest に載っている", () => {
    const assets = stampAssetsOf(guide.stamps);
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) {
      expect(fs.existsSync(path.join(ROOT, "public/guide/stamps", `${a}.webp`)), a).toBe(true);
      expect(STAMPS.has(a), a).toBe(true);
    }
  });

  it("public/guide/stamps/ の絵は全部 manifest に載り、出どころの README がある", () => {
    const dir = path.join(ROOT, "public/guide/stamps");
    const webps = fs.readdirSync(dir).filter((f) => f.endsWith(".webp"));
    expect(webps.map((f) => f.replace(/\.webp$/, "")).sort()).toEqual([...STAMPS.keys()].sort());
    expect(fs.readFileSync(path.join(dir, "README.md"), "utf8")).toContain("sekai-master-db-diff");
  });

  it("第 4 章の 4.3 の節の終わりに早見表を出す", () => {
    const ch4 = guide.chapters.find((c) => c.n === 4)!;
    const at = ch4.blocks.findIndex((b) => b.kind === "heading" && b.id === STAMPS_AFTER_SECTION);
    const next = ch4.blocks.findIndex((b, i) => i > at && b.kind === "heading");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(ch4.blocks[next - 1].kind).toBe("stamps");
  });

  it("ひとことでが本文の節の下に出る（summary.md の節の数だけ）", () => {
    const n = parseSummaryItems(sources.summary).length;
    const shown = guide.chapters.flatMap((c) => c.blocks).filter((b) => b.kind === "summary").length;
    expect(n).toBeGreaterThan(0);
    expect(shown).toBe(n);
  });

  it("第 8 章（用語集）の中では語をボタンにしない。ほかの章ではボタンが出る", () => {
    const has = (n: number) =>
      guide.chapters
        .find((c) => c.n === n)!
        .blocks.some((b) => (b.kind === "para" || b.kind === "list") && JSON.stringify(b).includes('"kind":"term"'));
    expect(has(8)).toBe(false);
    expect(has(3)).toBe(true);
  });
});
