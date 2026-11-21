/**
 * @vitest-environment jsdom
 *
 * 焚き数の入力の下限（2026-11-21 Nori 指摘）。
 *
 * ★ オートは 0 焚きで回せない（下限 1）。ひとりで・みんなでの 0 焚きはゲームで可能なので、既定の下限は 0 のまま。
 * ★ 焚き数の値はモード間で共有している画面がある（効率曲ランキング・編成かんたん比較）。ほかのタブで 0 にした値が
 *   下限 1 の欄に渡ってきても、1 と出し、＋で 2 に上がる（0 から数えて 1 のまま見た目が動かない、にしない）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TakiInput } from "./TakiInput";

afterEach(cleanup);

const input = () => screen.getByLabelText("焚き数") as HTMLInputElement;
const buttons = () => [...input().parentElement!.querySelectorAll("button")];
const minus = () => buttons()[0];
const plus = () => buttons()[1];

describe("TakiInput の下限", () => {
  it("既定（下限 0）は 0 を受け付ける（ひとりで・みんなでの 0 焚き）", () => {
    const onChange = vi.fn();
    render(<TakiInput value={1} onChange={onChange} />);
    expect(minus().disabled).toBe(false);
    fireEvent.change(input(), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("下限 1 なら、1 から下げるボタンは押せず、0 を打っても 1 を返す", () => {
    const onChange = vi.fn();
    render(<TakiInput value={1} min={1} onChange={onChange} />);
    expect(minus().disabled).toBe(true);
    fireEvent.change(input(), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  // ★ 画面の確かめ（幅 390・Playwright）で見つけた。消した瞬間に 1 を入れると、続けて打った字が後ろに付き、
  //   スマホで「5 を消して 3 を打つ」と 13 → 10 焚きになっていた。
  it("下限 1 の欄を消すと空のまま次の字を待ち、続けて 3 を打つと 3（13 → 10 にならない）。打たずに離れると元の値に戻る", () => {
    const onChange = vi.fn();
    render(<TakiInput value={5} min={1} onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "" } });
    expect(input().value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.blur(input());
    expect(input().value).toBe("5");
  });

  it("下限 0 の欄は今までどおり、消すと 0", () => {
    const onChange = vi.fn();
    render(<TakiInput value={5} onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("下限 1 に 0 が渡ってきても（ほかのタブで 0 にした値）、1 と出し、＋で 2 に上がる", () => {
    const onChange = vi.fn();
    render(<TakiInput value={0} min={1} onChange={onChange} />);
    expect(input().value).toBe("1");
    expect(minus().disabled).toBe(true);
    fireEvent.click(plus());
    expect(onChange).toHaveBeenLastCalledWith(2);
  });
});
