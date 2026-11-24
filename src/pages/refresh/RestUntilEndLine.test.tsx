/**
 * @vitest-environment jsdom
 *
 * 「イベ乙までに、あと合計何分休めば 100% ちょうど」の 1 行の配線（計算は lib/restUntilEnd.test.ts が縛る）。
 *
 * ★ 縛ること
 *   - リフレッシュゲージは「いま」（現在のゲージ・次の回復まで・いまの時刻）から、上の曲とライブの想定で出す
 *   - 周回プランは積んだタイムラインの終わり（開始時刻 + 総時間・終わりのゲージ・繰り越しのタイマー）から出す
 *   - イベ乙の時刻は同じオリジンの /api/border/current の aggregateAt。回が終わっている・読めないときは出さない
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));
vi.mock("./lib/planCanvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/planCanvas")>()),
  drawPlanCanvas: vi.fn(async () => {}),
}));
// 独りんぼエンヴィー（既定の曲。定数は実測の 84）
vi.mock("../analyzer/useAnalyzerMusics", () => ({
  useAnalyzerMusics: () => ({
    musics: [
      {
        id: "074",
        title: "独りんぼエンヴィー",
        basePoint: 100,
        basePointSource: "verified",
        musicTime: 74.8,
        jacketLink: "jacket_s_074.webp",
      },
    ],
    aliases: [],
    loading: false,
    error: null,
  }),
}));

import RefreshGaugeCalculator from "./RefreshGaugeCalculator";
import PlanPage from "./PlanPage";
import { forgetCurrentBorder } from "../hub/useCurrentBorder";
import { forgetUpcoming } from "./useEventSchedule";
import { resetProfilesForTest } from "../../lib/profiles";
import { overheadForPace, SOLO_DEFAULT_RATE } from "./lib/liveAssumption";
import { clockToMs, restUntilEnd, restUntilEndText } from "./lib/restUntilEnd";
import { type Segment, simulateTimeline } from "./lib/timeline";

/** 2026-11-24 20:50 JST */
const NOW = Date.UTC(2026, 10, 24, 11, 50);
/** 227 の集計 11/29 20:59:59 JST */
const AGGREGATE_AT = Date.UTC(2026, 10, 29, 11, 59, 59);
const SOLO_OH = overheadForPace("solo", String(SOLO_DEFAULT_RATE));

/** 227 の始まり 11/25 15:00 JST */
const START_227 = Date.UTC(2026, 10, 25, 6, 0);

/** /api/border/current の回（開催中として、始まりは 4 日前） */
function snapshot(aggregateAt: number) {
  return {
    event: {
      id: 227,
      name: "Leo/need Memories",
      type: "marathon",
      unit: "light_sound",
      startAt: NOW - 96 * 3_600_000,
      aggregateAt,
      durationHours: 102,
    },
    checkedAt: NOW,
    sampleAt: NOW,
    progress: 0.1,
    predicted: false,
    ranks: [{ rank: 100, current: 1, predicted: null, low: null, high: null, confidence: null, visible: false }],
  };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** current も upcoming も同じ応答（current で出せる場面用） */
function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(body, status)),
  );
}

/** current と upcoming を別々に返す */
function serveBoth(current: [unknown, number], upcoming: [unknown, number]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (String(url).endsWith("/upcoming") ? json(...upcoming) : json(...current))),
  );
}
const fetchedUrls = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0]));

async function settle() {
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
/** 文がちょうどこの 1 行の <p> */
const line = (text: string) => screen.queryByText((_, el) => el?.tagName === "P" && el.textContent === text);
const anyLine = () => screen.queryByText((_, el) => el?.tagName === "P" && /イベ乙/.test(el.textContent ?? ""));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  forgetCurrentBorder();
  forgetUpcoming();
  resetProfilesForTest();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("リフレッシュゲージ（いまから）", () => {
  const draw = () =>
    render(
      <MemoryRouter>
        <RefreshGaugeCalculator />
      </MemoryRouter>,
    );

  it("現在 70%・いまの時刻・既定の曲（ひとりでライブ）で、イベ乙までの休憩の 1 行を出す", async () => {
    serve(snapshot(AGGREGATE_AT));
    draw();
    type(screen.getByLabelText("現在のゲージ"), "70");
    await settle();
    const r = restUntilEnd({
      startPercent: 70,
      decayProgressMin: 0,
      minutesLeft: (AGGREGATE_AT - NOW) / 60_000,
      refreshConstant: 84,
      songLengthSec: 74.8,
      overheadSec: SOLO_OH,
    });
    expect(r?.kind).toBe("rest");
    const text = restUntilEndText(r!, "11/29 20:59");
    expect(text.startsWith("イベ乙（11/29 20:59）までに、あと合計 ")).toBe(true);
    expect(line(text)).toBeTruthy();
  });

  it("開催中なら次の回（/upcoming）は読まない", async () => {
    serve(snapshot(AGGREGATE_AT));
    draw();
    await settle();
    expect(anyLine()).toBeTruthy();
    expect(fetchedUrls().some((u) => u.endsWith("/upcoming"))).toBe(false);
  });

  it("回が終わっていれば次の回（/upcoming）のイベ乙で出す。始まる前は、起点を次の回の始まり（11/25 15:00）にする", async () => {
    serveBoth(
      [snapshot(NOW - 60 * 60_000), 200],
      [{ event: { id: 227, name: "Leo/need Memories", startAt: START_227, aggregateAt: AGGREGATE_AT } }, 200],
    );
    draw();
    type(screen.getByLabelText("現在のゲージ"), "70");
    await vi.waitFor(() => expect(fetchedUrls().some((u) => u.endsWith("/api/border/upcoming"))).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const r = restUntilEnd({
      startPercent: 70,
      decayProgressMin: 0,
      minutesLeft: (AGGREGATE_AT - START_227) / 60_000,
      refreshConstant: 84,
      songLengthSec: 74.8,
      overheadSec: SOLO_OH,
    });
    expect(line(restUntilEndText(r!, "11/29 20:59"))).toBeTruthy();
  });

  it("回が終わっていて次の回が分からない（/upcoming が 404）なら出さない", async () => {
    serveBoth([snapshot(NOW - 60 * 60_000), 200], [{ error: "no upcoming event" }, 404]);
    draw();
    await vi.waitFor(() => expect(fetchedUrls().some((u) => u.endsWith("/upcoming"))).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByRole("heading", { name: "この曲で走ると" })).toBeTruthy();
    expect(anyLine()).toBeNull();
  });

  it("読めなければ出さない", async () => {
    serve({ error: "no data yet" }, 404);
    draw();
    await settle();
    expect(anyLine()).toBeNull();
  });
});

describe("周回プラン（タイムラインの終わりから）", () => {
  const draw = () =>
    render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );

  it("開始 21:00 から 1 時間走った終わり（22:00・終わりのゲージ）から出す。積む前は出さない", async () => {
    serve(snapshot(AGGREGATE_AT));
    draw();
    type(screen.getByLabelText("現在のゲージ"), "70");
    type(screen.getByLabelText("開始時刻"), "21:00");
    expect(anyLine()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /＋稼働/ }));
    await settle();

    const play: Segment = {
      id: "p",
      kind: "play",
      songId: "074",
      title: "独りんぼエンヴィー",
      jacketLink: "",
      refreshConstant: 84,
      songLengthSec: 74.8,
      minutes: 60,
    };
    const sim = simulateTimeline([play], 70, SOLO_OH, 0);
    // 開始時刻の日付の決め方（いまの 1 時間前から先）は lib の試験が縛る。ここは 21:00 + 60 分を同じ決め方で出す
    const endMs = clockToMs(21 * 60, NOW) + 60 * 60_000;
    const r = restUntilEnd({
      startPercent: sim.finalPercent,
      decayProgressMin: sim.points[0].decayProgressMin,
      minutesLeft: (AGGREGATE_AT - endMs) / 60_000,
      refreshConstant: 84,
      songLengthSec: 74.8,
      overheadSec: SOLO_OH,
    });
    expect(r?.kind).toBe("rest");
    expect(line(restUntilEndText(r!, "11/29 20:59"))).toBeTruthy();
  });

  it("開始 21:00 のまま 22:01 を過ぎても、開始の日付は翌日へ飛ばない（行は変わらない）", async () => {
    // 1 分ごとの描き直し（setInterval）も進める
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
    serve(snapshot(AGGREGATE_AT));
    draw();
    type(screen.getByLabelText("現在のゲージ"), "70");
    type(screen.getByLabelText("開始時刻"), "21:00");
    fireEvent.click(screen.getByRole("button", { name: /＋稼働/ }));
    await settle();
    const before = anyLine()?.textContent;
    expect(before).toMatch(/^イベ乙（11\/29 20:59）までに/);
    await act(async () => {
      vi.advanceTimersByTime(71 * 60_000); // 22:01
    });
    expect(anyLine()?.textContent).toBe(before);
  });

  it("積む・消すで行が出入りしても、5 分以内に読んだ回があれば読み直さない", async () => {
    serve(snapshot(AGGREGATE_AT));
    draw();
    type(screen.getByLabelText("現在のゲージ"), "70");
    fireEvent.click(screen.getByRole("button", { name: /＋稼働/ }));
    await settle();
    expect(anyLine()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "クリア" }));
    expect(anyLine()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /＋稼働/ }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(anyLine()).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
