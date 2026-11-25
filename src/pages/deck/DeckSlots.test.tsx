/**
 * @vitest-environment jsdom
 *
 * 編成の枠。
 *
 * ★ ブルフェスの特訓後スキルは**絵の面で決まる**（ゲームと同じ）。スキルの面を選ぶ欄は持たず、
 *   絵の切り替えボタン 1 つで絵とスキルの両方が切り替わる。
 * ★ 特訓後の絵でキャラクターランクが空だと、スキルは +0 で計算される。
 *   編集パネルを開かない人（合計だけ見る人）にも見えるよう、1 行表示にも印を出す。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeckSlots } from "./DeckSlots";
import type { CatalogCard } from "./lib/deckInputs";
import type { CardState } from "./lib/deckStore";

afterEach(cleanup);

const power = [Array(60).fill(1000), Array(60).fill(1000), Array(60).fill(1000)];

const bloom: CatalogCard = {
  id: 1475,
  ch: 2,
  rarity: "4",
  attr: "happy",
  skillId: 23,
  stSkillId: 22,
  name: "押し込めた想い",
  trained: [400, 400, 400],
  power,
};

const plain: CatalogCard = {
  id: 471,
  ch: 23,
  rarity: "4",
  attr: "cute",
  skillId: 10,
  name: "放課後のひととき",
  trained: [400, 400, 400],
  power,
};

const state = (over: Partial<CardState> = {}): CardState => ({
  level: 60,
  trained: true,
  masterRank: 0,
  skillLevel: 4,
  episodes: { first: true, latter: true },
  canvas: false,
  ...over,
});

const renderSlot = (
  s: CardState,
  characterRanks?: Record<number, number>,
  opts: { card?: CatalogCard; open?: boolean } = {}
) => {
  const card = opts.card ?? bloom;
  return render(
    <DeckSlots
      slots={[card, null, null, null, null]}
      states={{ [card.id]: s }}
      leaderIndex={0}
      openIndex={opts.open ? 0 : null}
      onPick={() => {}}
      onClear={() => {}}
      onLeader={() => {}}
      onToggleOpen={() => {}}
      onStateChange={() => {}}
      characterRanks={characterRanks}
    />
  );
};

const row = (name: RegExp) => screen.getByRole("button", { name });
/** 枠 1 つ（li）。印はボタンの外、行の下に出る。 */
const slot = (name: RegExp) => row(name).closest("li")!;

describe("枠の 1 行表示（特訓後スキルのキャラランク未入力）", () => {
  it("特訓後の絵（既定）でランクが空なら、閉じた枠にも印を出す", () => {
    renderSlot(state(), {});
    expect(slot(/押し込めた想い/).textContent).toContain("キャラランク未入力");
  });

  it("ランクが入っていれば印を出さない", () => {
    renderSlot(state(), { 2: 84 });
    expect(slot(/押し込めた想い/).textContent).not.toContain("未入力");
  });

  it("特訓前の絵ではランクが空でも印を出さない（特訓前のスキルはランクを使わない）", () => {
    renderSlot(state({ artUntrained: true }), {});
    expect(slot(/押し込めた想い/).textContent).not.toContain("未入力");
  });

  it("特訓していなければ印を出さない", () => {
    renderSlot(state({ trained: false, level: 50 }), {});
    expect(slot(/押し込めた想い/).textContent).not.toContain("未入力");
  });

  it("スキルの面を文字では出さない（サムネの絵が面を示す）", () => {
    renderSlot(state(), { 2: 84 });
    expect(row(/押し込めた想い/).textContent).not.toContain("特訓後スキル");
  });
});

describe("育成状態の編集（絵の切り替え 1 つでスキルも切り替わる）", () => {
  it("スキルの面を選ぶ欄は無い", () => {
    renderSlot(state(), { 2: 84 }, { open: true });
    expect(screen.queryByRole("button", { name: "特訓後" })).toBeNull();
    expect(screen.queryByRole("button", { name: "特訓前" })).toBeNull();
  });

  it("ブルフェスの絵の切り替えは、スキルも切り替わると読める（「計算に影響しない」と言わない）", () => {
    renderSlot(state(), { 2: 84 }, { open: true });
    const toggle = screen.getByRole("button", { name: "絵とスキルを特訓前と切り替える" });
    expect(toggle.getAttribute("title")).toBe("絵とスキルを特訓前と切り替えます");
  });

  it("特訓後スキルを持たないカードの絵の切り替えは、これまでどおり計算に影響しない", () => {
    renderSlot(state(), undefined, { card: plain, open: true });
    const toggle = screen.getByRole("button", { name: "絵を特訓前と切り替える" });
    expect(toggle.getAttribute("title")).toBe("絵だけ特訓前と切り替えます（計算には影響しません）");
  });

  it("特訓前の絵にしたブルフェスで特訓後の絵のランク未入力は出さない（編集パネル内）", () => {
    renderSlot(state({ artUntrained: true }), {}, { open: true });
    expect(screen.queryByText("キャラランク未入力")).toBeNull();
  });
});
