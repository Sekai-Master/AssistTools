/**
 * @vitest-environment jsdom
 *
 * ボーダー予測のページの「いま使えるツール」。時期ごとに出るリンクの先と、置き場所（予測の下・推移の上）を縛る。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TOOLS } from "../../tools";
import BorderPredictionPage from "./BorderPredictionPage";

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom には ResizeObserver が無い。推移のグラフは幅が分かってから描くので、決まった幅を返す（BorderChart.test.tsx と同じ）
class FixedWidthObserver {
  private readonly cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe() {
    this.cb([{ contentRect: { width: 360 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  globalThis.ResizeObserver = FixedWidthObserver as unknown as typeof ResizeObserver;
});
afterAll(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

const H = 3_600_000;
const HEAD = "いま使えるツール";

const RANKS = [50, 100, 200, 500, 1000, 2000].map((rank) => ({
  rank,
  current: 1_000_000 * rank,
  predicted: 2_000_000 * rank,
  low: 1_800_000 * rank,
  high: 2_200_000 * rank,
  confidence: "mid",
  visible: true,
}));

/** いまを基準に、開始と集計を何時間ずらすかで時期を作る */
function snapshot(startIn: number, aggregateIn: number, over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    event: {
      id: 223,
      name: "いつかの君へ、旋律を",
      type: "marathon",
      unit: "school_refusal",
      startAt: now + startIn * H,
      aggregateAt: now + aggregateIn * H,
      durationHours: aggregateIn - startIn,
      ...over,
    },
    checkedAt: now,
    sampleAt: now,
    progress: 0.5,
    modelVersion: null,
    predicted: true,
    ranks: RANKS,
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** current と推移だけ返す。答え合わせは 404（無い）にする */
function serve(current: unknown, history?: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/current") && current != null) return json(current);
      if (url.endsWith("/history") && history != null) return json(history);
      return new Response("", { status: 404 });
    }),
  );
}

async function show() {
  render(
    <MemoryRouter>
      <BorderPredictionPage />
    </MemoryRouter>,
  );
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await screen.findByText("しくみ");
  await vi.waitFor(() => expect(screen.queryByText("読み込み中…")).toBeNull());
}

function shelf(): HTMLElement {
  const section = screen.getByRole("heading", { name: HEAD }).closest("section");
  if (!section) throw new Error("入口の枠が無い");
  return section;
}

const hrefs = () => within(shelf()).getAllByRole("link").map((a) => a.getAttribute("href"));
const tool = (id: string) => TOOLS.find((t) => t.id === id)!;

/** 説明を添える（先頭に大きく出す）行が無い。説明は終盤のアナライザーだけ */
function expectNoLead(ids: string[]) {
  for (const id of ids) expect(within(shelf()).queryByText(tool(id).description)).toBeNull();
  expect(within(shelf()).queryByText(tool("analyzer").description)).toBeNull();
}

describe("いま使えるツール", () => {
  it("序盤（開始の直後）: 編成ビルダー・編成かんたん比較・周回プラン", async () => {
    serve(snapshot(-1, 100));
    await show();
    expect(hrefs()).toEqual(["/deck", "/compare", "/plan"]);
    // 名前は src/tools.ts のもの
    for (const id of ["deck", "compare", "plan"]) {
      expect(within(shelf()).getByRole("link", { name: new RegExp(tool(id).name) })).toBeTruthy();
    }
    expectNoLead(["deck", "compare", "plan"]);
  });

  it("中盤: 周回プラン・必要稼働時間計算・効率曲ランキング", async () => {
    serve(snapshot(-72, 72));
    await show();
    expect(hrefs()).toEqual(["/plan", "/worktime", "/ranking"]);
    expectNoLead(["plan", "worktime", "ranking"]);
  });

  it("終盤（集計の 1 時間前）: アナライザーを先頭に説明つきで、あとは周回プラン", async () => {
    serve(snapshot(-120, 1));
    await show();
    expect(hrefs()).toEqual(["/analyzer", "/plan"]);
    const lead = within(shelf()).getByRole("link", { name: new RegExp(tool("analyzer").name) });
    expect(within(lead).getByText(tool("analyzer").description)).toBeTruthy();
    // 説明を添えるのは先頭の 1 つだけ
    expect(within(shelf()).queryByText(tool("plan").description)).toBeNull();
  });

  it("リンクに計測用のクエリ文字列を付けない", async () => {
    serve(snapshot(-120, 1));
    await show();
    for (const href of hrefs()) expect(href).not.toMatch(/[?#]/);
  });

  it("終わった後は何も置かない（空の枠も出さない）", async () => {
    serve(snapshot(-120, -2));
    await show();
    expect(screen.getByText("直近のイベント（終了）")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: HEAD })).toBeNull();
  });

  it("開催中の回が無い（current が 404）ときも何も置かない", async () => {
    serve(null);
    await show();
    expect(screen.getByText(/まだ予測がありません/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: HEAD })).toBeNull();
  });

  // ★ X から来た人の着地のページ。入口の判定で例外を出すと、予測ごと見えなくなる
  it("壊れた snapshot（種別が無い・時刻が数でない）でも、入口を出さずにページは動く", async () => {
    serve(snapshot(-72, 72, { type: undefined, startAt: null, aggregateAt: "x" }));
    await show();
    expect(screen.getByText("いつかの君へ、旋律を")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: HEAD })).toBeNull();
  });

  // ★ 予測の数字を下へ押しやらない。開催中のイベントの枠の後、推移（#trend）の前に置く
  it("開催中のイベントの枠の後、推移の前に置く", async () => {
    const now = Date.now();
    serve(snapshot(-72, 72), { eventId: 223, rows: [[now - H, 0.49, RANKS.map((r) => [r.rank, r.current, r.predicted, r.low, r.high, 1])]] });
    await show();
    const current = screen.getByRole("heading", { name: "開催中のイベント" }).closest("section")!;
    const trend = await vi.waitFor(() => {
      const el = document.getElementById("trend");
      if (!el) throw new Error("推移がまだ無い");
      return el;
    });
    const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(current.contains(shelf())).toBe(false);
    expect(follows(current, shelf())).toBe(true);
    expect(follows(shelf(), trend)).toBe(true);
  });
});
