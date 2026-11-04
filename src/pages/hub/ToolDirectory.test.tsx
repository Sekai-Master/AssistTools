/**
 * @vitest-environment jsdom
 *
 * トップのツールの一覧（分類ごとの列・検索）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TOOLS } from "../../tools";
import { MORPH_ATTR } from "../../motion/morph";
import { ToolDirectory } from "./ToolDirectory";
import { LatestChanges } from "./LatestChanges";
import { parseChangelog } from "../legal/changelogParser";
import changelogMarkdown from "../../../CHANGELOG.md?raw";

afterEach(cleanup);

const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const ready = TOOLS.filter((t) => t.status === "ready");

describe("ツールの一覧", () => {
  it("公開中のツールを全部、ページへのリンクで出す", () => {
    show(<ToolDirectory />);
    for (const t of ready) {
      const link = screen.getByRole("link", { name: t.name });
      expect(link.getAttribute("href")).toBe(t.path);
    }
  });

  // ★ 説明文は一覧に出さない（文字を減らす）。説明は検索のときだけ
  it("ふだんは説明文を出さない", () => {
    const { container } = show(<ToolDirectory />);
    for (const t of ready) expect(container.textContent).not.toContain(t.description);
  });

  // ★ 押した行がツールの見出しへ飛ぶ遷移の印。以前のカードと同じキー
  it("各行に遷移の印（tool:<id>）を付ける", () => {
    const { container } = show(<ToolDirectory />);
    const keys = Array.from(container.querySelectorAll(`[${MORPH_ATTR}]`)).map((el) => el.getAttribute(MORPH_ATTR));
    expect(keys.sort()).toEqual(ready.map((t) => `tool:${t.id}`).sort());
  });

  // ★ #190: 検索エンジンがアイコンの合字の文字（insights など）をリンクの文字として読まないよう、アイコンは CSS で出す
  it("リンクの文字にアイコンの名前を入れない", () => {
    show(<ToolDirectory />);
    const border = screen.getByRole("link", { name: "ボーダー予測" });
    expect(border.textContent).not.toContain("insights");
  });

  it("検索すると当たったものだけ、説明を1行添えて出す", () => {
    show(<ToolDirectory />);
    fireEvent.change(screen.getByRole("searchbox", { name: "ツールを探す" }), { target: { value: "家具" } });
    expect(screen.getByRole("status").textContent).toBe("1件");
    const link = screen.getByRole("link", { name: /マイセカイ/ });
    expect(within(link).getByText(/家具/)).toBeTruthy();
  });

  it("当たらなければそう書く", () => {
    show(<ToolDirectory />);
    fireEvent.change(screen.getByRole("searchbox", { name: "ツールを探す" }), { target: { value: "存在しない語XYZ" } });
    expect(screen.getByRole("status").textContent).toBe("見つかりませんでした");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("検索を消すと分類ごとの一覧に戻る", () => {
    show(<ToolDirectory />);
    const box = screen.getByRole("searchbox", { name: "ツールを探す" });
    fireEvent.change(box, { target: { value: "家具" } });
    fireEvent.change(box, { target: { value: "" } });
    // 件数の欄は読み上げのために常に置いてある（中身が空になる）
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getAllByRole("link")).toHaveLength(ready.length);
  });
});

describe("トップの更新履歴", () => {
  it("CHANGELOG.md の直近3版を、更新履歴のページへのリンクで出す", async () => {
    show(<LatestChanges />);
    const latest = parseChangelog(changelogMarkdown).slice(0, 3);
    for (const r of latest) expect(await screen.findByText(`v${r.version}`)).toBeTruthy();
    for (const a of screen.getAllByRole("link")) expect(a.getAttribute("href")).toBe("/changelog");
  });
});
