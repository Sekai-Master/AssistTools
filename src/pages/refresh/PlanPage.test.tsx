/**
 * @vitest-environment jsdom
 *
 * 周回プランの「詳しく計算する」（UX 監査 2026-11-12、指示書の共通の型 1、PR-6）。
 *
 * ★ 前は入力 16 個が開いたまま並び、結果（タイムライン）は 3 画面目の下だった。
 *   主な入力（曲・現在のゲージ・現在ポイント・点数時速）だけを見せ、任意の入力
 *   （基準焚き数と較正・編成・オート・プランの保存）は「詳しく計算する」に畳む。
 *   畳んだ中の値も計算に使うので、既定値から変えた数を見出しに出す。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import PlanPage from "./PlanPage";
import { resetProfilesForTest } from "../../lib/profiles";

// 楽曲データは読まない（入力の並びだけを見る）
vi.mock("../analyzer/useAnalyzerMusics", () => ({
  useAnalyzerMusics: () => ({ musics: [], aliases: [], loading: false, error: null }),
}));

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetProfilesForTest();
});

const draw = () =>
  render(
    <MemoryRouter>
      <PlanPage />
    </MemoryRouter>,
  );

const more = () => screen.getByText("詳しく計算する").closest("details")!;
const summaryText = () => more().querySelector("summary")!.textContent ?? "";
/** el がどこかの閉じた <details> の中（summary を除く）にあるか。 */
const folded = (el: Element) => {
  if (el.closest("summary")) return false;
  const d = el.closest("details");
  return d != null && !d.open;
};

describe("主な入力と「詳しく計算する」", () => {
  it("主な入力（現在のゲージ・現在ポイント・点数時速）は畳まない", () => {
    draw();
    for (const label of ["現在のゲージ", "現在ポイント", "点数時速"]) {
      expect(folded(screen.getByLabelText(label))).toBe(false);
    }
  });

  it("任意の入力（基準焚き数・総合力・ボーナス・ワールドパス・オート・プランの保存）は 1 つの閉じた段に入る", () => {
    draw();
    expect(more().open).toBe(false);
    expect(document.querySelectorAll("details > summary").length).toBeGreaterThan(0);
    for (const label of ["総合力", "イベントボーナス (%)", "ワールドパス 有効", "カラフルパス", "プラン名"]) {
      expect(more().contains(screen.getByLabelText(label))).toBe(true);
    }
    expect(more().textContent).toContain("基準焚き数");
    expect(more().textContent).toContain("オート（休憩中に回す）");
  });

  it("結果（タイムライン）は「詳しく計算する」の外", () => {
    draw();
    expect(more().contains(screen.getByRole("button", { name: /＋稼働/ }))).toBe(false);
  });
});

describe("見出しの変更数", () => {
  it("初めは数を出さない。中の値を変えると数える", async () => {
    draw();
    expect(summaryText()).not.toContain("変更中");
    await userEvent.type(screen.getByLabelText("総合力"), "336000");
    expect(summaryText()).toContain("1 項目を変更中");
    await userEvent.click(screen.getByLabelText("ワールドパス 有効"));
    expect(summaryText()).toContain("2 項目を変更中");
  });
});
