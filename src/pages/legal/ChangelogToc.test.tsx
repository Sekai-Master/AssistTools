/**
 * @vitest-environment jsdom
 *
 * 更新履歴の版の目次。広い画面は横の余白に付いてくる目次、狭い画面はページの上に畳んだ一覧。
 * 目次の項目と版の枠のアンカーが食い違うと、押しても飛ばない目次になるので、全版で照合する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChangelogPage from "./ChangelogPage";
import { parseChangelog } from "./changelogParser";
import changelogMarkdown from "../../../CHANGELOG.md?raw";

const RELEASES = parseChangelog(changelogMarkdown);

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  // jsdom には scrollIntoView が無い
  Element.prototype.scrollIntoView = scrollIntoView;
  window.history.replaceState(null, "", "/changelog");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/changelog"]}>
      <ChangelogPage />
    </MemoryRouter>,
  );

/** 広い画面の目次（横の余白）。 */
const sideToc = () => screen.getByRole("navigation", { name: "版の目次" });
/** 狭い画面の畳んだ一覧の開け閉めボタン。 */
const foldButton = () => screen.getByRole("button", { name: /版の目次/ });

describe("更新履歴の版の目次", () => {
  it("版の枠ごとにアンカー（id）があり、ヘッダーに隠れないよう上に余白を取る", () => {
    renderPage();
    for (const r of RELEASES) {
      const article = document.getElementById(`v${r.version}`);
      expect(article, `v${r.version} のアンカー`).not.toBeNull();
      expect(article!.tagName).toBe("ARTICLE");
      expect(article!.className.split(" "), `v${r.version} の scroll-mt`).toContain("scroll-mt-20");
    }
  });

  it("横の目次は、全版を新しい順に並べ、各項目の飛び先が版の枠のアンカーと一致する", () => {
    renderPage();
    const links = within(sideToc()).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(RELEASES.map((r) => `#v${r.version}`));
    for (const [i, a] of links.entries()) {
      // 版の番号と日付が分かる短い表示
      expect(a.textContent).toContain(`v${RELEASES[i].version}`);
      expect(a.textContent).toContain(RELEASES[i].date);
      expect(document.getElementById(a.getAttribute("href")!.slice(1))).not.toBeNull();
    }
  });

  it("狭い画面の一覧は既定で閉じ、押すと開いて全版が出て、もう一度押すと閉じる", () => {
    renderPage();
    const button = foldButton();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const listId = button.getAttribute("aria-controls")!;
    expect(document.getElementById(listId)).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const list = document.getElementById(listId)!;
    expect(within(list).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(
      RELEASES.map((r) => `#v${r.version}`),
    );

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(listId)).toBeNull();
  });

  it("目次の項目を押すと、その版へ飛び、URL に #v〜 を残し、版の見出しにフォーカスを移す（履歴は積まない）", () => {
    renderPage();
    const target = RELEASES[RELEASES.length - 1];
    const link = within(sideToc()).getByRole("link", { name: new RegExp(`v${target.version.replace(/\./g, "\\.")}`) });
    const historyLength = window.history.length;
    const click = fireEvent.click(link);
    // 既定の hash の移動は止め、自分で飛ぶ（なめらかに動かし、見出しにフォーカスを移すため）
    expect(click).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById(`v${target.version}`));
    expect(window.location.hash).toBe(`#v${target.version}`);
    // replaceState なので履歴は増えない
    expect(window.history.length).toBe(historyLength);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: `v${target.version}`, level: 2 }));
  });

  it("いま読んでいる版（ヘッダーの下を過ぎた最後の版）に印を付ける", async () => {
    renderPage();
    // 3 つ目の版までが上に過ぎ、4 つ目からは下にある、という配置にする
    const tops = new Map(RELEASES.map((r, i) => [`v${r.version}`, i < 3 ? -500 + i * 100 : 400 + i * 300]));
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const top = tops.get(this.id) ?? 0;
      return { top, bottom: top + 200, left: 0, right: 0, width: 0, height: 200, x: 0, y: top, toJSON() {} } as DOMRect;
    });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    // rAF で間引いているので、次のフレームの測り直しと再描画を待つ
    await waitFor(() => {
      const current = within(sideToc()).getAllByRole("link").filter((a) => a.getAttribute("aria-current"));
      expect(current.map((a) => a.getAttribute("href"))).toEqual([`#v${RELEASES[2].version}`]);
    });
    expect(within(sideToc()).getByRole("link", { current: "location" }).getAttribute("href")).toBe(
      `#v${RELEASES[2].version}`,
    );
  });

  it("URL に #v〜 を付けて直接来たときは、その版へ飛ぶ", () => {
    const target = RELEASES[5];
    window.history.replaceState(null, "", `/changelog#v${target.version}`);
    render(
      <MemoryRouter initialEntries={[`/changelog#v${target.version}`]}>
        <ChangelogPage />
      </MemoryRouter>,
    );
    return new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.getElementById(`v${target.version}`));
        resolve();
      }),
    );
  });
});
