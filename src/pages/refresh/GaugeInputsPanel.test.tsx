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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GaugeInputsPanel } from "./GaugeInputsPanel";
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
it("「次の回復まで」の補足は、値をどこで読むか（ゲージ画面）と回さないときの扱いを言う", () => {
  render(<Harness />);
  const hint = hintOf("次の回復まで");
  expect(hint).toContain("ゲージ画面");
  expect(hint).toContain("回さなければ30分");
});

// ★ 検分 #279 L: ダイヤルにしたので「未入力」ではなく「回していない」と言う。回すと消える
it("全回復までの行の断りは、ダイヤルを回していないときだけ出す", () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("現在のゲージ"), { target: { value: "50" } });
  expect(document.body.textContent).toContain("（「次の回復まで」を回していないので、30分として計算）");
  expect(document.body.textContent).not.toContain("未入力");
  fireEvent.change(screen.getByRole("slider", { name: "次の回復まで" }), { target: { value: "12" } });
  expect(document.body.textContent).not.toContain("回していない");
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
