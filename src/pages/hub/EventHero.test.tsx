/**
 * @vitest-environment jsdom
 *
 * トップの開催中のイベント。/api/border/current の応答ごとに、出す・出さないと中身を縛る。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventHero } from "./EventHero";

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const H = 3_600_000;

function snapshot(over: { asset?: unknown; aggregateAt?: number; ranks?: unknown[] } = {}) {
  const now = Date.now();
  return {
    event: {
      id: 223,
      name: "いつかの君へ、旋律を",
      type: "marathon",
      unit: "school_refusal",
      startAt: now - 100 * H,
      aggregateAt: over.aggregateAt ?? now + 98 * H,
      durationHours: 198,
      asset: "asset" in over ? over.asset : "event_someday_2026",
    },
    checkedAt: now,
    sampleAt: now,
    progress: 0.5,
    predicted: true,
    ranks: over.ranks ?? [
      { rank: 50, current: 69217201, predicted: 125984090, low: 110599570, high: 142971321, confidence: "mid", visible: true },
      { rank: 100, current: 46585646, predicted: null, low: null, high: null, confidence: null, visible: false },
    ],
  };
}

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
}

const show = () =>
  render(
    <MemoryRouter>
      <EventHero />
    </MemoryRouter>,
  );

describe("トップの開催中のイベント", () => {
  it("ロゴ・残り時間・予測を出す", async () => {
    serve(snapshot());
    show();
    const logo = await screen.findByRole("img", { name: "第223回 いつかの君へ、旋律を" });
    expect(logo.getAttribute("src")).toBe("/CardDatas/logo/event_someday_2026.webp");
    expect(screen.getByText("集計まで")).toBeTruthy();
    // 98時間後 → 1日以上なので秒は出さない
    expect(screen.getByText(/^4日 0[12]:\d\d$/)).toBeTruthy();
    expect(screen.getByText("1億2,598万")).toBeTruthy();
  });

  it("予測がまだ無い順位は、いまの値を「いま」と付けて出す", async () => {
    serve(snapshot());
    show();
    expect(await screen.findByText("100位（いま）")).toBeTruthy();
    expect(screen.getByText("4,659万")).toBeTruthy();
  });

  it("各順位はボーダー予測のページへのリンク", async () => {
    serve(snapshot());
    show();
    await screen.findByText("1億2,598万");
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
    for (const a of links) expect(a.getAttribute("href")).toBe("/border");
  });

  // ★ API は D1 の値を検査せずに返す。おかしな素材名は URL に組まず、名前の文字で出す
  it("素材名が無い・おかしいときはロゴの代わりに名前", async () => {
    serve(snapshot({ asset: "../x" }));
    show();
    expect(await screen.findByText("第223回 いつかの君へ、旋律を")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("集計を過ぎた回は「終了」", async () => {
    serve(snapshot({ aggregateAt: Date.now() - 2 * H }));
    show();
    expect(await screen.findByText("終了")).toBeTruthy();
    expect(screen.getByText("このイベントは終わりました")).toBeTruthy();
  });

  // ★ トップでは付け足しの欄。開催中の回が無い・読めないときは欄ごと出さない
  it("404 なら何も出さない", async () => {
    serve({ error: "no data yet" }, 404);
    const { container } = show();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });

  it("形の崩れた応答なら何も出さない", async () => {
    serve({ event: null, ranks: "x" });
    const { container } = show();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });

  it("通信が落ちても何も出さない（例外を外に出さない）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const { container } = show();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });
});
