/**
 * @vitest-environment jsdom
 *
 * リアクション図鑑の「絞り込み」（UX 監査 2026-11-12、指示書の共通の型 1、PR-6）。
 *
 * ★ 前は一覧の前に絞り込みの入力 21 個と 143 字の説明が開いたまま並び、一覧は 2 画面目の途中からだった。
 *   よく使うもの（キャラ・家具の名前で検索・並び順）を残し、反応の種類・所持・人数・スイッチ 4 つ・ジャンルは
 *   「詳しく計算する」の部品（見出し「絞り込み」）に畳む。畳んでも絞り込みは効くので、既定から変えた数を見出しに出す。
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { normalize } from "./lib/types";
import { DEFAULT_FILTER, type FilterState } from "./lib/filter";
import { countFilterDetailChanged } from "./lib/filter";

const data = normalize(JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/MysekaiDatas/fixtures.json"), "utf8")));

vi.mock("./useMysekaiFixtures", () => ({
  useMysekaiFixtures: () => ({ data, loading: false, error: null }),
}));

// モックの後に読む
const { default: MysekaiReactions } = await import("./MysekaiReactions");

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const more = () => screen.getByText("絞り込み", { selector: "summary" }).closest("details")!;
const summaryText = () => more().querySelector("summary")!.textContent ?? "";
/** el がどこかの閉じた <details> の中（summary を除く）にあるか。 */
const folded = (el: Element) => {
  if (el.closest("summary")) return false;
  const d = el.closest("details");
  return d != null && !d.open;
};

describe("よく使う絞り込みと「絞り込み」の段", () => {
  it("キャラ・家具の名前で検索・並び順は畳まない", () => {
    render(<MysekaiReactions />);
    expect(folded(screen.getByLabelText("キャラで絞る"))).toBe(false);
    expect(folded(screen.getByLabelText("家具の名前で検索"))).toBe(false);
    expect(folded(screen.getByRole("button", { name: /昇順|降順/ }))).toBe(false);
  });

  it("反応の種類・所持・人数・スイッチ 4 つ・ジャンルと、その説明は 1 つの閉じた段に入る", () => {
    render(<MysekaiReactions />);
    expect(more().open).toBe(false);
    for (const label of ["反応がある家具だけ", "キャラが使う家具だけ", "持っていて未回収の会話がある", "模写できるものだけ", "ジャンルで絞る"]) {
      expect(more().contains(screen.getByLabelText(label))).toBe(true);
    }
    expect(more().textContent).toContain("すべて満たすもの");
  });

  it("初めは数を出さない（既定は「反応がある家具だけ」が入っている）。スイッチを変えると数える", async () => {
    render(<MysekaiReactions />);
    expect(summaryText()).not.toContain("変更中");
    await userEvent.click(screen.getByLabelText("模写できるものだけ"));
    expect(summaryText()).toContain("1 項目を変更中");
    await userEvent.click(screen.getByLabelText("反応がある家具だけ"));
    expect(summaryText()).toContain("2 項目を変更中");
  });
});

describe("countFilterDetailChanged", () => {
  it("既定なら 0。キャラ・検索・並び順は数えない（畳んでいないので）", () => {
    expect(countFilterDetailChanged(DEFAULT_FILTER)).toBe(0);
    const f: FilterState = { ...DEFAULT_FILTER, charId: 1, query: "ソファ", sort: "talks", desc: true };
    expect(countFilterDetailChanged(f)).toBe(0);
  });

  it("畳んだ中の 8 項目を数える", () => {
    const f: FilterState = {
      ...DEFAULT_FILTER,
      kinds: ["talk"],
      owned: "owned",
      party: "solo",
      reactiveOnly: false,
      actionOnly: true,
      unseenOnly: true,
      sketchableOnly: true,
      mainGenreId: 3,
    };
    expect(countFilterDetailChanged(f)).toBe(8);
  });
});
