/**
 * @vitest-environment jsdom
 *
 * トップの開催中のイベント。/api/border/current の応答ごとに、出す・出さないと中身を縛る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventHero } from "./EventHero";
import { forgetCurrentBorder } from "./useCurrentBorder";

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
beforeEach(() => forgetCurrentBorder());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const H = 3_600_000;

const PREDICTED = { rank: 50, current: 69217201, predicted: 125984090, low: 110599570, high: 142971321, confidence: "mid", visible: true };
const NOT_YET = { rank: 100, current: 46585646, predicted: null, low: null, high: null, confidence: null, visible: false };

function snapshot(over: { asset?: unknown; aggregateAt?: number; ranks?: unknown[]; sampleAt?: unknown } = {}) {
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
    sampleAt: "sampleAt" in over ? over.sampleAt : now,
    progress: 0.5,
    predicted: true,
    ranks: over.ranks ?? [PREDICTED, NOT_YET],
  };
}

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
}

/** 応答を返さない（読み込み中のまま）。 */
function hang() {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
}

const show = () =>
  render(
    <MemoryRouter>
      <EventHero />
    </MemoryRouter>,
  );

/** fetch が呼ばれ、その結果が描画に反映されるまで待つ。 */
async function settle() {
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("トップの開催中のイベント", () => {
  it("ロゴ・残り時間・予測を出す", async () => {
    serve(snapshot());
    show();
    const logo = await screen.findByRole("img", { name: "第223回 いつかの君へ、旋律を" });
    expect(logo.getAttribute("src")).toBe("/CardDatas/logo/event_someday_2026.webp");
    expect(screen.getByText("集計まで")).toBeTruthy();
    // 98時間後 → 1日以上なので秒は出さない
    // 秒だけ小さくするので要素が分かれる。行全体の文字で確かめる
    expect(screen.getByText(/^4日 0[12]:\d\d$/).textContent).toMatch(/^4日 0[12]:\d\d:\d\d$/);
    expect(screen.getByText("1億2,598万")).toBeTruthy();
    expect(screen.getByText(/^予測・/)).toBeTruthy();
  });

  it("予測がまだ無い順位は、いまの値を「いま」と付けて出す", async () => {
    serve(snapshot());
    show();
    expect(await screen.findByText("100位（いま）")).toBeTruthy();
    expect(screen.getByText("4,659万")).toBeTruthy();
  });

  // ★ 予測を出していないのに「予測」と書かない（#194 のレビュー M4）
  it("どの順位にも予測が無ければ、下の行は「いまの値」", async () => {
    serve(snapshot({ ranks: [NOT_YET] }));
    show();
    expect(await screen.findByText(/^いまの値・/)).toBeTruthy();
    expect(screen.queryByText(/^予測・/)).toBeNull();
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

  // ★ 素材名が D1 にあってもファイルが無い回がある（取得の失敗は警告だけで進む）。壊れた画像を見せない
  it("ロゴが読めなければ名前に替える", async () => {
    serve(snapshot());
    show();
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("第223回 いつかの君へ、旋律を")).toBeTruthy();
  });

  it("集計を過ぎた回は「終了」で、予測でなく最後に集めた値を出す", async () => {
    serve(snapshot({ aggregateAt: Date.now() - 2 * H }));
    show();
    expect(await screen.findByText("終了")).toBeTruthy();
    expect(screen.getByText("このイベントは終わりました")).toBeTruthy();
    expect(screen.getByText(/^最後に集めた値・/)).toBeTruthy();
    expect(screen.getByText("6,922万")).toBeTruthy();
    expect(screen.queryByText("1億2,598万")).toBeNull();
    expect(screen.queryByText(/（いま）/)).toBeNull();
  });

  // ★ 形の崩れた順位1つで、トップ全体（ツールの一覧ごと）を失敗の表示にしない（#194 のレビュー M1）
  it("形の崩れた順位は捨てて、残りで出す", async () => {
    serve(snapshot({ ranks: [null, { rank: "x" }, PREDICTED] }));
    show();
    expect(await screen.findByText("1億2,598万")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("時刻が無ければ時刻の行を出さない（NaN を見せない）", async () => {
    serve(snapshot({ sampleAt: undefined }));
    const { container } = show();
    await screen.findByText("1億2,598万");
    expect(container.textContent).not.toContain("NaN");
  });

  // ★ トップでは付け足しの欄。開催中の回が無い・読めないときは欄ごと出さない
  it("404 なら何も出さない", async () => {
    serve({ error: "no data yet" }, 404);
    const { container } = show();
    await settle();
    expect(container.textContent).toBe("");
  });

  it("形の崩れた応答なら何も出さない", async () => {
    serve({ event: null, ranks: "x" });
    const { container } = show();
    await settle();
    expect(container.textContent).toBe("");
  });

  it("通信が落ちても何も出さない（例外を外に出さない）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const { container } = show();
    await settle();
    expect(container.textContent).toBe("");
  });
});

/**
 * ★ 応答を待ってから欄を差し込むと、先に出たツールの一覧が押し下げられ、ツールから戻るときは
 *   遷移の着地とスクロールの復元が欄の無い形で走って跳ぶ（#194 のレビュー H1）。
 */
describe("欄を後から差し込まない", () => {
  it("初めて開いたときは、読み込み中も同じ形の欄で場所を取る", () => {
    hang();
    show();
    expect(screen.getByRole("region", { name: "開催中のイベント（読み込み中）" })).toBeTruthy();
  });

  it("2回目からは、前に読んだ値を最初の描画から出す（応答を待たない）", async () => {
    serve(snapshot());
    show();
    await screen.findByText("1億2,598万");
    cleanup();

    hang();
    show();
    // 応答はまだ来ていないが、最初の描画で出ている
    expect(screen.getByText("1億2,598万")).toBeTruthy();
  });

  it("「開催中の回が無い」と覚えていれば、読み込み中の欄も出さない", async () => {
    serve({ error: "no data yet" }, 404);
    show();
    await settle();
    cleanup();

    hang();
    const { container } = show();
    expect(container.textContent).toBe("");
  });

  // ★ 一時的な 500/503 で欄を消さない（消すと一覧が上へ跳ねる）
  it("読み直しが 500 でも前の値を残す", async () => {
    serve(snapshot());
    show();
    await screen.findByText("1億2,598万");
    cleanup();

    serve({ error: "内部エラー" }, 500);
    show();
    await settle();
    expect(screen.getByText("1億2,598万")).toBeTruthy();
  });
});
