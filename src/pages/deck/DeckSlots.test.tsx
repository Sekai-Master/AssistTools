/**
 * @vitest-environment jsdom
 *
 * 編成の枠の 1 行表示。
 *
 * ★ ブルフェスの特訓後の面でキャラクターランクが空だと、スキルは +0 で計算される。
 *   編集パネルを開かない人（合計だけ見る人）にも見えるよう、1 行表示にも印を出す。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeckSlots } from "./DeckSlots";
import type { CatalogCard } from "./lib/deckInputs";
import type { CardState } from "./lib/deckStore";

afterEach(cleanup);

const bloom: CatalogCard = {
  id: 949,
  ch: 17,
  rarity: "4",
  attr: "cute",
  skillId: 23,
  stSkillId: 22,
  name: "思い出を取り戻して",
  trained: [400, 400, 400],
  power: [Array(60).fill(1000), Array(60).fill(1000), Array(60).fill(1000)],
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

const renderSlot = (s: CardState, characterRanks?: Record<number, number>) =>
  render(
    <DeckSlots
      slots={[bloom, null, null, null, null]}
      states={{ 949: s }}
      leaderIndex={0}
      openIndex={null}
      onPick={() => {}}
      onClear={() => {}}
      onLeader={() => {}}
      onToggleOpen={() => {}}
      onStateChange={() => {}}
      characterRanks={characterRanks}
    />
  );

describe("枠の 1 行表示（特訓後スキルのキャラランク未入力）", () => {
  it("特訓後の面でランクが空なら、閉じた枠にも印を出す", () => {
    renderSlot(state({ skillSide: "trained" }), {});
    const row = screen.getByRole("button", { name: /思い出を取り戻して/ });
    expect(row.textContent).toContain("特訓後スキル");
    expect(row.textContent).toContain("キャラランク未入力");
  });

  it("ランクが入っていれば印を出さない", () => {
    renderSlot(state({ skillSide: "trained" }), { 17: 60 });
    const row = screen.getByRole("button", { name: /思い出を取り戻して/ });
    expect(row.textContent).toContain("特訓後スキル");
    expect(row.textContent).not.toContain("未入力");
  });

  it("特訓前の面ではランクが空でも印を出さない（特訓前のスキルはランクを使わない）", () => {
    renderSlot(state(), {});
    const row = screen.getByRole("button", { name: /思い出を取り戻して/ });
    expect(row.textContent).not.toContain("特訓後スキル");
    expect(row.textContent).not.toContain("未入力");
  });
});
