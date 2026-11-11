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

  it("問い合わせのページへ行ける（第2条・第7条）", () => {
    at(<TermsPage />);
    const links = screen.getAllByRole("link", { name: "問い合わせのページ" });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const a of links) expect(a.getAttribute("href")).toBe("/contact?from=%2Fterms");
  });

  it("第5条は、問い合わせで送った内容だけは運営者に届くと書く", () => {
    at(<TermsPage />);
    expect(sectionText("5. 保存されるデータについて")).toContain("問い合わせのページから送った内容だけは運営者に届きます");
  });
});

/** 見出しの名前でその項を探し、本文を返す。 */
function sectionText(title: string): string {
  const section = screen.getByRole("heading", { name: title, level: 2 }).closest("section");
  if (!section) throw new Error(`「${title}」の項が無い`);
  return section.textContent ?? "";
}

describe("プライバシーポリシー", () => {
  it("保存している項目を台帳どおり全部載せる（増やしたら自動で載る）", () => {
    at(<PrivacyPage />);
    for (const item of STORED_ITEMS) {
      expect(document.body.textContent, `「${item.label}」が載っていない`).toContain(item.label);
    }
  });

  /*
   * ★ 第6項の文そのものは固定しない。問い合わせの Turnstile の Cookie は、本物の鍵で測ってから
   *   指揮が書き直す（2026-11-12 の時点では試験用の鍵で 0 件）。サイト自身が使わないことと、
   *   Turnstile に触れていることだけを縛る。
   */
  it("解析と Cookie の扱いを明記している（Cookie の項は Turnstile にも触れる）", () => {
    at(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Cloudflare Web Analytics");
    expect(sectionText("6. Cookie")).toContain("Cookie を使用していません");
    expect(sectionText("6. Cookie")).toContain("Turnstile");
  });

  it("問い合わせで使う事業者を全部名指しする（第7項）", () => {
    at(<PrivacyPage />);
    const third = sectionText("7. 第三者への提供");
    for (const name of ["Google", "Cloudflare", "Discord", "Anthropic"]) expect(third, name).toContain(name);
    expect(third).toContain("これ以外には渡しません");
  });

  it("問い合わせで送った内容の扱い（保存先・AI が読むこと・知らせ・期限と消し方）を書く（第10項）", () => {
    at(<PrivacyPage />);
    const contact = sectionText("10. 問い合わせ");
    expect(contact).toContain("Google のアカウント");
    expect(contact).toContain("Claude");
    expect(contact).toContain("種類だけ");
    expect(contact).toContain("1 年以内");
    expect(contact).toContain("送った内容に含まれるものは、すべて運営者に届きます");
  });

  it("Turnstile の読み込みは第5項（外部への通信）に書く。開いただけでは接続しない", () => {
    at(<PrivacyPage />);
    const external = sectionText("5. 外部サイトへの通信");
    expect(external).toContain("ページを開いただけで外部のサーバーに接続することはありません");
    expect(external).toContain("challenges.cloudflare.com");
    expect(external).toContain("Turnstile Privacy Addendum");
    // 実装（ContactForm の読み込みのきっかけ）と同じ言い方にする（検分 高-1）
    expect(external).toContain("種類・内容・返信先の欄に初めて触れたとき");
  });

  // ★ 案の印をページに残したまま本番に出さない（検分 高-3。CI は main への push でそのまま本番に出す）
  it("「（実測の後に確定）」のような案の印を本文に残さない", () => {
    at(<PrivacyPage />);
    expect(document.body.textContent).not.toContain("実測の後に確定");
  });

  it("Turnstile の保存（第2項）と Cookie（第6項）は、何で確かめたかと Cloudflare の説明を添える", () => {
    at(<PrivacyPage />);
    const stored = sectionText("2. ブラウザに保存される情報");
    expect(stored).toContain("試験用の設定");
    expect(stored).toContain("設定の画面には出ず");
    const cookie = sectionText("6. Cookie");
    expect(cookie).toContain("試験用の設定");
    expect(cookie).toContain("Turnstile Privacy Addendum");
  });

  it("問い合わせのページへ行ける（第10項）", () => {
    at(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "問い合わせのページ" }).getAttribute("href")).toBe("/contact?from=%2Fprivacy");
  });

  // 問い合わせ口を付けた時点で事実でなくなった文（レビュー 高-1）。戻すと規約・ポリシーが嘘になる
  it("問い合わせ口と食い違う古い文を残さない", () => {
    at(<PrivacyPage />);
    const privacy = document.body.textContent ?? "";
    expect(privacy).not.toContain("個人情報の入力を求める箇所はありませんが");
    expect(privacy).not.toContain("そもそも運営者が利用者の情報を取得していないため");
    cleanup();
    at(<TermsPage />);
    expect(sectionText("5. 保存されるデータについて")).not.toMatch(/にだけ保存されます。運営者のサーバーには送られません。\s*詳しくは/);
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
