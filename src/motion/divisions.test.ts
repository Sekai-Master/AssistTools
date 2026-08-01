/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cascadeOrder, clearDivisions, collectDivisions, markDivisions } from "./divisions";

/**
 * 実際の CSS は読み込まないので、「見た目を持つ箱」は data-solid で表す。
 * 本番の判定（影・背景・枠・直下テキスト）はブラウザ側の getComputedStyle が担い、
 * ここで検証したいのは割り方の規則そのもの。
 */
const isBare = (el: Element) => !el.hasAttribute("data-solid");
const isRendered = (el: Element) => !el.hasAttribute("data-hidden");
const ids = (els: Element[]) => els.map((e) => e.id);

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div class="stage">${html}</div>`;
  return document.body.firstElementChild as HTMLElement;
}

/** ToolPage の形: ルート > 見出しバナー + パネルを積む入れ物 */
const TOOL_PAGE = `
  <div id="root">
    <h1 id="title" data-solid></h1>
    <div id="wrap">
      <section id="p1" data-solid></section>
      <section id="p2" data-solid></section>
      <section id="p3" data-solid></section>
    </div>
  </div>`;

/** Hub の形: 2セクション、片方はカードのグリッド（カードは Link に包まれている） */
const HUB = `
  <div id="root">
    <section id="s1"><h1 id="t" data-solid></h1><p id="lead" data-solid></p></section>
    <section id="s2">
      <h2 id="h2" data-solid></h2>
      <div id="grid">
        <a id="l1"><div id="c1" data-solid></div></a>
        <a id="l2"><div id="c2" data-solid></div></a>
      </div>
    </section>
  </div>`;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("collectDivisions", () => {
  it("ツールページは 見出し + パネル に割れる", () => {
    const stage = mount(TOOL_PAGE);
    expect(ids(collectDivisions(stage, { isBare, isRendered }))).toEqual([
      "title",
      "p1",
      "p2",
      "p3",
    ]);
  });

  // 影や背景を持つ箱＝この製品では意味のある面。そこから内側へは割らない。
  it("見た目を持つ箱で止まる（パネルの中身までは割らない）", () => {
    const stage = mount(`
      <div id="root">
        <section id="p1" data-solid><div id="a"></div><div id="b"></div></section>
        <section id="p2" data-solid></section>
      </div>`);
    expect(ids(collectDivisions(stage, { isBare, isRendered }))).toEqual(["p1", "p2"]);
  });

  it("中身が1つしか無い入れ物は外皮として剥がす", () => {
    const stage = mount(HUB);
    const found = ids(collectDivisions(stage, { isBare, isRendered }));
    // <a> ではなくカード本体が選ばれている
    expect(found).toEqual(["t", "lead", "h2", "c1", "c2"]);
  });

  it("描画されていない要素は数に入れない（lg 限定の列など）", () => {
    const stage = mount(`
      <div id="root">
        <div id="left" data-solid></div>
        <div id="right" data-solid data-hidden></div>
      </div>`);
    // right が数から外れると子は1つ＝外皮扱いになり、left だけが残る
    expect(ids(collectDivisions(stage, { isBare, isRendered }))).toEqual(["left"]);
  });

  // 捨てると印の付かない中身が居残り、無地へ切り替わる瞬間にだけ消える（ポップする）。
  it("上限を超えたら捨てずに1段粗く割り直す", () => {
    const stage = mount(HUB);
    const found = ids(collectDivisions(stage, { isBare, isRendered, max: 3 }));
    expect(found).toEqual(["s1", "s2"]);
  });

  // 割れなかったことにして、ステージごとフェードする退避路（data-divs="off"）へ渡す。
  it("中身が空なら 0 個（ステージ自身は印を付けない）", () => {
    const stage = mount("");
    expect(collectDivisions(stage, { isBare, isRendered })).toEqual([]);
  });
});

describe("cascadeOrder", () => {
  it("先頭 0 / 末尾 1 に等間隔で張る", () => {
    expect(cascadeOrder([true, true, true])).toEqual([0, 0.5, 1]);
  });

  // 長いページで下まで順に遅延させると、見えている数ブロックが一瞬で終わって
  // 残りの尺が画面外で浪費される。
  it("画面内の並びだけに尺を配り、外は先頭/末尾へ丸める", () => {
    expect(cascadeOrder([false, true, true, true, false])).toEqual([0, 0, 0.5, 1, 1]);
  });

  it("画面内が1つだけでも壊れない", () => {
    expect(cascadeOrder([false, true, false])).toEqual([0, 0, 1]);
  });

  it("画面内が1つも無ければ全体に張る（測れないときの退避）", () => {
    expect(cascadeOrder([false, false, false])).toEqual([0, 0.5, 1]);
  });

  it("1ブロックのページはずらさない", () => {
    expect(cascadeOrder([true])).toEqual([0]);
  });
});

describe("markDivisions", () => {
  it("順番と画面内かどうかを印として書く", () => {
    const stage = mount(TOOL_PAGE);
    const n = markDivisions(stage, { isBare, isRendered, isNear: () => true });
    expect(n).toBe(4);

    const marked = Array.from(stage.querySelectorAll("[data-div]"));
    expect(ids(marked)).toEqual(["title", "p1", "p2", "p3"]);
    expect(marked.map((el) => (el as HTMLElement).style.getPropertyValue("--div-t"))).toEqual([
      "0.000",
      "0.333",
      "0.667",
      "1.000",
    ]);
    expect(marked.every((el) => el.getAttribute("data-div") === "near")).toBe(true);
  });

  it("画面外のブロックは far（ぼかす面積を1画面ぶんに抑えるため）", () => {
    const stage = mount(TOOL_PAGE);
    markDivisions(stage, {
      isBare,
      isRendered,
      isNear: (el) => el.id === "title" || el.id === "p1",
    });
    expect(stage.querySelector("#p3")?.getAttribute("data-div")).toBe("far");
    expect(stage.querySelector("#title")?.getAttribute("data-div")).toBe("near");
  });

  // 前の遷移の印が残っていると、消えたはずのブロックの順番で新しい木が動く。
  it("付け直す前に古い印を消す", () => {
    const stage = mount(TOOL_PAGE);
    markDivisions(stage, { isBare, isRendered, isNear: () => true });
    stage.innerHTML = `<div id="root"><div id="only" data-solid></div></div>`;
    const n = markDivisions(stage, { isBare, isRendered, isNear: () => true });
    expect(n).toBe(1);
    expect(stage.querySelectorAll("[data-div]").length).toBe(1);
  });

  it("clearDivisions は印も順番も消す", () => {
    const stage = mount(TOOL_PAGE);
    markDivisions(stage, { isBare, isRendered, isNear: () => true });
    clearDivisions(stage);
    expect(stage.querySelectorAll("[data-div]").length).toBe(0);
    expect((stage.querySelector("#p1") as HTMLElement).style.getPropertyValue("--div-t")).toBe("");
  });
});
