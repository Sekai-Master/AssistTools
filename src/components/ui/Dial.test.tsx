/**
 * @vitest-environment jsdom
 *
 * ダイヤル（「次の回復まで」0〜30分、2026-11-24）。
 * ★ 縛ること
 *   - 土台はネイティブの range。キーボード（矢印・Home/End）と読み上げは range がそのまま受ける（role・範囲・読み上げの文）
 *   - 指・マウスで外側の輪を押すと、その向きの値になる。回すと追い、最大を越えて回し込んでも最小へ飛ばない
 *   - 未設定（null）は fallback の位置に出し、数字を薄くする
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dial } from "./Dial";

afterEach(cleanup);

function Harness({ initial = null as number | null, onChange = (() => {}) as (v: number) => void }) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <>
      <label htmlFor="d">次の回復まで</label>
      <Dial
        id="d"
        value={v}
        fallback={30}
        max={30}
        unit="分"
        valueText={v == null ? "未設定（30分で計算）" : `${v}分`}
        onChange={(n) => {
          setV(n);
          onChange(n);
        }}
      />
    </>
  );
}

const slider = () => screen.getByRole("slider", { name: "次の回復まで" }) as HTMLInputElement;
const ring = () => document.querySelector("circle[style*='stroke']") as SVGCircleElement;
const number = () => screen.getByText(/^\d+$/);

/** 176px の円の中心からの向き deg（真上 0°・時計回り）に、半径 r の点を押す・動かす。 */
const point = (deg: number, r = 70) => {
  const a = (deg * Math.PI) / 180;
  return { clientX: 88 + r * Math.sin(a), clientY: 88 - r * Math.cos(a), button: 0, pointerId: 1 };
};
const placeSvg = () =>
  vi
    .spyOn(SVGSVGElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ left: 0, top: 0, width: 176, height: 176, right: 176, bottom: 176, x: 0, y: 0, toJSON: () => ({}) });

describe("キーボード・読み上げ（ネイティブの range）", () => {
  it("ラベルで引ける slider で、範囲は 0〜30・1 刻み", () => {
    render(<Harness initial={12} />);
    const s = slider();
    expect(s.type).toBe("range");
    expect(s.min).toBe("0");
    expect(s.max).toBe("30");
    expect(s.step).toBe("1");
    expect(s.value).toBe("12");
    expect(s.getAttribute("aria-valuetext")).toBe("12分");
  });

  it("range の値が変わると（矢印キー・読み上げの調整）、値と数字と読み上げの文が変わる", () => {
    const onChange = vi.fn();
    render(<Harness initial={12} onChange={onChange} />);
    fireEvent.change(slider(), { target: { value: "13" } });
    expect(onChange).toHaveBeenLastCalledWith(13);
    expect(number().textContent).toBe("13");
    expect(slider().getAttribute("aria-valuetext")).toBe("13分");
  });

  it("未設定は 30 の位置に薄い数字で出し、読み上げは未設定と言う", () => {
    render(<Harness />);
    expect(slider().value).toBe("30");
    expect(slider().getAttribute("aria-valuetext")).toBe("未設定（30分で計算）");
    expect(number().textContent).toBe("30");
    expect(number().className).toContain("text-slate-400");
    fireEvent.change(slider(), { target: { value: "29" } });
    expect(number().className).toContain("text-slate-700");
  });
});

describe("指・マウス", () => {
  it("輪を押すとその向きの値（真上は 15、右下の端は 30）", () => {
    const spy = placeSvg();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.pointerDown(ring(), point(0));
    expect(onChange).toHaveBeenLastCalledWith(15);
    fireEvent.pointerUp(ring(), point(0));
    fireEvent.pointerDown(ring(), point(-30));
    expect(onChange).toHaveBeenLastCalledWith(12);
    expect(slider().value).toBe("12");
    spy.mockRestore();
  });

  it("押したまま回すと追い、30 を越えて切れ目の向こうへ回し込んでも 0 へ飛ばない", () => {
    const spy = placeSvg();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.pointerDown(ring(), point(100));
    fireEvent.pointerMove(ring(), point(140));
    expect(onChange).toHaveBeenLastCalledWith(29);
    fireEvent.pointerMove(ring(), point(170)); // 切れ目
    fireEvent.pointerMove(ring(), point(-145)); // 切れ目の向こう（0 の側）
    expect(slider().value).toBe("30");
    fireEvent.pointerUp(ring(), point(-145));
    // 離したあとは動かしても変わらない
    fireEvent.pointerMove(ring(), point(0));
    expect(slider().value).toBe("30");
    spy.mockRestore();
  });

  // ★ 検分 #279 M: 前は「1 回で半周より大きく動いたら端へ」だったので、中心のそばを横切る・素早く振ると 0 や 30 に化けた
  it("中心のそばを横切っても、端（0・30）に化けず前の値のまま", () => {
    const spy = placeSvg();
    render(<Harness />);
    fireEvent.pointerDown(ring(), point(50)); // 20
    expect(slider().value).toBe("20");
    fireEvent.pointerMove(ring(), point(50, 30)); // 中心へ寄る
    fireEvent.pointerMove(ring(), point(-130, 25)); // 中心の向こう
    fireEvent.pointerMove(ring(), point(-130)); // 反対側の輪（2 分の向き）
    expect(slider().value).toBe("20");
    fireEvent.pointerMove(ring(), point(-120));
    expect(slider().value).toBe("20");
    // 指が値の所（20 = 50°）へ戻ってくると、また追う
    fireEvent.pointerMove(ring(), point(-60));
    fireEvent.pointerMove(ring(), point(0));
    fireEvent.pointerMove(ring(), point(48));
    fireEvent.pointerMove(ring(), point(60));
    expect(slider().value).toBe("21");
    spy.mockRestore();
  });

  it.each([
    { from: 10, to: -170, start: "16" },
    { from: -10, to: 175, start: "14" },
    { from: 0, to: 130, start: "15" },
  ])("素早く振って向きが $from° → $to° と跳んでも、値は $start のまま", ({ from, to, start }) => {
    const spy = placeSvg();
    render(<Harness />);
    fireEvent.pointerDown(ring(), point(from));
    expect(slider().value).toBe(start);
    fireEvent.pointerMove(ring(), point(to));
    expect(slider().value).toBe(start);
    spy.mockRestore();
  });

  // ★ 検分 #279 L: 捕まえられない環境で輪の外で離すと、回している途中のままになり、ボタンを押さずに輪の上を動かすだけで値が変わった
  it("輪の外（ページのどこか）で離したら、その後に輪の上を動かしても変わらない", () => {
    const spy = placeSvg();
    render(<Harness />);
    fireEvent.pointerDown(ring(), point(0));
    expect(slider().value).toBe("15");
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.pointerMove(ring(), point(30));
    expect(slider().value).toBe("15");
    spy.mockRestore();
  });

  it("中心の近くは拾わない（向きが定まらない）", () => {
    const spy = placeSvg();
    const onChange = vi.fn();
    render(<Harness initial={20} onChange={onChange} />);
    fireEvent.pointerDown(ring(), point(-90, 10));
    expect(onChange).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
