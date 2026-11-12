/**
 * @vitest-environment jsdom
 *
 * 「詳しく計算する」の段（UX 監査 2026-11-12、指示書の共通の型 1。docs/design-system.md 7 節）。
 *
 * ★ 縛るのは 3 つ。
 *   - 初めは閉じている（主な入力だけで結果が出る形にする）
 *   - 既定値から変えた項目の数を、閉じた見出しに出す（変えた値が隠れたまま結果が変わる事故を防ぐ）
 *   - 中身は閉じていても DOM にある（畳むだけで消さない。閉じていても値は計算に使われる）
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MoreSettings } from "./MoreSettings";
import { countChanged } from "../../lib/countChanged";

afterEach(cleanup);

const details = () => screen.getByText("詳しく計算する").closest("details")!;
const summary = () => details().querySelector("summary")!;

describe("MoreSettings", () => {
  it("初めは閉じていて、見出しは「詳しく計算する」、中身は DOM に残る", () => {
    render(<MoreSettings changed={0}>中の入力</MoreSettings>);
    expect(details().open).toBe(false);
    expect(details().textContent).toContain("中の入力");
  });

  it("変えた項目があれば、見出しにその数を出す", () => {
    render(<MoreSettings changed={2}>中の入力</MoreSettings>);
    expect(summary().textContent).toContain("2 項目を変更中");
  });

  it("変えた項目が 0 なら数を出さない", () => {
    render(<MoreSettings changed={0}>中の入力</MoreSettings>);
    expect(summary().textContent).not.toContain("変更中");
  });

  it("見出しに添える要約（使用中のものなど）を出せる", () => {
    render(
      <MoreSettings changed={1} note="オートを使用中">
        中の入力
      </MoreSettings>,
    );
    expect(summary().textContent).toContain("1 項目を変更中");
    expect(summary().textContent).toContain("オートを使用中");
  });

  it("見出しに中身の一覧（contents）を添えられる。閉じていても何が入っているか分かる", () => {
    render(
      <MoreSettings changed={0} contents="基準焚き数・編成・オート">
        中の入力
      </MoreSettings>,
    );
    expect(summary().textContent).toContain("基準焚き数・編成・オート");
  });

  it("開閉の印（矢印）を見出しに出す（flex の summary では既定の三角が消えるため）", () => {
    render(<MoreSettings changed={0}>中の入力</MoreSettings>);
    const marker = summary().querySelector("[data-more-settings-marker]");
    expect(marker).not.toBeNull();
    // ★ design-system.md 4 節: 文字は CSS で出す（data-icon）。合字の元の文字を要素に入れない（検索エンジンが見出しの文字として読む。検分 #247 低-3）
    expect(marker!.getAttribute("data-icon")).toBe("chevron_right");
    expect(marker!.textContent).toBe("");
    expect(summary().textContent).not.toContain("chevron_right");
  });

  it("見出しの語は変えられる（中身が分かる言い方にするため）", () => {
    render(
      <MoreSettings title="条件を書く" changed={0}>
        中の入力
      </MoreSettings>,
    );
    expect(screen.getByText("条件を書く").closest("summary")).not.toBeNull();
  });

  it("ページの段（section）は、見出しを枠の形にして中身を枠の外に並べる（枠の中に枠を入れない）", () => {
    const { container } = render(
      <MoreSettings variant="section" changed={0}>
        中の入力
      </MoreSettings>,
    );
    const d = container.querySelector("details")!;
    expect(d.className).not.toContain("neu-panel");
    expect(d.querySelector("summary")!.className).toContain("neu-panel");
  });
});

describe("countChanged", () => {
  it("今の値と既定値の組のうち、違うものを数える", () => {
    expect(countChanged([["500000", "500000"], [5, 5], ["", ""]])).toBe(0);
    expect(countChanged([["480000", "500000"], [5, 5], ["336000", ""]])).toBe(2);
  });

  it("前後の空白だけの違いは変えたことにしない", () => {
    expect(countChanged([[" ", ""], ["10 ", "10"]])).toBe(0);
  });

  it("真偽値も比べる", () => {
    expect(countChanged([[true, false], [false, false]])).toBe(1);
  });
});
