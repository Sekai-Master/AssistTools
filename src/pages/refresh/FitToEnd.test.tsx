/**
 * @vitest-environment jsdom
 *
 * 休憩の「自動」と、最後の稼働の「イベ乙まで」の配線（2026-11-25、持ち主の決めた案 B。計算は lib/fitToEnd.test.ts が縛る）。
 * ★ 縛ること
 *   - 最後の稼働だけ「イベ乙まで」を選べる。自動の休憩が 1 つなら、イベ乙でちょうど 100%（ムダ 0）になる長さが入り、
 *     休んだ後の%も出る。総時間はイベ乙まで
 *   - 解けないとき（自動が 2 つ・最後がイベ乙までの稼働でない・イベ乙の時刻が分からない）は長さを「—」にするだけ
 *   - ひとりで／みんなでライブのどちらでも、その周回のロスで解く
 *   - 時間に戻すと解いた分を引き継ぐ。並べ替え・保存と呼び出しで決め方が残る
 *   - 自動もイベ乙までも使っていないときは、イベ乙の時刻を読まない
 * イベ乙の時刻は useEventSchedule を差し替えて渡す（開始時刻 20:00 から minutesToEnd 分後）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: false }));
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
const schedule = vi.hoisted(() => ({ value: null as { startAt: number; aggregateAt: number } | null, calls: 0 }));
vi.mock("./useEventSchedule", () => ({
  useEventSchedule: () => {
    schedule.calls++;
    return schedule.value;
  },
  forgetUpcoming: () => {},
}));

import PlanPage from "./PlanPage";
import { resetProfilesForTest } from "../../lib/profiles";
import { clockToMs } from "./lib/restUntilEnd";
import { parseClock, fmtDuration } from "./lib/format";
import { overheadForPace, SOLO_DEFAULT_RATE } from "./lib/liveAssumption";
import { resolveFitToEnd } from "./lib/fitToEnd";
import { type Segment, simulateTimeline } from "./lib/timeline";

const START = "20:00";
const TO_END = 4 * 24 * 60; // 4 日後のイベ乙
const MULTI_OH = overheadForPace("multi", "28");
const SOLO_OH = overheadForPace("solo", String(SOLO_DEFAULT_RATE));

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetProfilesForTest();
  schedule.calls = 0;
  const startAt = clockToMs(parseClock(START)!, Date.now());
  schedule.value = { startAt: startAt - 86_400_000, aggregateAt: startAt + TO_END * 60_000 };
});

const draw = () => {
  render(
    <MemoryRouter>
      <PlanPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("開始時刻"), { target: { value: START } });
  fireEvent.change(screen.getByLabelText("現在のゲージ"), { target: { value: "70" } });
};
const add = (name: "＋稼働" | "＋休憩") => fireEvent.click(screen.getByRole("button", { name }));
const playRows = () =>
  screen.queryAllByRole("radiogroup", { name: "稼働の長さの決め方" }).map((g) => g.closest("li")!);
const restRows = () =>
  screen.queryAllByRole("radiogroup", { name: "休憩の長さの決め方" }).map((g) => g.closest("li")!);
const choose = (row: Element, name: string) =>
  fireEvent.click(within(row as HTMLElement).getByRole("radio", { name }));
const optionsOf = (row: Element) => within(row as HTMLElement).getAllByRole("radio").map((r) => r.textContent);
const setHours = (row: Element, h: number, m = 0) => {
  fireEvent.change(within(row as HTMLElement).getByLabelText("時間"), { target: { value: String(h) } });
  fireEvent.change(within(row as HTMLElement).getByLabelText("分"), { target: { value: String(m) } });
};
const stat = (label: string) => screen.getByText(label, { selector: "div" }).parentElement!.textContent ?? "";
const chooseLive = (name: "ひとりでライブ" | "みんなでライブ") =>
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", { name }));

const play = (minutes: number, extra: Partial<Extract<Segment, { kind: "play" }>> = {}): Segment => ({
  id: `p${minutes}${extra.untilEnd ? "e" : ""}`,
  kind: "play",
  songId: "074",
  title: "独りんぼエンヴィー",
  jacketLink: "jacket_s_074.webp",
  refreshConstant: 84,
  songLengthSec: 74.8,
  minutes,
  ...extra,
});

/** 持ち主の組み方: 70% → 稼働 1時間 → 寝る 8時間（時間） → 稼働 3時間 → 休憩（自動） → 稼働（イベ乙まで） */
function build() {
  draw();
  add("＋稼働");
  add("＋休憩");
  add("＋稼働");
  add("＋休憩");
  add("＋稼働");
  setHours(restRows()[0], 8);
  setHours(playRows()[1], 3);
  choose(restRows()[1], "自動");
  choose(playRows()[2], "イベ乙まで");
}
/** 同じ組み方を lib で解いた、自動の休憩の分と休んだ後の%。 */
function expected(oh: number) {
  const segs: Segment[] = [
    play(60),
    { id: "sleep", kind: "rest", minutes: 480 },
    play(180),
    { id: "auto", kind: "rest", minutes: 30, fitToEnd: true },
    play(60, { untilEnd: true }),
  ];
  const fit = resolveFitToEnd(segs, { startPercent: 70, overheadSec: oh, startDecayProgress: 0, minutesToEnd: TO_END });
  const r = simulateTimeline(fit.segments, 70, oh);
  return { auto: r.points[3].minutes, afterAuto: r.points[3].endPercent, last: r.points[4].minutes };
}

describe("自動の休憩とイベ乙までの稼働", () => {
  it("「イベ乙まで」は最後の稼働だけに出る。休憩には「自動」が出る", () => {
    draw();
    add("＋稼働");
    add("＋休憩");
    add("＋稼働");
    expect(optionsOf(playRows()[0])).toEqual(["時間", "ゲージ"]);
    expect(optionsOf(playRows()[1])).toEqual(["時間", "ゲージ", "イベ乙まで"]);
    expect(optionsOf(restRows()[0])).toEqual(["時間", "ゲージ", "自動"]);
  });

  it.each([
    ["みんなでライブ", MULTI_OH],
    ["ひとりでライブ", SOLO_OH],
  ] as const)("%s: 自動の休憩にイベ乙で 100% ちょうどになる長さが入り、総時間はイベ乙まで・ムダ 0", (live, oh) => {
    build();
    chooseLive(live);
    const e = expected(oh);
    expect(e.auto).toBeGreaterThan(0);
    expect(restRows()[1].textContent).toContain(`${fmtDuration(e.auto)}→ ${e.afterAuto.toFixed(1)}%`);
    expect(playRows()[2].textContent).toContain(fmtDuration(e.last));
    expect(stat("総時間")).toContain(fmtDuration(TO_END));
    expect(stat("終了時刻")).toContain("20:00 (+4d)");
    expect(stat("ムダ時間")).toBe("ムダ時間0分無駄なし");
    expect(stat("終了ゲージ")).toMatch(/終了ゲージ(100\.0|99\.\d)%/);
  });

  it("自動が 2 つ: どちらも「—」（イベ乙までは残りを走る）", () => {
    build();
    choose(restRows()[0], "自動");
    expect(restRows()[0].textContent).toContain("—");
    expect(restRows()[1].textContent).toContain("—");
    expect(playRows()[2].textContent).not.toContain("—");
  });

  it("最後が「イベ乙まで」でない: 自動は「—」", () => {
    build();
    choose(playRows()[2], "時間");
    expect(restRows()[1].textContent).toContain("—");
  });

  it("イベ乙の時刻が分からない: 自動もイベ乙までも「—」", () => {
    schedule.value = null;
    build();
    expect(restRows()[1].textContent).toContain("—");
    expect(playRows()[2].textContent).toContain("—");
  });

  it("時間に戻すと、解いた分を時間の欄に引き継ぐ", () => {
    build();
    const e = expected(MULTI_OH);
    choose(restRows()[1], "時間");
    const row = restRows()[1] as HTMLElement;
    const auto = Math.round(e.auto);
    expect((within(row).getByLabelText("時間") as HTMLInputElement).value).toBe(String(Math.floor(auto / 60)));
    expect((within(row).getByLabelText("分") as HTMLInputElement).value).toBe(String(auto % 60));
  });

  it("イベ乙までの稼働の後ろにブロックを足すと、その稼働は時間に戻り、消すとまたイベ乙までになる", () => {
    build();
    add("＋休憩");
    expect(optionsOf(playRows()[2])).toEqual(["時間", "ゲージ"]);
    expect(restRows()[1].textContent).toContain("—");
    fireEvent.click(within(restRows()[2] as HTMLElement).getByRole("button", { name: "削除" }));
    expect(within(playRows()[2] as HTMLElement).getByRole("radio", { name: "イベ乙まで" }).getAttribute("aria-checked")).toBe("true");
    expect(restRows()[1].textContent).not.toContain("—");
  });

  it("保存と呼び出しで、自動とイベ乙までの決め方が残る", () => {
    build();
    fireEvent.change(screen.getByLabelText("プラン名"), { target: { value: "自動" } });
    fireEvent.click(screen.getByRole("button", { name: "この内容を保存" }));
    cleanup();
    draw();
    fireEvent.click(screen.getByRole("button", { name: "呼び出し" }));
    fireEvent.change(screen.getByLabelText("開始時刻"), { target: { value: START } });
    const checked = (row: Element) =>
      within(row as HTMLElement)
        .getAllByRole("radio")
        .find((r) => r.getAttribute("aria-checked") === "true")?.textContent;
    expect(checked(restRows()[1])).toBe("自動");
    expect(checked(playRows()[2])).toBe("イベ乙まで");
    expect(stat("ムダ時間")).toBe("ムダ時間0分無駄なし");
  });

  // ★ 下の「イベ乙までにあと合計…」の行も同じ読み口を使うので、1 回の描き直しで読み口を使う部品が増えるかで見る
  it("自動もイベ乙までも使っていないときは、イベ乙の時刻を読む部品を置かない", () => {
    draw();
    add("＋稼働");
    add("＋休憩");
    const rerender = () => {
      const before = schedule.calls;
      fireEvent.click(within(playRows()[0] as HTMLElement).getByRole("button", { name: "30分増やす" }));
      return schedule.calls - before;
    };
    const off = rerender();
    choose(restRows()[0], "自動");
    const on = rerender();
    expect(on).toBe(off + 1);
  });
});
