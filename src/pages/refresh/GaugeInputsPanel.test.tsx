/**
 * @vitest-environment jsdom
 *
 * ゲージ系の共通の入力（リフレッシュゲージ・周回プラン・必要稼働時間の 3 ページ）の補足文。
 *
 * ★ 縛るのは「入力欄の下の補足は 1 行（約 30 字）まで、詳しい説明は閉じた段に畳む（消さない）」
 *   （UX 監査 2026-11-12、指示書の共通の型 2・3。docs/design-system.md 7 節）。
 *   前は 3 本で 27＋49＋74 字あり、同じ文が 3 ページに出ていた。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GaugeInputsPanel } from "./GaugeInputsPanel";
import { useGaugeInputs } from "./useGaugeInputs";

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
