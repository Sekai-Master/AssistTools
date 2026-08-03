import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelogParser";
import changelogMarkdown from "../../../CHANGELOG.md?raw";

const SAMPLE = `# 更新履歴

前書き。ここは版ではないので読み飛ばされる。

<!-- 書式についての注意書き。本文ではない。 -->

## [2.0.0] - 2026-09-01

この版の説明。

### 追加

- **強調**は落として素のテキストにする
- 2つめ

### 修正

- 直したもの

## [1.0.0] - 2026-07-22

### 追加

- 最初の版
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(SAMPLE);

  it("版を新しい順（ファイルの並び順）に取り出す", () => {
    expect(releases.map((r) => r.version)).toEqual(["2.0.0", "1.0.0"]);
    expect(releases[0].date).toBe("2026-09-01");
  });

  it("版見出しより前の前書きと HTML コメントは版に混ざらない", () => {
    expect(releases[0].summary).toBe("この版の説明。");
    // 前書きが 2.0.0 の説明として吸い込まれていないこと。
    expect(releases[0].summary).not.toContain("前書き");
    expect(JSON.stringify(releases)).not.toContain("注意書き");
  });

  it("見出しごとに項目をまとめ、強調記法は落とす", () => {
    expect(releases[0].groups.map((g) => g.label)).toEqual(["追加", "修正"]);
    expect(releases[0].groups[0].items).toEqual(["強調は落として素のテキストにする", "2つめ"]);
    expect(releases[0].groups[1].items).toEqual(["直したもの"]);
  });

  it("説明が無い版は summary が空", () => {
    expect(releases[1].summary).toBe("");
    expect(releases[1].groups[0].items).toEqual(["最初の版"]);
  });
});

describe("CHANGELOG.md（実物）", () => {
  const releases = parseChangelog(changelogMarkdown);

  it("解析できる版が1つ以上ある（書式を崩したら落ちる）", () => {
    expect(releases.length).toBeGreaterThan(0);
  });

  /*
   * ★ このテストが本命。
   *   package.json の version を上げたのに CHANGELOG に書き忘れる（またはその逆）と、
   *   フッターの表示と更新履歴が食い違う。手順書で気をつけるのではなく CI で止める。
   *   直し方は「リリースする版を CHANGELOG.md の先頭に足す」か「package.json を戻す」。
   */
  it("先頭の版が package.json の version と一致する", () => {
    expect(releases[0].version).toBe(__APP_VERSION__);
  });

  it("すべての版に日付と中身がある", () => {
    for (const r of releases) {
      expect(r.date, `v${r.version} の日付`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.groups.length, `v${r.version} の項目`).toBeGreaterThan(0);
      for (const g of r.groups) {
        expect(g.items.length, `v${r.version} の「${g.label}」`).toBeGreaterThan(0);
      }
    }
  });

  it("版が新しい順に並んでいる", () => {
    const dates = releases.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
