/**
 * @vitest-environment jsdom
 *
 * 推移のグラフの描き方。2026-10-01 の本番（219 の最初の予測）で見つけた2つの不具合を縛る。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BorderCharts } from "./BorderChart";
import type { HistoryPoint } from "./chartData";

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
afterEach(cleanup);

// jsdom には ResizeObserver が無い。グラフは幅が分かってから描くので、決まった幅を返す
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
beforeAll(() => vi.stubGlobal("ResizeObserver", FixedWidthObserver));
afterAll(() => vi.unstubAllGlobals());

const H = 3_600_000;
const START = Date.UTC(2026, 8, 30, 6, 0); // 9/30 15:00 JST・246時間
const END = START + 246 * H;

/** h 時間目の点。pred は [予測, 下限, 上限]（出していなければ省く） */
const pt = (h: number, current: number, pred?: readonly [number, number, number]): HistoryPoint => ({
  t: START + h * H,
  progress: h / 246,
  current,
  predicted: pred ? pred[0] : null,
  low: pred ? pred[1] : null,
  high: pred ? pred[2] : null,
});

// 2026-10-01 01:03 の 50位（経過4%で予測を出し始めた最初の点）
const FIRST_SHOWN = [99_057_420, 78_766_366, 122_904_418] as const;

const draw = (points: HistoryPoint[]) =>
  render(<BorderCharts history={new Map([[50, points]])} ranks={[50]} startAt={START} endAt={END} />).container;

describe("推移のグラフ", () => {
  // ★ 予測を出し始めた最初の30分は点が1つで、線も帯も長さ・面積が0になり何も見えなかった
  it("予測を出した点が1つだけでも、予測の点と幅を描く", () => {
    const c = draw([pt(9.5, 6_265_260), pt(10, 6_273_821, FIRST_SHOWN)]);
    expect(c.querySelectorAll('[data-mark="pred-single"]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-mark="pred-line"]')).toHaveLength(0);
  });

  it("2点以上続けば破線と帯で描き、1点ぶんの描き方にはしない", () => {
    const c = draw([pt(10, 6_273_821, FIRST_SHOWN), pt(10.5, 6_500_000, [98_000_000, 79_000_000, 121_000_000])]);
    expect(c.querySelectorAll('[data-mark="pred-line"]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-mark="pred-single"]')).toHaveLength(0);
  });

  // ★ 2点目が入っても、帯は30分ぶんの細い筋で破線もごく短く、予測がほとんど見えなかった
  it("最新の予測には終わりに点を打つ。途中で途切れた前の区間には打たない", () => {
    const c = draw([
      pt(10, 6_273_821, FIRST_SHOWN),
      pt(10.5, 6_500_000, FIRST_SHOWN),
      pt(11, 6_700_000),
      pt(11.5, 6_900_000, FIRST_SHOWN),
      pt(12, 7_100_000, FIRST_SHOWN),
    ]);
    expect(c.querySelectorAll('[data-mark="pred-line"]')).toHaveLength(2);
    const ends = c.querySelectorAll('[data-mark="pred-end"]');
    expect(ends).toHaveLength(1);
    expect(ends[0].closest('[data-mark="pred-line"]')).toBe(c.querySelectorAll('[data-mark="pred-line"]')[1]);
  });

  it("最新の予測が1点だけなら、その点の描き方で足りる（終わりの点を重ねない）", () => {
    const c = draw([pt(10, 6_273_821, FIRST_SHOWN), pt(10.5, 6_500_000, FIRST_SHOWN), pt(11, 6_700_000), pt(11.5, 6_900_000, FIRST_SHOWN)]);
    expect(c.querySelectorAll('[data-mark="pred-single"]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-mark="pred-end"]')).toHaveLength(0);
  });

  // ★ 「1億5,000万」が左の余白からはみ出し、頭の「1億」が切れて「5,000万」が2つ並んで見えた
  it("縦軸の目盛りは、1億以上を「1.5億」と短く書く", () => {
    const c = draw([pt(10, 6_273_821, FIRST_SHOWN)]);
    const labels = [...c.querySelectorAll("svg text")].map((e) => e.textContent);
    expect(labels).toContain("1.5億");
    expect(labels).not.toContain("1億5,000万");
  });
});
