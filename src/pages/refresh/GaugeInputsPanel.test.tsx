/**
 * @vitest-environment jsdom
 *
 * ゲージ系の共通の入力（リフレッシュゲージ・周回プラン・必要稼働時間の 3 ページ）の補足文。
 *
 * ★ 縛るのは「入力欄の下の補足は 1 行（約 30 字）まで、詳しい説明は閉じた段に畳む（消さない）」
 *   （UX 監査 2026-11-12、指示書の共通の型 2・3。docs/design-system.md 7 節）。
 *   前は 3 本で 27＋49＋74 字あり、同じ文が 3 ページに出ていた。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GaugeInputsPanel } from "./GaugeInputsPanel";
import { WHEEL_ROW } from "../../components/ui/WheelPicker";
import { useGaugeInputs } from "./useGaugeInputs";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { SOLO_DEFAULT_RATE } from "./lib/liveAssumption";

// 印を固定する（土台の値を戻してもこのファイルの期待は変わらない。戻した側は別のファイルが縛る）
vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));
vi.mock("../../lib/overhead", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/overhead")>()),
  SOLO_OVERHEAD_PROVISIONAL: true,
}));

afterEach(cleanup);

function Harness({ showGauge = true }: { showGauge?: boolean }) {
  const inputs = useGaugeInputs([]);
  return <GaugeInputsPanel inputs={inputs} musics={[]} aliases={[]} loading={false} showGauge={showGauge} />;
}

/** 入力欄のすぐ下の補足文（Field の hint）。label 要素の兄弟の最後の p。 */
const hintOf = (label: string) => {
  const field = screen.getByText(label, { selector: "label" }).closest("div.space-y-2");
  const ps = field ? [...field.querySelectorAll(":scope > p")] : [];
  return ps[ps.length - 1]?.textContent ?? "";
};

/** 閉じた「入力について」の段。 */
const about = () => screen.getByText("入力について", { selector: "summary" }).closest("details")!;

describe("補足文は 1 行（30 字）まで", () => {
  it.each(["現在のゲージ", "次の回復まで", "周回ペース"])("「%s」", (label) => {
    render(<Harness />);
    const hint = hintOf(label);
    expect(hint.length).toBeGreaterThan(0);
    expect(hint.length).toBeLessThanOrEqual(30);
  });
});

// ★ 検分 #244 低-1: 短くしたときに「どこで読む値か」が落ちていた。読む場所（ゲーム内のゲージ画面）は補足に残す
// ★ 2026-11-25: 回さないときの扱い（30分で計算）は、ピッカーに最初から 30 が出ているので書かない（持ち主）
it("「次の回復まで」の補足は、値をどこで読むか（ゲージ画面）だけ", () => {
  render(<Harness />);
  const hint = hintOf("次の回復まで");
  expect(hint).toContain("ゲージ画面");
  expect(hint).toBe("ゲージ画面の残り時間");
});

/**
 * 「次の回復まで」のドラム式のピッカー（2026-11-25、持ち主「円のダイヤルは場所を取りすぎ・デザイン的に浮いている」）。
 * 0〜30 の数字が縦に並び、上下に回すと真ん中の段にスナップして選ばれる。見える段は 3 段（1 段 44px・高さ 132px）。
 * ★ キーボードと読み上げは、見えないネイティブの range が受ける（矢印・PageUp/PageDown・Home/End、読み上げ「12分」）。
 *   見えるドラムは指・マウスホイール・クリックで回す。値の持ち方（空＝30分で計算）と計算は前のまま
 */
describe("「次の回復まで」のピッカー", () => {
  const ROW = WHEEL_ROW;
  const slider = () => screen.getByRole("slider", { name: "次の回復まで" }) as HTMLInputElement;
  const rows = () => [...slider().parentElement!.querySelectorAll<HTMLElement>("[data-value]")];
  const row = (v: number) => rows().find((r) => r.dataset.value === String(v))!;
  const selected = () => rows().filter((r) => r.dataset.selected === "true").map((r) => r.dataset.value);
  const scroller = () => row(0).parentElement!;
  /** 全回復までの行（現在のゲージ 50% なら 減少 6 回 = 次の回復まで + 5 × 30 分）。 */
  const empty = () => /全回復まで\s*(\d+時間\d+分|\d+分)/.exec(document.body.textContent ?? "")?.[1];
  const wheel = (deltaY: number) => {
    const e = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
    // ホイールの受け口は addEventListener（passive: false）なので、fireEvent ではなく act で包んで送る
    act(() => {
      scroller().dispatchEvent(e);
    });
    return e.defaultPrevented;
  };

  it("0〜30 の段が上から順に並び、回していないときは 30 が真ん中（30分で計算）", () => {
    render(<Harness />);
    expect(rows().map((r) => r.textContent)).toEqual(Array.from({ length: 31 }, (_, i) => String(i)));
    expect(selected()).toEqual(["30"]);
    expect(slider().value).toBe("30");
    expect(slider().getAttribute("aria-valuetext")).toBe("30分");
    expect(scroller().scrollTop).toBe(30 * ROW);
  });

  it("段をクリックするとその分が選ばれ、真ん中へ回り、計算に入る", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("現在のゲージ"), { target: { value: "50" } });
    expect(empty()).toBe("3時間0分");
    fireEvent.click(row(12));
    expect(slider().getAttribute("aria-valuetext")).toBe("12分");
    expect(selected()).toEqual(["12"]);
    expect(scroller().scrollTop).toBe(12 * ROW);
    expect(empty()).toBe("2時間42分");
  });

  it("1 段は押せる高さの 44px（見える 3 段で 132px）", () => {
    render(<Harness />);
    expect(WHEEL_ROW).toBe(44);
    expect(row(12).className).toContain("h-11");
    expect(scroller().parentElement!.className).toContain("h-33");
  });

  it("回していないとき、出している 30 の段を押すと 30 が入る（回した状態になる）", () => {
    const set = vi.fn();
    function Spy() {
      const inputs = useGaugeInputs([]);
      const setNextDecay: typeof inputs.setNextDecay = (v) => {
        set(v);
        inputs.setNextDecay(v);
      };
      return <GaugeInputsPanel inputs={{ ...inputs, setNextDecay }} musics={[]} aliases={[]} loading={false} />;
    }
    render(<Spy />);
    fireEvent.click(row(30));
    expect(set).toHaveBeenCalledWith("30");
  });

  it("端: 0 と 30 を選べる", () => {
    render(<Harness />);
    fireEvent.click(row(0));
    expect(slider().getAttribute("aria-valuetext")).toBe("0分");
    expect(scroller().scrollTop).toBe(0);
    fireEvent.click(row(30));
    expect(slider().getAttribute("aria-valuetext")).toBe("30分");
  });

  it("指で回して止まった段（スクロール位置 ÷ 1 段の高さ）が選ばれる", () => {
    render(<Harness />);
    scroller().scrollTop = 7 * ROW + 12; // スナップの途中でも近い段
    fireEvent.scroll(scroller());
    expect(slider().getAttribute("aria-valuetext")).toBe("7分");
    expect(selected()).toEqual(["7"]);
  });

  it("スナップが段の途中で止まったら、止まって少し経ってから近い段にそろえる", () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      scroller().scrollTop = 7 * ROW + 5;
      fireEvent.scroll(scroller());
      expect(slider().getAttribute("aria-valuetext")).toBe("7分");
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(scroller().scrollTop).toBe(7 * ROW);
      expect(slider().getAttribute("aria-valuetext")).toBe("7分");
    } finally {
      vi.useRealTimers();
    }
  });

  it("キーボード（range の値が変わる）で選ぶと、ドラムもその段へ回る", () => {
    render(<Harness />);
    fireEvent.change(slider(), { target: { value: "13" } });
    expect(slider().getAttribute("aria-valuetext")).toBe("13分");
    expect(selected()).toEqual(["13"]);
    expect(scroller().scrollTop).toBe(13 * ROW);
    // range は 0〜30・1 刻み（矢印 ±1、Home/End で端はブラウザが受ける）
    expect([slider().min, slider().max, slider().step]).toEqual(["0", "30", "1"]);
  });

  it("マウスホイール 1 目盛りで 1 段。端の先へは回さず、ページのスクロールに渡す", () => {
    render(<Harness />);
    expect(wheel(100)).toBe(false); // 30 から下へ（端）
    expect(slider().getAttribute("aria-valuetext")).toBe("30分");
    expect(wheel(-100)).toBe(true);
    expect(slider().getAttribute("aria-valuetext")).toBe("29分");
    fireEvent.click(row(0));
    expect(wheel(-100)).toBe(false); // 0 から上へ（端）
    expect(wheel(100)).toBe(true);
    expect(slider().getAttribute("aria-valuetext")).toBe("1分");
  });

  it("トラックパッドの細かい量は 1 段の高さぶんたまったら 1 段", () => {
    render(<Harness />);
    fireEvent.click(row(10));
    wheel(15);
    wheel(15);
    expect(slider().getAttribute("aria-valuetext")).toBe("10分");
    wheel(15);
    expect(slider().getAttribute("aria-valuetext")).toBe("11分");
  });

  // ★ 持ち主 2026-11-25: 回していないときの断りの文は消す（ピッカーに 30 が出ている）
  it("全回復までの行に、回していないときの断りを出さない", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("現在のゲージ"), { target: { value: "50" } });
    expect(empty()).toBe("3時間0分");
    expect(document.body.textContent).not.toContain("回していない");
    expect(document.body.textContent).not.toContain("として計算）");
  });
});

describe("詳しい説明は閉じた「入力について」に残す（消さない）", () => {
  it("初めは閉じていて、3 項目の詳しい説明が入っている", () => {
    render(<Harness />);
    expect(about().open).toBe(false);
    const text = about().textContent ?? "";
    expect(text).toContain("ここからの残りを計算します");
    expect(text).toContain("ゲーム内のゲージ画面に出ている残り時間");
    expect(text).toContain("たった今プレイを止めた");
    expect(text).toContain("マッチング・支援者交代・ロード込み");
    expect(text).toContain("自分の環境に合わせて調整");
  });

  it("ゲージの欄を出さないページ（必要稼働時間）では、周回ペースの説明だけ", () => {
    render(<Harness showGauge={false} />);
    const text = about().textContent ?? "";
    expect(text).toContain("マッチング・支援者交代・ロード込み");
    expect(text).not.toContain("たった今プレイを止めた");
  });
});

/**
 * ライブの想定（みんなでライブの停止期間、2026-11-18）。選べるのはリフレッシュゲージだけ（liveChoice）。
 * ★ ひとりでライブのロスは実測前の仮の値。数字の近く（周回ペースの補足「既定33（仮）」）と、閉じた「入力について」の
 *   説明の 2 か所にだけ出す（検分 M-1、#263・#264 とそろえる）。札・固定バー・画像には出さない。
 *   数字は OVERHEAD_SEC.solo から出す（直書きしない）。
 * ★ このファイルは印を「止まっている」「仮の値」に固定する（vi.mock）。印を戻したときの側は
 *   RefreshGaugeCalculator.resumed.test.tsx（再開）と GaugeInputsPanel.measured.test.tsx（実測済み）が縛る。
 */
describe("ライブの想定（リフレッシュゲージだけ）", () => {
  function LiveHarness() {
    const inputs = useGaugeInputs([], { liveChoice: true });
    return <GaugeInputsPanel inputs={inputs} musics={[]} aliases={[]} loading={false} />;
  }
  const group = () => screen.getByRole("radiogroup", { name: "ライブの種類" });
  const radio = (name: string) => within(group()).getByRole("radio", { name });

  it("想定を選ばないページには切り替えも仮の値の断りも出ない", () => {
    render(<Harness />);
    expect(screen.queryByRole("radiogroup", { name: "ライブの種類" })).toBeNull();
    expect(hintOf("周回ペース")).toBe("既定28。長い曲は自動で少なくなります");
    expect(about().textContent).not.toContain("仮");
  });

  it("止まっている間はひとりでライブが選ばれている", () => {
    render(<LiveHarness />);
    expect(radio("ひとりでライブ").getAttribute("aria-checked")).toBe("true");
    expect(radio("みんなでライブ").getAttribute("aria-checked")).toBe("false");
  });

  // 検分 L-5: #263（みんなで周回が先）・#264（みんなで｜ひとりで）と並びをそろえる。既定は期間中ひとりでのまま
  it("並びは「みんなでライブ｜ひとりでライブ」", () => {
    render(<LiveHarness />);
    expect(within(group()).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "みんなでライブ",
      "ひとりでライブ",
    ]);
  });

  // 検分 L-9: 7 字のラベルなので compact。押せる高さは 44px（#264 と同じ min-h-11）
  it("切り替えは詰めて描き、押せる高さを 44px 取る", () => {
    render(<LiveHarness />);
    for (const r of within(group()).getAllByRole("radio")) {
      expect(r.className).toContain("text-xs");
      expect(r.className).toContain("min-h-11");
    }
  });

  it("ひとりでライブ: 補足は「既定N（仮）。…」で 30 字以内、「入力について」にも仮の値だと書く", () => {
    render(<LiveHarness />);
    fireEvent.click(radio("ひとりでライブ"));
    const hint = hintOf("周回ペース");
    expect(hint).toBe(`既定${SOLO_DEFAULT_RATE}（仮）。長い曲は自動で少なくなります`);
    expect(hint.length).toBeLessThanOrEqual(30);
    const text = about().textContent ?? "";
    expect(text).toContain(`${OVERHEAD_SEC.solo}秒`);
    expect(text).toContain("まだ実測していない仮の値");
    expect(text).not.toContain("マッチング");
  });

  it("みんなでライブ: 補足と説明は足す前と同じ（既定28・マッチング込み）", () => {
    render(<LiveHarness />);
    fireEvent.click(radio("みんなでライブ"));
    expect(hintOf("周回ペース")).toBe("既定28。長い曲は自動で少なくなります");
    const text = about().textContent ?? "";
    expect(text).toContain("マッチング・支援者交代・ロード込み");
    expect(text).not.toContain("仮の値");
  });

  it("どちらの想定でも、画面の文に「協力」と書かない", () => {
    render(<LiveHarness />);
    for (const name of ["ひとりでライブ", "みんなでライブ"]) {
      fireEvent.click(radio(name));
      expect(document.body.textContent).not.toContain("協力");
    }
  });
});
