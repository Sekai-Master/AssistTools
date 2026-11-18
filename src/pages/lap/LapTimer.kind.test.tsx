/**
 * @vitest-environment jsdom
 *
 * 周回ラップ計測の「ひとりでライブ」（みんなでライブが止まっている期間、2026-11-18〜）。
 *
 * ★ 止まっている期間の印（MULTI_LIVE_SUSPENDED）はここでは true に固定する。再開して false に戻しても、
 *   このファイルは「止まっている間はこう振る舞う」を縛り続ける（false の側は LapTimer.multi.test.tsx）。
 * ★ ひとりでライブのロスは Nori が実測するまで仮の値。期待する秒数は OVERHEAD_SEC.solo から読み、
 *   「仮」の印の有無も isProvisionalOverhead から決める（overhead.ts を直してもこのファイルは書き換えない）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LapTimer from "./LapTimer";
import { TAP_GUARD_MS } from "./useTapGuard";
import { LAP_STORAGE_KEY } from "./useLapTimer";
import { LAP_RUNS_KEY } from "./lib/runs";
import { initialState, isProvisionalOverhead, tap, toRun } from "./lib/lap";
import { OVERHEAD_SEC } from "../../lib/overhead";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));
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
const radio = (name: "みんなでライブ" | "ひとりでライブ") => screen.getByRole("radio", { name });
const checked = (name: "みんなでライブ" | "ひとりでライブ") => radio(name).getAttribute("aria-checked") === "true";
/** 曲と条件の段の見出し（計測中に畳んでも見える 1 行）。 */
const condSummary = () => document.querySelector("details > summary")!;
const later = () => {
  clock += TAP_GUARD_MS + 100;
};

async function oneLap(sec: number) {
  await userEvent.click(mainButton());
  clock += sec * 1000;
  await userEvent.click(mainButton());
}

describe("開いたときの種類", () => {
  it("止まっている間は、ひとりでライブで開く。曲の段の見出しにも出す", () => {
    draw();
    expect(checked("ひとりでライブ")).toBe(true);
    expect(checked("みんなでライブ")).toBe(false);
    expect(condSummary().textContent).toContain("ひとりでライブ");
  });

  it("種類を持たない古い保存でも、ひとりでライブで開き、保存値は書き換えない", () => {
    const old = JSON.stringify({ marks: [], laps: [], excluded: [], breaks: [], songId: "074", songTitle: "独りんぼエンヴィー", songSec: 74.8, ptPerRun: 0, taki: 8, pausedAt: null });
    localStorage.setItem(LAP_STORAGE_KEY, old);
    draw();
    expect(checked("ひとりでライブ")).toBe(true);
    expect(localStorage.getItem(LAP_STORAGE_KEY)).toBe(old);
  });

  it("選び直した種類はふだん通り保存され、開き直しても残る", async () => {
    draw();
    await userEvent.click(radio("みんなでライブ"));
    expect(checked("みんなでライブ")).toBe(true);
    expect(JSON.parse(localStorage.getItem(LAP_STORAGE_KEY)!).liveKind).toBe("multi");
    cleanup();
    draw();
    expect(checked("みんなでライブ")).toBe(true);
  });
});

describe("計測中は種類を変えない", () => {
  it("計測中・中断中は押しても変わらず、変えられないことを書く", async () => {
    draw();
    await userEvent.click(mainButton());
    later();
    await userEvent.click(radio("みんなでライブ")).catch(() => {});
    expect(checked("ひとりでライブ")).toBe(true);
    expect(radio("みんなでライブ").closest("fieldset")!.disabled).toBe(true);
    expect(document.body.textContent).toContain("計測中は変えられません");

    await userEvent.click(screen.getByRole("button", { name: "中断する" }));
    later();
    await userEvent.click(radio("みんなでライブ")).catch(() => {});
    expect(checked("ひとりでライブ")).toBe(true);
  });

  it("終了したら選び直せる（直後の押下は捨てる）", async () => {
    draw();
    await oneLap(100);
    later();
    await userEvent.click(screen.getByRole("button", { name: "終了して保存" }));
    expect(radio("みんなでライブ").closest("fieldset")!.disabled).toBe(false);
    clock += 200;
    await userEvent.click(radio("みんなでライブ"));
    expect(checked("ひとりでライブ")).toBe(true);
    later();
    await userEvent.click(radio("みんなでライブ"));
    expect(checked("みんなでライブ")).toBe(true);
  });
});

describe("ひとりでライブの目安", () => {
  it("比べる既定のロスは overhead.ts の solo。仮の値のうちは「仮」と書き、良し悪しを言わない", async () => {
    draw();
    await oneLap(SONG_SEC + OVERHEAD_SEC.solo + 20);
    const text = document.body.textContent ?? "";
    if (isProvisionalOverhead("solo")) {
      expect(text).toContain(`曲以外の秒数（既定 ${OVERHEAD_SEC.solo} 秒・仮）`);
      expect(text).toContain("まだ実測していません");
      expect(text).toContain("+20.0 秒");
      expect(text).not.toContain("余計にかかっています");
      expect(text).not.toContain("速く回せています");
    } else {
      expect(text).toContain(`曲以外の秒数（既定 ${OVERHEAD_SEC.solo} 秒）`);
      expect(text).toContain("20.0 秒ぶん余計にかかっています。");
    }
    expect(text).toContain(`ひとりでライブの見積りは ${OVERHEAD_SEC.solo} 秒`);
    // みんなでライブの既定（54 秒）とは比べない
    expect(text).not.toContain(`既定 ${OVERHEAD_SEC.multi} 秒`);
  });

  it("画面の文に「協力」「部屋落ち」を出さない", async () => {
    draw();
    await userEvent.click(screen.getByText("使い方", { selector: "summary" }));
    expect(screen.getByText("使い方", { selector: "summary" }).closest("details")!.textContent).not.toContain("部屋落ち");
    // 長すぎる区間の知らせ（曲長の 3 倍超）も出す
    await oneLap(SONG_SEC * 4);
    const text = document.body.textContent ?? "";
    expect(text).toContain("このままだと平均が壊れます");
    expect(text).not.toContain("協力");
    expect(text).not.toContain("部屋落ち");
  });
});

describe("保存した記録の種類", () => {
  it("新しい記録はひとりでライブとして残し、種類を持たない古い記録はみんなでライブと書く", async () => {
    const s0 = tap(tap(initialState(), 1), 100_001);
    const { liveKind: _drop, ...old } = toRun(s0, "old", 2)!;
    void _drop;
    localStorage.setItem(LAP_RUNS_KEY, JSON.stringify([old]));
    draw();
    await oneLap(SONG_SEC + OVERHEAD_SEC.solo);
    later();
    await userEvent.click(screen.getByRole("button", { name: "終了して保存" }));

    const saved = JSON.parse(localStorage.getItem(LAP_RUNS_KEY)!) as { id: string; liveKind?: string }[];
    expect(saved[0].liveKind).toBe("solo");
    const rows = screen.getByRole("heading", { name: "保存した記録" }).closest("section")!.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("ひとりでライブ");
    expect(rows[1].textContent).toContain("みんなでライブ");
  });
});
