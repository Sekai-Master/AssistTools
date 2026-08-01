/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DIV_ATTR, DIV_T } from "./divisions";
import { aimMorph, cancelMorph, captureMorph, flyMorph, MORPH_ATTR } from "./morph";

const TIMING = { flyMs: 400, fadeMs: 240 };

/** jsdom は採寸を全て 0 で返すので、必要な要素にだけ寸法を与える。 */
function sized(el: Element, top: number, left: number, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  return el as HTMLElement;
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div class="stage">${html}</div>`;
  const stage = document.body.firstElementChild as HTMLElement;
  sized(stage, 0, 0, 800, 600);
  return stage;
}

const boxes = () => document.querySelectorAll(".morph-box");

beforeEach(() => {
  document.body.innerHTML = "";
  window.innerHeight = 600;
});
afterEach(() => {
  cancelMorph();
});

describe("出発点の指名", () => {
  // 一覧には同じ印のカードが何枚も並ぶので、採寸だけでは「どれ」か決まらない。
  it("候補が複数あるとき、指名が無ければ何もしない", () => {
    const stage = mount(`
      <a id="a1"><div ${MORPH_ATTR}="tool:x" id="c1"></div></a>
      <a id="a2"><div ${MORPH_ATTR}="tool:y" id="c2"></div></a>`);
    sized(stage.querySelector("#c1")!, 10, 10, 200, 100);
    sized(stage.querySelector("#c2")!, 10, 220, 200, 100);

    captureMorph(stage);
    expect(boxes().length).toBe(0);
  });

  // 戻るときのツールページのように印が1つしか無い場合は、押下が無くても向きが決まる。
  it("候補が1つだけなら指名が無くても持ち上げる", () => {
    const stage = mount(`<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`);
    const t = sized(stage.querySelector("#t")!, 10, 10, 600, 48);

    captureMorph(stage);
    expect(boxes().length).toBe(1);
    // 元は場所を残したまま隠す。display:none にすると下の中身が繰り上がる。
    expect(t.style.visibility).toBe("hidden");
  });

  /**
   * ★ ツールからツールへ移ると、印はどちらにもあるがキーが違う。持ち上げると
   *   本文だけ沈んで**機能名だけが宙に残り**、行き先が見つからずに消える（issue #3）。
   */
  it("行き先が違う印しか持たないなら持ち上げない", () => {
    const stage = mount(`<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`);
    const t = sized(stage.querySelector("#t")!, 10, 10, 600, 48);

    captureMorph(stage, "tool:y");
    expect(boxes().length).toBe(0);
    expect(t.style.visibility).toBe("");
  });

  it("行き先が印を持たない画面（設定・404）なら持ち上げない", () => {
    const stage = mount(`<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`);
    sized(stage.querySelector("#t")!, 10, 10, 600, 48);

    captureMorph(stage, null);
    expect(boxes().length).toBe(0);
  });

  it("行き先が同じ印を持つ / ハブ（不問）なら持ち上げる", () => {
    const stage = mount(`<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`);
    sized(stage.querySelector("#t")!, 10, 10, 600, 48);
    captureMorph(stage, "tool:x");
    expect(boxes().length).toBe(1);

    cancelMorph();
    const stage2 = mount(`<h1 ${MORPH_ATTR}="tool:x" id="t2"></h1>`);
    sized(stage2.querySelector("#t2")!, 10, 10, 600, 48);
    captureMorph(stage2, "*");
    expect(boxes().length).toBe(1);
  });

  it("押下で指名すればその1枚が持ち上がる", () => {
    const stage = mount(`
      <a id="a1"><div ${MORPH_ATTR}="tool:x" id="c1"></div></a>
      <a id="a2"><div ${MORPH_ATTR}="tool:y" id="c2"></div></a>`);
    const c1 = sized(stage.querySelector("#c1")!, 10, 10, 200, 100);
    sized(stage.querySelector("#c2")!, 10, 220, 200, 100);

    aimMorph(stage.querySelector("#c1"));
    captureMorph(stage); // 指名済みなので上書きしない
    expect(boxes().length).toBe(1);
    expect(c1.style.visibility).toBe("hidden");
  });

  // ★ カードはリンクの「子」。キーボードの Enter やリンク自体の押下では
  //   target がリンクになるので、closest だけだと届かない（実際に踏んだ）。
  it("押された点が印の外側（親リンク）でも見つける", () => {
    const stage = mount(`<a id="a1"><div ${MORPH_ATTR}="tool:x" id="c1"></div></a>`);
    sized(stage.querySelector("#c1")!, 10, 10, 200, 100);

    aimMorph(stage.querySelector("#a1"));
    expect(boxes().length).toBe(1);
  });

  it("押された点が印の内側（カードの中の見出し）でも見つける", () => {
    const stage = mount(
      `<a id="a1"><div ${MORPH_ATTR}="tool:x" id="c1"><h3 id="h"></h3></div></a>`
    );
    sized(stage.querySelector("#c1")!, 10, 10, 200, 100);

    aimMorph(stage.querySelector("#h"));
    expect(boxes().length).toBe(1);
  });

  // 見えない所から飛んでくると、どこから来たのか読めない。
  it("画面外の候補は持ち上げない", () => {
    const stage = mount(`<div ${MORPH_ATTR}="tool:x" id="c1"></div>`);
    sized(stage.querySelector("#c1")!, 2000, 10, 200, 100);

    captureMorph(stage);
    expect(boxes().length).toBe(0);
  });
});

describe("飛行", () => {
  function setup() {
    const stage = mount(`<a id="a1"><div ${MORPH_ATTR}="tool:x" id="c1"></div></a>`);
    sized(stage.querySelector("#c1")!, 400, 100, 200, 120);
    aimMorph(stage.querySelector("#c1"));
    return stage;
  }

  it("行き先に同じ印があれば、複製2枚で入れ替える", () => {
    const stage = setup();
    // 遷移後の木に差し替える（実際の commit と同じ）
    stage.innerHTML = `<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`;
    const target = sized(stage.querySelector("#t")!, 24, 16, 700, 48);

    expect(flyMorph(stage, TIMING)).toBe(true);
    expect(boxes().length).toBe(2);
    // 本物は着地するまで隠す
    expect(target.style.visibility).toBe("hidden");
    // 2枚とも行き先の箱へ向かう
    for (const b of boxes()) {
      expect((b as HTMLElement).style.top).toBe("24px");
      expect((b as HTMLElement).style.width).toBe("700px");
    }
  });

  // ★ transition-duration は値が足りないと先頭から循環して割り当てられる。
  //   「400ms, 240ms」と書くと left と height だけ 240ms になって箱が歪む。
  it("動かすプロパティと duration の個数が一致する（箱が歪まない）", () => {
    const stage = setup();
    stage.innerHTML = `<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`;
    sized(stage.querySelector("#t")!, 24, 16, 700, 48);
    flyMorph(stage, TIMING);

    for (const b of boxes()) {
      const el = b as HTMLElement;
      const props = el.style.transitionProperty.split(",").map((s) => s.trim());
      const times = el.style.transitionDuration.split(",").map((s) => s.trim());
      expect(times.length).toBe(props.length);
      // 大きさ・位置は同じ速さで、入れ替えだけが別の速さ
      expect(new Set(times.slice(0, -1))).toEqual(new Set([`${TIMING.flyMs}ms`]));
      expect(times.at(-1)).toBe(`${TIMING.fadeMs}ms`);
      expect(props.at(-1)).toBe("opacity");
    }
  });

  // 印を足し忘れても壊れないこと。ふつうの遷移に戻るだけでよい。
  it("行き先に対応が無ければ持ち上げたものを片付ける", () => {
    const stage = setup();
    stage.innerHTML = `<h1 id="other"></h1>`;

    expect(flyMorph(stage, TIMING)).toBe(false);
    expect(boxes().length).toBe(0);
  });

  // ★ ブロックの印は遷移が終わっても要素に残る（idle では規則が当たらないので
  //   消す必要が無い）。複製がそれを持ったままだとカスケードの規則が当たり、
  //   飛ぶはずの複製がページと一緒に溶けて消える。初回は印がまだ無いので成功し、
  //   2回目以降だけ壊れる ＝ 「一覧からの移動が2回目から消える」の正体。
  it("複製にカスケードの印を持ち込まない", () => {
    const stage = mount(`<a id="a1"><div ${MORPH_ATTR}="tool:x" id="c1"></div></a>`);
    const c1 = sized(stage.querySelector("#c1")!, 400, 100, 200, 120);
    // 前の遷移で付いた印が残っている状態
    c1.setAttribute(DIV_ATTR, "near");
    c1.style.setProperty(DIV_T, "0.500");

    aimMorph(c1);
    const layer = document.getElementById("morph-layer")!;
    expect(layer.querySelectorAll(`[${DIV_ATTR}]`).length).toBe(0);
    const copy = layer.querySelector(".morph-inner")?.firstElementChild as HTMLElement;
    expect(copy.style.getPropertyValue(DIV_T)).toBe("");
  });

  it("複製の中に印を残さない（次の採寸で複製を拾わないため）", () => {
    const stage = setup();
    stage.innerHTML = `<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`;
    sized(stage.querySelector("#t")!, 24, 16, 700, 48);
    flyMorph(stage, TIMING);

    const layer = document.getElementById("morph-layer")!;
    expect(layer.querySelectorAll(`[${MORPH_ATTR}]`).length).toBe(0);
  });

  it("cancelMorph で複製が消え、隠した元も戻る", () => {
    const stage = setup();
    const c1 = stage.querySelector("#c1") as HTMLElement;
    expect(c1.style.visibility).toBe("hidden");

    cancelMorph();
    expect(boxes().length).toBe(0);
    expect(c1.style.visibility).toBe("");
  });

  // ★ 後片付けは「飛行が終わる頃」のタイマーでやっている。着地しきる前に次の遷移を
  //   始めると、前の飛行のタイマーが新しく持ち上げた複製まで消してしまい、
  //   元は隠れたままなので「選んだパネルごと消える」ことになる。
  //   間隔を空けて操作していると再現しないので、ここで固定しておく。
  it("着地前に次の遷移を始めても、新しい複製が前の後片付けに巻き込まれない", () => {
    const stage = setup();
    stage.innerHTML = `<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`;
    sized(stage.querySelector("#t")!, 24, 16, 700, 48);
    flyMorph(stage, TIMING); // まだ飛んでいる（後片付けタイマーは未発火）
    expect(boxes().length).toBe(2);

    // 着地を待たずに次のページへ
    stage.innerHTML = `<a id="a2"><div ${MORPH_ATTR}="tool:y" id="c2"></div></a>`;
    const c2 = sized(stage.querySelector("#c2")!, 300, 40, 250, 150);
    aimMorph(c2);

    // 前の2枚は畳まれ、新しい1枚だけが生きている
    expect(boxes().length).toBe(1);
    expect((boxes()[0] as HTMLElement).isConnected).toBe(true);

    stage.innerHTML = `<h1 ${MORPH_ATTR}="tool:y" id="t2"></h1>`;
    sized(stage.querySelector("#t2")!, 24, 16, 700, 48);
    expect(flyMorph(stage, TIMING)).toBe(true);
    expect(boxes().length).toBe(2);
  });

  // 上の片付けと入れ違いになった場合でも、隠しっぱなしにしない。
  it("持ち上げた複製が外されていたら飛ばさずに畳む", () => {
    const stage = setup();
    document.getElementById("morph-layer")!.innerHTML = ""; // 別経路で片付けられた状態
    stage.innerHTML = `<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`;
    sized(stage.querySelector("#t")!, 24, 16, 700, 48);

    expect(flyMorph(stage, TIMING)).toBe(false);
    expect(boxes().length).toBe(0);
  });

  it("持ち上げていなければ何も起きない", () => {
    const stage = mount(`<h1 ${MORPH_ATTR}="tool:x" id="t"></h1>`);
    sized(stage.querySelector("#t")!, 24, 16, 700, 48);
    expect(flyMorph(stage, TIMING)).toBe(false);
  });
});
