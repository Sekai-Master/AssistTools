/**
 * @vitest-environment jsdom
 *
 * 編成ビルダーの「編成を比べる」の焚き数（2026-11-21 Nori 指摘）。
 *
 * ★ オートは 0 焚きができない（下限 1）。焚き数はライブ種別の間で共有なので、みんなで・ひとりでで 0 にしてから
 *   オートへ切り替えても、オートでは 1 として出す。みんなで・ひとりでの 0 焚きはゲームで可能なので変えない。
 * ★ 見たいのは焚き数の欄だけなので、編成の評価（カードのデータが要る）は作り物にする。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComparePanel } from "./ComparePanel";
import type { EvalContext } from "./lib/evaluate";

vi.mock("./lib/evaluate", () => ({
  evaluateDeck: () => ({ cards: [], bonus: null, power: { total: 0 }, skill: { leader: 0, total: 0 } }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const draw = () =>
  render(
    <MemoryRouter>
      <ComparePanel
        decks={[]}
        current={{ cardIds: [null, null, null, null, null], leaderIndex: 0, supportBonus: 0 }}
        ctx={{ eventId: undefined } as EvalContext}
        music={{ entries: [], loading: false, error: null }}
      />
    </MemoryRouter>,
  );

const radio = (name: string) => screen.getByRole("radio", { name });
const takiInput = () => screen.getByLabelText("焚き数") as HTMLInputElement;

describe("オートの焚き数は 1 から", () => {
  it("みんなでで 0 にしてからオートへ切り替えると 1 と出して下げられず、みんなでに戻すと 0 のまま", () => {
    draw();
    fireEvent.change(takiInput(), { target: { value: "0" } });
    expect(takiInput().value).toBe("0");
    fireEvent.click(radio("オート"));
    expect(takiInput().value).toBe("1");
    expect(takiInput().parentElement!.querySelector("button")!.disabled).toBe(true);
    fireEvent.click(radio("みんなで"));
    expect(takiInput().value).toBe("0");
  });
});
