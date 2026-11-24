/**
 * @vitest-environment jsdom
 *
 * ドラム式のピッカーの、指・なめらかなスクロールとの付き合い方（検分 #286 M）。
 * ★ 縛ること
 *   - 指で回している途中（慣性を含む）とスクロールから値を入れた直後は、値からドラムを scrollTo で動かさない
 *     （慣性を奪って行き来する。iOS Safari）。回し終わった後のキーボードの操作では、また動かす
 *   - なめらかに回している途中で止まっても、回し終わりの待ち（150ms）で行き先を捨て、値の段へ置き直す。
 *     その後の指の回転はそのまま値になる
 * jsdom には scrollTo が無いので偽物を置く（呼ばれたことだけを記録し、位置は動かさない＝なめらかに回っている途中のまま）。
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WHEEL_ROW, WheelPicker } from "./WheelPicker";

const ROW = WHEEL_ROW;
const scrollTo = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  scrollTo.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: scrollTo, configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
});

/** onChange のたびに、慣性でさらに momentum 段ぶん回った（effect が走る前に位置が先へ進んだ）ことにする。 */
function Harness({ initial = null as number | null, momentum = 0 }) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <>
      <label htmlFor="w">次の回復まで</label>
      <WheelPicker
        id="w"
        value={v}
        fallback={30}
        max={30}
        unit="分"
        valueText={`${v ?? 30}分`}
        onChange={(n) => {
          const el = document.querySelector<HTMLElement>("[data-value]")!.parentElement!;
          el.scrollTop += momentum * ROW;
          setV(n);
        }}
      />
    </>
  );
}

const slider = () => screen.getByRole("slider", { name: "次の回復まで" }) as HTMLInputElement;
const scroller = () => document.querySelector<HTMLElement>("[data-value]")!.parentElement!;
const scrollTo_ = (rows: number) => {
  scroller().scrollTop = rows * ROW;
  fireEvent.scroll(scroller());
};
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("指で回している途中は、値からドラムを引き戻さない", () => {
  it("慣性で先へ進んでいても scrollTo を呼ばず、指の位置の段が値になっていく", () => {
    render(<Harness momentum={1.4} />);
    fireEvent.touchStart(scroller());
    fireEvent.touchEnd(scroller());
    scrollTo_(20.2); // 20 を入れた直後に、慣性で 21.6 段へ進む
    expect(slider().value).toBe("20");
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.scroll(scroller()); // いま 21.6 段 → 22
    expect(slider().value).toBe("22");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("触れていなくても、スクロールから入れた値ではドラムを動かさない", () => {
    render(<Harness momentum={1.4} />);
    scrollTo_(10.1);
    expect(slider().value).toBe("10");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("回し終わった後（150ms）のキーボードの操作では、ドラムをなめらかに動かす", () => {
    render(<Harness />);
    fireEvent.touchStart(scroller());
    scrollTo_(12);
    fireEvent.touchEnd(scroller());
    wait(200);
    fireEvent.change(slider(), { target: { value: "5" } });
    expect(scrollTo).toHaveBeenCalledWith({ top: 5 * ROW, behavior: "smooth" });
  });

  it("触れただけで回さなかったときも、指の印は下りる（その後のキーボードで動く）", () => {
    render(<Harness />);
    fireEvent.touchStart(scroller());
    fireEvent.touchEnd(scroller());
    wait(200);
    fireEvent.change(slider(), { target: { value: "7" } });
    expect(scrollTo).toHaveBeenCalledWith({ top: 7 * ROW, behavior: "smooth" });
  });
});

describe("なめらかに回している途中で止まったとき", () => {
  it("回し終わりの待ちで行き先を捨て、値の段へ置き直す。その後の指の回転は値になる", () => {
    render(<Harness />);
    fireEvent.change(slider(), { target: { value: "10" } });
    expect(scrollTo).toHaveBeenCalledWith({ top: 10 * ROW, behavior: "smooth" });
    // 30 段から 10 段へ向かう途中の 20 段で止まった
    scrollTo_(20);
    expect(slider().value).toBe("10");
    wait(200);
    expect(scroller().scrollTop).toBe(10 * ROW);
    // 行き先が残っていると、ここが無視されて 10 のままだった
    fireEvent.touchStart(scroller());
    scrollTo_(5);
    expect(slider().value).toBe("5");
  });

  it("指で触れずに（ホイールの後など）回しても、行き先が残らない", () => {
    render(<Harness />);
    fireEvent.change(slider(), { target: { value: "10" } });
    scrollTo_(25);
    wait(200);
    scrollTo_(4);
    expect(slider().value).toBe("4");
  });
});
