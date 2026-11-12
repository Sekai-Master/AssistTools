/**
 * @vitest-environment jsdom
 *
 * 知識ガイドのページが描画でき、差し込み（図・画像）・第 9 章の説明の列・章の番号の扱いが画面に出ること。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuidePage from "./GuidePage";
import { TOOLS } from "../../tools";

afterEach(cleanup);

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/:n" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("知識ガイドのページ", () => {
  it("/guide は前置き（印の表）と、第 1 章からの目次", () => {
    const { container } = at("/guide");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("知識ガイド");
    expect(container.textContent).toContain("本文の印");
    const toc = screen.getByRole("navigation", { name: "章の一覧" });
    const links = [...toc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/guide/1");
    expect(links).toContain("/guide/9");
    expect(links).toContain("/guide/3#s3-2");
    expect(links).not.toContain("/guide/0");
  });

  it("章のページは図を SVG のまま埋め込み、画像は lazy・寸法つき", () => {
    const { container } = at("/guide/3");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^第3章 /);
    expect(container.querySelector("figure svg")).not.toBeNull();
    const img = container.querySelector("figure img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("1600");
    expect(img.getAttribute("height")).toBe("1112");
    expect(img.getAttribute("src")).toMatch(/^\/guide\/.+\.webp$/);
    expect(container.querySelector("#s3-2")).not.toBeNull();
    expect(container.textContent).not.toMatch(/［(図|画像)/);
  });

  it("確かさの印は文字を残した部品になる", () => {
    const { container } = at("/guide/1");
    const marks = container.querySelectorAll("[data-mark]");
    expect(marks.length).toBeGreaterThan(0);
    expect([...marks].every((m) => m.textContent && m.textContent.length > 0)).toBe(true);
    expect(container.querySelector('[data-mark="unknown"]')).toBeNull();
  });

  it("第 9 章の表に tools.ts の説明が出る", () => {
    const { container } = at("/guide/9");
    expect(screen.getByRole("columnheader", { name: "説明" })).toBeTruthy();
    expect(container.textContent).toContain(TOOLS.find((t) => t.path === "/lap")!.description);
    // 自サイトのリンクはサイトの中の移動（新しいタブで開かない）
    const deck = [...container.querySelectorAll("a")].find((a) => a.textContent === "編成ビルダー")!;
    expect(deck.getAttribute("href")).toBe("/deck");
    expect(deck.getAttribute("target")).toBeNull();
  });

  it("/guide/0 は目次へ送り、無い章は「見つかりません」", () => {
    at("/guide/0");
    expect(screen.getByRole("navigation", { name: "章の一覧" })).toBeTruthy();
    cleanup();
    at("/guide/10");
    expect(screen.getByText("その章は見つかりませんでした。")).toBeTruthy();
  });
});
