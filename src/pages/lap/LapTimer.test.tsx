/**
 * @vitest-environment jsdom
 *
 * 周回ラップ計測の主ボタンと押し間違いの縛り（UX 監査 2026-11-12・検分 #241 高-1）。
 *
 * ★ 前は「使い方」が計測していない間は開いていて（open={!running}）、その下に 6 枚の数字（計測前は全部「—」）、
 *   さらにその下に計測開始があった。390×844 の初回で計測開始は y≈1463〜1551、2 画面目の下。
 * ★ 計測開始だけを数字の上に上げると、幅 640px 以上で開始の直後にその場所へ「1つ戻す」「終了して保存」が来て、
 *   同じ点の 2 回押しで計測が消えた・終わった（検分 #241 高-1。main では起きない）。
 *   そこで主ボタン（計測開始・周回した・再開する）は画面下の固定バーに 1 つだけ置き、状態で文言と処理だけ替える。
 *   さらに状態が変わった直後の約 600ms は、主ボタン・1つ戻す・終了して保存・全消去の押下を無視する。
 *   位置そのものは jsdom では測れないので、ここでは「同じ要素のまま」「数字の有無」「無視の時間」を見る。
 *   位置の実測は PR の本文（Playwright で 390・820・1024・1280）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LapTimer from "./LapTimer";
import { TAP_GUARD_MS } from "./useTapGuard";

// 楽曲データは読まない（曲が未選択でも計測開始は押せる）
vi.mock("../analyzer/useAnalyzerMusics", () => ({
  useAnalyzerMusics: () => ({ musics: [], aliases: [], loading: false, error: null }),
}));

/** 時計は手で進める（状態が変わった直後の無視の時間を縛るため）。 */
let clock = 1_000_000;
const advance = (ms: number) => {
  clock += ms;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  localStorage.clear();
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});

const draw = () =>
  render(
    <MemoryRouter>
      <LapTimer />
    </MemoryRouter>,
  );

const howTo = () => screen.getByText("使い方", { selector: "summary" }).closest("details")!;
const mainButton = () => screen.getByTestId("lap-main-button");

/** 状態が変わってから無視の時間を過ぎるまで進めて押す。 */
const pressLater = async (el: HTMLElement) => {
  advance(TAP_GUARD_MS + 100);
  await userEvent.click(el);
};

describe("初回（計測していない）", () => {
  it("「使い方」は閉じている（開けば中身は読める）", () => {
    draw();
    expect(howTo().open).toBe(false);
    // 畳んだだけで消していない
    expect(howTo().textContent).toContain("1周目が始まった瞬間に");
  });

  it("計測前は「—」だけの数字を出さない。主ボタンは「計測開始」", () => {
    draw();
    expect(screen.queryByText("直近ラップ")).toBeNull();
    expect(mainButton().textContent).toContain("計測開始");
  });
});

describe("主ボタンの位置", () => {
  it("計測開始・周回した・再開するは同じ 1 つの要素（状態で文言と処理だけ替える）", async () => {
    draw();
    const before = mainButton();
    await userEvent.click(before);
    expect(mainButton()).toBe(before);
    expect(before.textContent).toContain("周回した");
    // 計測が始まったら数字が出る
    expect(screen.getByText("直近ラップ")).toBeTruthy();
    await pressLater(screen.getByRole("button", { name: "中断する" }));
    expect(mainButton()).toBe(before);
    expect(before.textContent).toContain("再開する");
  });

  it("「使い方」を開いたまま計測を始めても閉じる", async () => {
    draw();
    await userEvent.click(screen.getByText("使い方", { selector: "summary" }));
    expect(howTo().open).toBe(true);
    await userEvent.click(mainButton());
    expect(howTo().open).toBe(false);
  });
});

/** a が文書の並びで b より前にあるか。 */
const isBefore = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/**
 * ★ 検分 #241 中-A: 操作の行が数字 6 枚の下にあると、390×664・375×667（Safari に近い高さ）や
 *   390×844 の 1 周後で、行が画面下の固定バーに隠れた。行を数字の上に置く。
 */
describe("計測中の操作の行", () => {
  it("「中断する」「1つ戻す」「全消去」「終了して保存」は数字（直近ラップ）より上にある", async () => {
    draw();
    await userEvent.click(mainButton());
    const stat = screen.getByText("直近ラップ");
    for (const name of ["中断する", "1つ戻す", "全消去", "終了して保存"]) {
      expect(isBefore(screen.getByRole("button", { name }), stat)).toBe(true);
    }
  });

  it("送りの余白（scroll-padding-bottom）をバーの高さぶん取り、ページを離れたら戻す", () => {
    const { unmount } = draw();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("9rem");
    expect(document.body.style.paddingBottom).toBe("9rem");
    unmount();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
    expect(document.body.style.paddingBottom).toBe("");
  });

  it("中断中も「1つ戻す」「全消去」「終了して保存」は数字より上", async () => {
    draw();
    await userEvent.click(mainButton());
    await pressLater(screen.getByRole("button", { name: "中断する" }));
    const stat = screen.getByText("直近ラップ");
    for (const name of ["1つ戻す", "全消去", "終了して保存"]) {
      expect(isBefore(screen.getByRole("button", { name }), stat)).toBe(true);
    }
  });
});

describe("状態が変わった直後の押下を無視する", () => {
  // ★ これは tap 自身の連打よけ（lib/lap.ts の DOUBLE_TAP_MS）でも守られるので、ガードを外しても緑のまま。
  //   ガードの縛りは下の 3 件（1つ戻す・終了して保存・終了直後の主ボタン）。
  it("開始の直後に主ボタンをもう一度押しても、1 周に数えない（時間を過ぎれば数える）", async () => {
    draw();
    await userEvent.click(mainButton());
    advance(200);
    await userEvent.click(mainButton());
    expect(mainButton().textContent).toContain("1周終わるたびに押す");
    await pressLater(mainButton());
    expect(mainButton().textContent).toContain("通算 1 周");
  });

  it("開始の直後の「1つ戻す」は無視する（計測が消えない）", async () => {
    draw();
    await userEvent.click(mainButton());
    advance(200);
    await userEvent.click(screen.getByRole("button", { name: "1つ戻す" }));
    expect(mainButton().textContent).toContain("周回した");
  });

  it("開始の直後の「終了して保存」は無視する", async () => {
    draw();
    await userEvent.click(mainButton());
    advance(200);
    await userEvent.click(screen.getByRole("button", { name: "終了して保存" }));
    expect(mainButton().textContent).toContain("周回した");
  });

  // ★ 操作の行を数字の上に移したので、終了の直後の 2 回目は開き直した曲の段の「曲を選ぶ」の上に来る（Playwright で確認）。
  //   開いても壊れはしないが、検索の画面が勝手に出るので、これも状態の変わり目では捨てる。
  it("「終了して保存」の直後に同じ所を押しても、曲の検索は開かない", async () => {
    draw();
    await userEvent.click(mainButton());
    await pressLater(mainButton()); // 1 周
    await pressLater(screen.getByRole("button", { name: "終了して保存" }));
    advance(200);
    await userEvent.click(screen.getByRole("button", { name: /タップで変更/ }));
    expect(screen.queryByText("周回する曲を選ぶ")).toBeNull();
    await pressLater(screen.getByRole("button", { name: /タップで変更/ }));
    expect(screen.getByText("周回する曲を選ぶ")).toBeTruthy();
  });

  it("「終了して保存」の直後に主ボタンを押しても、次の計測は始まらない", async () => {
    draw();
    await userEvent.click(mainButton());
    await pressLater(mainButton()); // 1 周
    await pressLater(screen.getByRole("button", { name: "終了して保存" }));
    expect(mainButton().textContent).toContain("計測開始");
    advance(200);
    await userEvent.click(mainButton());
    expect(mainButton().textContent).toContain("計測開始");
    // 時間を過ぎれば普通に始められる
    await pressLater(mainButton());
    expect(mainButton().textContent).toContain("周回した");
  });
});
