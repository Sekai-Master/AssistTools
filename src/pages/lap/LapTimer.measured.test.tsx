/**
 * @vitest-environment jsdom
 *
 * Nori がひとりでライブのロスを実測して、overhead.ts の SOLO_OVERHEAD_PROVISIONAL を false にした後の画面。
 *
 * ★ 直した後の側が初めて動くのは Nori が overhead.ts を直したときで、そこで赤くなると一番困る。
 *   ここで印を false にして先に通しておく（印が true の側は LapTimer.kind.test.tsx）。
 * ★ solo の値はいまのまま（仮の値と同じ）にしておく。実測がたまたま同じ値でも、印が false なら「仮」を出さないことを縛る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LapTimer from "./LapTimer";
import { OVERHEAD_SEC } from "../../lib/overhead";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));
vi.mock("../../lib/overhead", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/overhead")>();
  return { ...mod, SOLO_OVERHEAD_PROVISIONAL: false };
});
vi.mock("../analyzer/useAnalyzerMusics", () => ({
  useAnalyzerMusics: () => ({ musics: [], aliases: [], loading: false, error: null }),
}));

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

describe("ひとりでライブのロスを実測した後（仮の印が false）", () => {
  it("計測前の種類の補足から「仮」が消える", () => {
    draw();
    const text = document.body.textContent ?? "";
    expect(text).toContain(`曲以外の秒数の既定 ${OVERHEAD_SEC.solo} 秒`);
    expect(text).not.toContain("仮");
  });

  it("計測中は「仮」を書かず、みんなでライブと同じ言い方で比べる", async () => {
    draw();
    await userEvent.click(mainButton());
    clock += (SONG_SEC + OVERHEAD_SEC.solo + 20) * 1000;
    await userEvent.click(mainButton());
    const text = document.body.textContent ?? "";
    expect(text).toContain(`曲以外の秒数（既定 ${OVERHEAD_SEC.solo} 秒）`);
    expect(text).toContain(`ひとりでライブの見積りは ${OVERHEAD_SEC.solo} 秒`);
    expect(text).toContain("20.0 秒ぶん余計にかかっています。");
    expect(text).not.toContain("仮");
  });
});
