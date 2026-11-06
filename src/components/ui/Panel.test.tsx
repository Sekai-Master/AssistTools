/**
 * @vitest-environment jsdom
 *
 * 枠の見出しと内側の余白（docs/design-system.md の 2 節・3 節）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Panel } from "./Panel";

afterEach(cleanup);

describe("枠", () => {
  // ★ 14px の灰色だった見出しは、中の項目のラベルより弱く見えた
  it("見出しは 16px・太字で、灰色にしない", () => {
    render(<Panel title="設定">中身</Panel>);
    const head = screen.getByRole("heading", { name: "設定" });
    expect(head.className).toContain("text-base");
    expect(head.className).toContain("font-bold");
    expect(head.className).toContain("text-slate-700");
    expect(head.className).not.toContain("text-slate-500");
  });

  it("内側の余白はスマホ 16px・PC 24px", () => {
    const { container } = render(<Panel>中身</Panel>);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain("p-4");
    expect(panel.className).toContain("sm:p-6");
  });

  it("見出しが無ければ見出しを出さない", () => {
    render(<Panel>中身</Panel>);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
