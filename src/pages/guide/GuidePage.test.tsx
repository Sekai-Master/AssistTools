/**
 * @vitest-environment jsdom
 *
 * 知識ガイドのページが描画でき、差し込み（図・画像）・第 9 章の説明の列・章の番号の扱いが画面に出ること。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuidePage from "./GuidePage";
import { GuideCards } from "./GuideCards";
import { CARDS } from "./lib/chapters";
import type { ShareEnv } from "./lib/cardsShare";
import { TOOLS } from "../../tools";

afterEach(cleanup);

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/start" element={<GuidePage />} />
        <Route path="/guide/cards" element={<GuidePage />} />
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

describe("初心者向けの層", () => {
  it("/guide の先頭に入口への導線とまとめ画像へのリンク", () => {
    at("/guide");
    const lead = screen.getByRole("link", { name: /はじめての方は、まずここから/ });
    expect(lead.getAttribute("href")).toBe("/guide/start");
    expect(screen.getByRole("link", { name: "まとめ画像" }).getAttribute("href")).toBe("/guide/cards");
  });

  it("/guide/start は手順ごとのカード（番号・ひとことで・画像・くわしく）とスタンプ早見表", () => {
    const { container } = at("/guide/start");
    const steps = container.querySelectorAll("section[id^=step]");
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(container.querySelector("#step1 img")?.getAttribute("src")).toBe("/guide/annotated/02-room-select.webp");
    expect([...container.querySelectorAll("#step1 a")].map((a) => a.getAttribute("href"))).toContain("/guide/3#s3-1");
    const table = container.querySelector("[data-stamps]")!;
    const stamps = table.querySelectorAll("img");
    expect(stamps.length).toBeGreaterThan(5);
    expect(stamps[0].getAttribute("src")).toMatch(/^\/guide\/stamps\/stamp\d{4}\.webp$/);
    expect(stamps[0].getAttribute("alt")).not.toMatch(/^\[/);
    expect(container.textContent).not.toMatch(/［(画像|図|スタンプ)/);
    // 広い画面は表、狭い画面はカード（表示の切り替えは CSS。両方とも同じ行数）
    const rows = table.querySelectorAll("[data-stamps-table] tbody tr").length;
    const cards = table.querySelectorAll("[data-stamps-cards] > li");
    expect(rows).toBeGreaterThan(5);
    expect(cards).toHaveLength(rows);
    expect(table.querySelector("[data-stamps-table]")!.className).toContain("hidden sm:block");
    expect(table.querySelector("[data-stamps-cards]")!.className).toContain("sm:hidden");
    expect(cards[0].querySelector("img")).not.toBeNull();
    expect(cards[0].textContent).toContain("いつ");
  });

  it("第 4 章にも同じスタンプ早見表、節の下に「ひとことで」", () => {
    const { container } = at("/guide/4");
    expect(container.querySelector("[data-stamps]")).not.toBeNull();
    expect(container.querySelector("#s4-1 + [data-summary]")).not.toBeNull();
  });

  it("用語のボタンは押すと説明と行き先が出て、もう一度押す・Escape・外を押すと閉じる。吹き出しの中を押しても閉じない", () => {
    const { container } = at("/guide/3");
    const btn = container.querySelector('article [role="button"][aria-expanded]') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("note").textContent).toContain("くわしく");
    fireEvent.click(btn);
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(btn);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(btn);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("note")).toBeNull();
    // 吹き出しの中を押す: pointerdown は中、フォーカスは吹き出しへ移る（blur の行き先が吹き出し）
    fireEvent.click(btn);
    const note = screen.getByRole("note");
    expect(note.getAttribute("tabindex")).toBe("-1");
    fireEvent.pointerDown(note);
    fireEvent.blur(btn, { relatedTarget: note });
    expect(screen.queryByRole("note")).not.toBeNull();
    // Tab で外へ出ると閉じる
    fireEvent.blur(note, { relatedTarget: document.body });
    expect(screen.queryByRole("note")).toBeNull();
    // Enter・Space でも開け閉めできる
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(btn, { key: " " });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("図は狭い画面では元の幅（440px）で出し、枠の中だけ横に送る", () => {
    const { container } = at("/guide/1");
    const scroll = container.querySelector("[data-figure-scroll]")!;
    expect(scroll.className).toContain("overflow-x-auto");
    expect(scroll.firstElementChild!.className).toContain("w-[440px]");
    expect(container.textContent).toContain("図は横に動かせます");
  });

  it("/guide/cards は縮小版の 6 枚と 1 枚ずつの保存（PNG）と、いつも出る zip のダウンロード", () => {
    const { container } = at("/guide/cards");
    const imgs = container.querySelectorAll("li img");
    expect(imgs).toHaveLength(6);
    expect(imgs[0].getAttribute("src")).toBe("/guide/cards/preview/card-1.webp");
    expect(imgs[0].getAttribute("alt")!.length).toBeGreaterThan(20);
    const saves = screen.getAllByRole("link", { name: /を保存$/ });
    expect(saves).toHaveLength(6);
    expect(saves[0].getAttribute("href")).toBe("/guide/cards/card-1.png");
    expect(saves[0].getAttribute("download")).toBe("sekaimaster-guide-card-1.png");
    const zip = screen.getByRole("link", { name: "まとめてダウンロード（zip）" });
    expect(zip.getAttribute("href")).toBe("/guide/cards/sekaimaster-guide-cards.zip");
    expect(zip.getAttribute("download")).toBe("sekaimaster-guide-cards.zip");
  });

  it("写真に保存（共有）: 指で操作して共有できる端末だけに出し、押すと共有の画面。パソコンには出さない（navigator はモック）", async () => {
    const share = vi.fn(async () => {});
    const phone: ShareEnv = {
      share,
      canShare: () => true,
      coarse: () => true,
      fetchBlob: async () => new Blob(["x"], { type: "image/png" }),
    };
    render(<MemoryRouter><GuideCards cards={CARDS} env={phone} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "写真に保存（共有）" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: "まとめてダウンロード（zip）" })).toBeTruthy();
    cleanup();

    // パソコンの Chrome・Edge: canShare は真でも、指で操作しないので出さない。zip だけ
    render(<MemoryRouter><GuideCards cards={CARDS} env={{ ...phone, share: vi.fn(), coarse: () => false }} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "写真に保存（共有）" })).toBeNull();
    expect(screen.getByRole("link", { name: "まとめてダウンロード（zip）" })).toBeTruthy();
    cleanup();

    // 共有を取り消した（AbortError）ときは何も出さない
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    render(<MemoryRouter><GuideCards cards={CARDS} env={{ ...phone, share: vi.fn(async () => Promise.reject(abort)) }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "写真に保存（共有）" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "写真に保存（共有）" })).not.toHaveProperty("disabled", true));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("画像はサイト共通のライトボックスで開く", () => {
  it("撮影は押すと同じタブの中で全面に出し、閉じると戻る（新しいタブで開かない）", () => {
    const { container } = at("/guide/3");
    expect(container.querySelector('figure a[target="_blank"]')).toBeNull();
    const btn = container.querySelector("figure button") as HTMLButtonElement;
    fireEvent.click(btn);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("img")!.getAttribute("src")).toMatch(/^\/guide\/.+\.webp$/);
    expect(dialog.textContent).toContain("画像1 協力ライブのルームを選ぶ画面");
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("番号の囲みを描いた撮影（入口のページ）も同じ部品で開く", () => {
    const { container } = at("/guide/start");
    fireEvent.click(container.querySelector("#step1 figure button") as HTMLButtonElement);
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("src")).toBe("/guide/annotated/02-room-select.webp");
  });

  it("まとめ画像は一覧も全面表示も縮小版の WebP（PNG は原寸にすると大きすぎる）。保存のリンクは PNG のまま", () => {
    const { container } = at("/guide/cards");
    const first = container.querySelector("li button") as HTMLButtonElement;
    expect(first.querySelector("img")!.getAttribute("src")).toBe("/guide/cards/preview/card-1.webp");
    fireEvent.click(first);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("img")!.getAttribute("src")).toBe("/guide/cards/preview/card-1.webp");
    expect(dialog.textContent).toContain("1. はじめての周回の流れ");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("link", { name: /を保存$/ })[0].getAttribute("href")).toBe("/guide/cards/card-1.png");
  });
});
