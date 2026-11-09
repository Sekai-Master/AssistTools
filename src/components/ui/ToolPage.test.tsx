/**
 * @vitest-environment jsdom
 *
 * ツールのページの幅（docs/design-system.md 1 節の幅の表）。
 * ★ 「画面いっぱい」（full）は BINGO のまとめて遊ぶだけの例外。既定がずれると、ほかの全部のページの幅が変わる
 *   （検分 M1 低-4: 既定を full にしても、前は 1 件も落ちなかった）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ToolPage } from "./ToolPage";

afterEach(cleanup);

/** いちばん外の箱のクラス（1 つずつ。sm:max-w-3xl などに部分一致で通らないように）。 */
const classesOf = (container: HTMLElement) => (container.firstElementChild as HTMLElement).className.split(/\s+/);

describe("ツールのページの幅", () => {
  it("既定は max-w-3xl（768px）。広い幅・画面いっぱいにはしない", () => {
    const box = classesOf(render(<ToolPage title="プラン">中身</ToolPage>).container);
    expect(box).toContain("max-w-3xl");
    expect(box).not.toContain("max-w-6xl");
    expect(box).not.toContain("max-w-none");
  });

  it("wide は max-w-6xl、full は max-w-none（100vw は使わない）", () => {
    const wide = classesOf(render(<ToolPage title="ランキング" wide>中身</ToolPage>).container);
    expect(wide).toContain("max-w-6xl");
    expect(wide).not.toContain("max-w-3xl");
    cleanup();
    const full = classesOf(render(<ToolPage title="BINGO" full>中身</ToolPage>).container);
    expect(full).toContain("max-w-none");
    expect(full.some((c) => c.includes("100vw"))).toBe(false);
  });
});
