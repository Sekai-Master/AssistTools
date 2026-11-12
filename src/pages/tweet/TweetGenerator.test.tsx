/**
 * @vitest-environment jsdom
 *
 * ついぼの「条件を書く」（UX 監査 2026-11-12、指示書の共通の型 1、PR-6）。
 *
 * ★ 前は入力 45 個が開いたまま並んでいた（主・募の任意のチェック 15 個を含む）。主な入力（楽曲・回数・残り枠・
 *   ルームID）だけを見せ、ほかは「詳しく計算する」の部品（見出し「条件を書く」）に畳む。
 * ★★ 既定値のままで文面が出る今の挙動は壊さない（プレビュー・コピー・ツイートは今のまま）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TweetGenerator from "./TweetGenerator";
import { DEFAULT_TWEET_STATE, buildTweetText, countTweetDetailChanged } from "./tweetLogic";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const more = () => screen.getByText("条件を書く").closest("details")!;
const summaryText = () => more().querySelector("summary")!.textContent ?? "";
/** el がどこかの閉じた <details> の中（summary を除く）にあるか。 */
const folded = (el: Element) => {
  if (el.closest("summary")) return false;
  const d = el.closest("details");
  return d != null && !d.open;
};

describe("主な入力と「条件を書く」", () => {
  it("楽曲・回数・残り枠・ルームIDと、主スキル値・募集スキル値は畳まない（指揮の決定 2026-11-12）", () => {
    render(<TweetGenerator />);
    for (const name of ["エビ", "高速周回", "@1"]) {
      expect(folded(screen.getByRole("button", { name }))).toBe(false);
    }
    expect(folded(screen.getByLabelText("ルームID", { selector: "#tg-roomid" }))).toBe(false);
    for (const label of ["主スキル値", "募集スキル値"]) {
      expect(folded(screen.getByLabelText(label))).toBe(false);
      expect(folded(screen.getByPlaceholderText(`${label}を入力`))).toBe(false);
    }
  });

  it("TL放流・ルーム・ルームID記号・主・募・その他コメントは、1 つの閉じた「条件を書く」に入る", () => {
    render(<TweetGenerator />);
    expect(more().open).toBe(false);
    for (const label of ["スキル値に % を付ける", "主内部値", "募集内部値", "☆４", "途中抜けOK"]) {
      expect(more().contains(screen.getByLabelText(label))).toBe(true);
    }
    for (const name of ["ベテラン", "なし", "ルームID"]) {
      expect(more().contains(screen.getByRole("radio", { name }))).toBe(true);
    }
    expect(more().textContent).toContain("テンプレ（クリックで追記）");
  });

  it("既定値のままで、前と同じ文面が出る", () => {
    render(<TweetGenerator />);
    expect(screen.getAllByText((_, el) => el?.tagName === "PRE" && el.textContent === buildTweetText(DEFAULT_TWEET_STATE)).length).toBeGreaterThan(0);
  });
});

describe("見出しの変更数", () => {
  it("初めは数を出さない。中の項目を変えると数える（チェックと値は 1 項目、見せている主スキル値は数えない）", async () => {
    render(<TweetGenerator />);
    expect(summaryText()).not.toContain("変更中");
    await userEvent.click(screen.getByLabelText("☆４"));
    expect(summaryText()).toContain("1 項目を変更中");
    await userEvent.type(screen.getByPlaceholderText("主スキル値を入力"), "150");
    expect(summaryText()).toContain("1 項目を変更中");
    await userEvent.click(screen.getByLabelText("主内部値"));
    expect(summaryText()).toContain("2 項目を変更中");
  });
});

describe("countTweetDetailChanged", () => {
  it("既定値なら 0、主な入力（楽曲・回数・残り枠・ルームID・主スキル値・募集スキル値）を変えても数えない", () => {
    expect(countTweetDetailChanged(DEFAULT_TWEET_STATE)).toBe(0);
    expect(countTweetDetailChanged({ ...DEFAULT_TWEET_STATE, song: "エビ", rounds: "3回", remainingSlots: "2", roomId: "12345" })).toBe(0);
    expect(countTweetDetailChanged({ ...DEFAULT_TWEET_STATE, hostSkill: "150", requiredSkill: "140", showRequiredSkill: false })).toBe(0);
  });

  it("チェックと値は 1 項目として数える", () => {
    expect(countTweetDetailChanged({ ...DEFAULT_TWEET_STATE, showHostInnerValue: true, hostInnerValue: "620" })).toBe(1);
    expect(countTweetDetailChanged({ ...DEFAULT_TWEET_STATE, room: "フリー", showStar4: true, otherComments: "火消し" })).toBe(3);
  });
});
