/**
 * @vitest-environment jsdom
 *
 * 周回ラップ計測の「みんなでライブ」の側（みんなでライブが再開した後＝MULTI_LIVE_SUSPENDED が false のとき）。
 *
 * ★ ひとりでライブを足しても、みんなでライブの数字は 1 つも変えない（solo-period-2026-11 の決まり）。
 *   「数字が今まで通り」の縛りは、種類を選べるようにする前の画面でも緑になる形で書いた（前後で同じことを確かめる）。
 * ★ 止まっている期間の印は、ここでは false に固定する。Nori が再開して false に戻しても、止まっている間の縛り
 *   （LapTimer.kind.test.tsx は true に固定）と合わせて、どちらの既定もテストが書き換えずに通る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LapTimer from "./LapTimer";
import { TAP_GUARD_MS } from "./useTapGuard";
import { OVERHEAD_SEC } from "../../lib/overhead";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: false }));
vi.mock("../analyzer/useAnalyzerMusics", () => ({
  useAnalyzerMusics: () => ({ musics: [], aliases: [], loading: false, error: null }),
}));

/** 既定の曲（独りんぼエンヴィー）の長さ。lib/lap.ts の DEFAULT_SONG。 */
const SONG_SEC = 74.8;

let clock = 1_000_000;
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
const mainButton = () => screen.getByTestId("lap-main-button");

/** 計測を始めて、sec 秒の 1 周を記録する。 */
async function oneLap(sec: number) {
  await userEvent.click(mainButton());
  clock += sec * 1000;
  await userEvent.click(mainButton());
}

describe("みんなでライブの数字は今まで通り", () => {
  it("オーバーヘッドの既定は overhead.ts の multi、差の言い方も今まで通り", async () => {
    draw();
    // 曲以外が既定より 20 秒長い 1 周
    await oneLap(SONG_SEC + OVERHEAD_SEC.multi + 20);
    const text = document.body.textContent ?? "";
    expect(text).toContain(`曲以外の秒数（既定 ${OVERHEAD_SEC.multi} 秒）`);
    expect(text).toContain("20.0 秒ぶん余計にかかっています。");
    // 時速（周/時）は 3600 ÷ 平均ラップ
    expect(text).toContain((3600 / (SONG_SEC + OVERHEAD_SEC.multi + 20)).toFixed(1));
  });
});

describe("再開した後（止まっている期間の印が false）", () => {
  it("開いたときはみんなでライブ", () => {
    draw();
    expect(screen.getByRole("radio", { name: "みんなでライブ" }).getAttribute("aria-checked")).toBe("true");
  });

  it("画面の文に「協力」を出さない（みんなでライブの名前で書く）", async () => {
    draw();
    await oneLap(SONG_SEC + OVERHEAD_SEC.multi + 20);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("協力");
    expect(text).toContain(`みんなでライブで ${OVERHEAD_SEC.multi} 秒`);
  });

  it("使い方の「部屋落ち」はみんなでライブでは残す", async () => {
    draw();
    await userEvent.click(screen.getByText("使い方", { selector: "summary" }));
    expect(screen.getByText("使い方", { selector: "summary" }).closest("details")!.textContent).toContain("部屋落ち");
  });

  it("状態が変わった直後の押下では種類を切り替えない（時間を過ぎれば切り替わる）", async () => {
    draw();
    await oneLap(100);
    clock += TAP_GUARD_MS + 100;
    await userEvent.click(screen.getByRole("button", { name: "終了して保存" }));
    clock += 200;
    await userEvent.click(screen.getByRole("radio", { name: "ひとりでライブ" }));
    expect(screen.getByRole("radio", { name: "みんなでライブ" }).getAttribute("aria-checked")).toBe("true");
    clock += TAP_GUARD_MS + 100;
    await userEvent.click(screen.getByRole("radio", { name: "ひとりでライブ" }));
    expect(screen.getByRole("radio", { name: "ひとりでライブ" }).getAttribute("aria-checked")).toBe("true");
  });
});
