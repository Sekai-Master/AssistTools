/**
 * @vitest-environment jsdom
 *
 * 規約・ポリシー・更新履歴の3ページが**描画できること**と、
 * 書いてある内容が実装と食い違っていないことを縛る。
 *
 * 文章の中身をテストで固定しても意味は薄いが、次の2つだけは別で、
 * 外れると「規約が嘘をついている」状態になる:
 *   - ポリシーの保存データ一覧が、実際の保存キーの台帳と一致していること
 *   - 窓口・サイト名が site.ts と一致していること（各ページに直書きされていない）
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import TermsPage from "./TermsPage";
import PrivacyPage from "./PrivacyPage";
import ChangelogPage from "./ChangelogPage";
import { CHANGELOG_IMAGE_VERSIONS, changelogImageOf } from "./changelogImages";
import { parseChangelog } from "./changelogParser";
import changelogMarkdown from "../../../CHANGELOG.md?raw";
import { SiteFooter } from "../../components/SiteFooter";
import { STORED_ITEMS } from "../settings/lib/storedItems";
import { ISSUES_URL, OWNER_NAME, OWNER_X_URL, SITE_NAME, X_HANDLE, X_URL } from "../../lib/site";

afterEach(cleanup);

const at = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("利用規約", () => {
  it("非公式であることと窓口を必ず載せている", () => {
    at(<TermsPage />);
    expect(screen.getByRole("heading", { name: "利用規約", level: 1 })).toBeTruthy();
    expect(document.body.textContent).toContain("非公式");
    expect(document.body.textContent).toContain(SITE_NAME);
    expect(document.body.textContent).toContain(X_HANDLE);
    expect(screen.getByRole("link", { name: "Issues" }).getAttribute("href")).toBe(ISSUES_URL);
  });

  /*
   * ★ 運営者は「名義（@なし）」と「X のハンドル（@あり）」を別物として持っている。
   *   @ 付きの表記が実在しないアカウントを指していると、それ自体が嘘になるので、
   *   ハンドルは必ず本物へのリンクとして出す。
   */
  it("運営者を同定できる（個人アカウントへのリンクがある）", () => {
    at(<TermsPage />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(OWNER_X_URL);
  });

  it("運営者個人のアカウントが窓口でないと明記している", () => {
    at(<TermsPage />);
    expect(document.body.textContent).toContain("窓口ではありません");
  });

  it("プライバシーポリシーと更新履歴へ行ける", () => {
    at(<TermsPage />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/privacy");
    expect(hrefs).toContain("/changelog");
  });
});

describe("プライバシーポリシー", () => {
  it("保存している項目を台帳どおり全部載せる（増やしたら自動で載る）", () => {
    at(<PrivacyPage />);
    for (const item of STORED_ITEMS) {
      expect(document.body.textContent, `「${item.label}」が載っていない`).toContain(item.label);
    }
  });

  it("解析と Cookie の扱いを明記している", () => {
    at(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Cloudflare Web Analytics");
    expect(text).toContain("Cookie を使用していません");
  });

  it("設定画面（消し方）への導線がある", () => {
    at(<PrivacyPage />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/settings");
  });
});

describe("更新履歴ページ", () => {
  it("CHANGELOG.md の版が並び、先頭に「最新」が付く", () => {
    at(<ChangelogPage />);
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeTruthy();
    expect(screen.getByText("最新")).toBeTruthy();
    // 最初のリリースまで残っていること（途中で解析が止まっていないか）。
    expect(screen.getByText("v1.0.0")).toBeTruthy();
  });

  /** 版の見出し（v1.28.0 など）が入っている枠。 */
  const releaseArticle = (version: string) => {
    const article = screen.getByRole("heading", { name: `v${version}`, level: 2 }).closest("article");
    if (!article) throw new Error(`v${version} の枠が無い`);
    return article;
  };

  it("告知画像のある版は、その版の枠に代替テキストと寸法付きで出す", () => {
    at(<ChangelogPage />);
    expect(CHANGELOG_IMAGE_VERSIONS.length).toBeGreaterThan(0);
    for (const version of CHANGELOG_IMAGE_VERSIONS) {
      const image = changelogImageOf(version)!;
      const img = within(releaseArticle(version)).getByRole("img");
      expect(img.getAttribute("alt"), `v${version} の alt`).toBe(image.alt);
      // 寸法が無いと、遅延読み込みの画像が出た瞬間に下の本文が押し下げられる。
      expect(img.getAttribute("width"), `v${version} の width`).toBe(String(image.width));
      expect(img.getAttribute("height"), `v${version} の height`).toBe(String(image.height));
      expect(img.getAttribute("loading"), `v${version} の loading`).toBe("lazy");
      expect(img.getAttribute("src"), `v${version} の src`).toMatch(new RegExp(`images/changelog/${version.replace(/\./g, "\\.")}\\.webp$`));
      // 見出しのすぐ下に置き、押すと同じ画像を開く。
      const link = img.closest("a");
      expect(link?.getAttribute("href"), `v${version} のリンク`).toBe(img.getAttribute("src"));
      expect(releaseArticle(version).querySelector("header")?.nextElementSibling, `v${version} の位置`).toBe(link);
    }
  });

  it("告知画像の無い版は画像を出さない", () => {
    at(<ChangelogPage />);
    const without = parseChangelog(changelogMarkdown)
      .map((r) => r.version)
      .filter((version) => !changelogImageOf(version));
    expect(without.length).toBeGreaterThan(0);
    for (const version of without) {
      expect(within(releaseArticle(version)).queryByRole("img"), `v${version} に画像がある`).toBeNull();
    }
  });
});

describe("フッター", () => {
  it("規約・ポリシー・更新履歴と外部リンクを出す", () => {
    at(<SiteFooter />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/privacy");
    expect(hrefs).toContain("/changelog");
    expect(hrefs).toContain(X_URL);
  });

  it("お問い合わせへのリンクは、今のページを from に入れる", () => {
    render(
      <MemoryRouter initialEntries={["/deck"]}>
        <SiteFooter />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "お問い合わせ" }).getAttribute("href")).toBe("/contact?from=%2Fdeck");
  });

  it("バージョンを表示する", () => {
    at(<SiteFooter />);
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeTruthy();
  });

  it("非公式であることを常時出す", () => {
    at(<SiteFooter />);
    expect(document.body.textContent).toContain("非公式");
  });

  // 著作権表記は名義。ハンドル名に見える「@」を付けない（site.ts のコメント参照）。
  it("著作権表記は @ の付かない名義で出す", () => {
    at(<SiteFooter />);
    expect(OWNER_NAME.startsWith("@")).toBe(false);
    expect(document.body.textContent).toContain(`${OWNER_NAME} All Rights Reserved.`);
    expect(document.body.textContent).not.toContain(`@${OWNER_NAME}`);
  });
});
