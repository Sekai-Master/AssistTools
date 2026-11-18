/**
 * @vitest-environment jsdom
 *
 * Nori がひとりでライブのロスを実測して overhead.ts の `solo` を直した後の画面。
 *
 * ★ LapTimer.kind.test.tsx の「仮」の縛りは、いまの仮の値の側しか通らない。直した後の側が初めて動くのは
 *   Nori が overhead.ts を直したときで、そこで赤くなると一番困る。ここで solo を仮の値からずらして先に通しておく。
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
  return { ...mod, OVERHEAD_SEC: { ...mod.OVERHEAD_SEC, solo: mod.OVERHEAD_SEC.solo + 8 } };
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

describe("ひとりでライブのロスを実測した後", () => {
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
