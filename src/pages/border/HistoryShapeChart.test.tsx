/**
 * @vitest-environment jsdom
 *
 * 歴代ボーダーの推移のグラフ。外した順位しか無い回を選んだとき、軸だけ・空白にならない（#189 レビュー M1）。
 * 矢印キーで点を動かすと、読み上げ用の領域に値が出る（同 M3）。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HistoryShapeChart } from "./HistoryShapeChart";
import { SHAPE_POINTS } from "./historyShape";

afterEach(cleanup);

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

const share = Array.from({ length: SHAPE_POINTS }, (_, i) => i / (SHAPE_POINTS - 1));
/** 回 → 返す順位 */
const RANKS: Record<number, number[]> = { 1: [50, 100], 2: [50] };

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", FixedWidthObserver);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = Number(/events\/(\d+)\/shape/.exec(String(url))?.[1]);
      return Response.json({ eventId: id, ranks: (RANKS[id] ?? []).map((rank) => ({ rank, final: 1_000_000 / rank, share })) });
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());

describe("歴代ボーダーの推移のグラフ", () => {
  it("外した順位しか無い回を選び直しても、その順位を出す（軸だけにしない）", async () => {
    const { rerender } = render(<HistoryShapeChart eventId={1} hours={198} />);
    await screen.findByRole("img", { name: /50位.*100位/ });
    fireEvent.click(screen.getByRole("button", { name: "50位" }));
    await screen.findByRole("img", { name: /^ボーダーの推移。100位/ });
    rerender(<HistoryShapeChart eventId={2} hours={198} />);
    const img = await screen.findByRole("img", { name: /50位 終値/ });
    expect(img.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "50位" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("記録の無い回は説明を出す", async () => {
    render(<HistoryShapeChart eventId={9} hours={198} />);
    await screen.findByText("この回は推移の記録がありません。");
  });

  it("矢印キーで動かした点の値を読み上げ用の領域に出す", async () => {
    const { container } = render(<HistoryShapeChart eventId={1} hours={198} />);
    const img = await screen.findByRole("img", { name: /50位/ });
    fireEvent.focus(img);
    fireEvent.keyDown(img, { key: "Home" });
    const live = container.querySelector('[aria-live="polite"]');
    await waitFor(() => expect(live?.textContent).toMatch(/^0時間（経過 0%）。50位 0、100位 0$/));
    fireEvent.keyDown(img, { key: "End" });
    await waitFor(() => expect(live?.textContent).toMatch(/経過 100%）。50位 2万、100位 1万/));
  });
});
