/**
 * @vitest-environment jsdom
 *
 * オートの段の「1回のPt」「1回の所要」の補足文が、空欄のときに実際に使う値を指していること。
 *
 * ★ 空欄のときに使うのは「オートで回す曲」（未選択なら効率 1 位、useAutoConfig の selected）。
 *   補足文は「上の曲から」と書いていたが、周回プランで「上の曲」はページ上部の手動の曲
 *   （ポイント設定の「『上の曲』を選んで下の『＋稼働』で…」）を指す呼び名で、
 *   オートの計算には使っていない。広い画面では「オートで回す曲」は左にあり上ですらない。
 *   処理は 2d6c28c（「1回のPtは曲＋難易度から自動計算」）から意図どおりなので、文を処理に合わせた
 *   （UX 監査 2026-11-12）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AutoPanel } from "./AutoPanel";
import type { AutoConfig } from "./useAutoConfig";

afterEach(cleanup);

/** オート候補が 1 つ出ている状態（曲データを読み終えたあと）。 */
function fakeConfig(over: Partial<AutoConfig> = {}): AutoConfig {
  const option = { key: "074:master", label: "独りんぼエンヴィー　MASTER", eventPt: 69125, cycleSec: 104.8 };
  return {
    course: "none",
    setCourse: vi.fn(),
    usedToday: "0",
    setUsedToday: vi.fn(),
    taki: 10,
    setTaki: vi.fn(),
    songKey: option.key,
    setSongKey: vi.fn(),
    skillLeader: "",
    setSkillLeader: vi.fn(),
    skillTotal: "",
    setSkillTotal: vi.fn(),
    ptOverride: "",
    setPtOverride: vi.fn(),
    hasOverride: false,
    cycleOverride: "",
    setCycleOverride: vi.fn(),
    hasCycleOverride: false,
    options: [option],
    selected: option,
    enabled: true,
    loading: false,
    error: null,
    runtime: { cycleSec: option.cycleSec, ptPerPlay: option.eventPt, taki: 10, dailyCap: 10, usedToday: 0 },
    ...over,
  };
}

/** 候補が 1 つも無い状態（初回・読み込み中・読めなかった）。値を足すのは呼ぶ側。 */
const noCandidate = (over: Partial<AutoConfig> = {}) =>
  fakeConfig({
    songKey: "",
    options: [],
    selected: undefined,
    runtime: { cycleSec: 0, ptPerPlay: 0, taki: 10, dailyCap: 10, usedToday: 0 },
    ...over,
  });

/** 赤字（text-rose-600）の要素の文。 */
const redTexts = () => [...document.querySelectorAll(".text-rose-600")].map((e) => e.textContent ?? "");

/** 入力欄のすぐ下の補足文（Field の hint）。 */
const hintOf = (label: string) =>
  screen.getByLabelText(label).closest("div.space-y-2")?.querySelector("p")?.textContent ?? "";

describe.each(["1回のPt", "1回の所要"])("「%s」の補足文", (label) => {
  it("空欄のときに使う「オートで回す曲」を名指しする", () => {
    render(<AutoPanel config={fakeConfig()} />);
    // 使っている曲の欄が実際にこの名前で出ていること（名指しする先が画面にある）
    expect(screen.getByLabelText("オートで回す曲")).toBeTruthy();
    expect(hintOf(label)).toContain("「オートで回す曲」");
  });

  it("「上の曲」とは書かない（ページ上部の手動の曲と取り違える）", () => {
    render(<AutoPanel config={fakeConfig()} />);
    expect(hintOf(label)).not.toContain("上の曲");
  });
});

/**
 * ★ 初回の赤字の警告（UX 監査 2026-11-12、PR-5）。候補が空になる理由は 3 つあり、どれも利用者の誤りではない。
 *   ① 休憩にオートを付けていない（useAutoConfig の enabled が false で、楽曲データを読まない）＝ 初回はこれ
 *   ② 付けた直後で、楽曲データを読み込み中
 *   ③ 読めなかった（通信の失敗など）
 *   前はどれでも「曲を選ぶか『1回の所要』を入れてください…」を赤字で出していた。赤字は利用者の入力に問題があるときだけ
 *   （「1回の所要」「1回のPt」に数字でないものが入っている）にする。
 */
describe("候補が無いときの案内", () => {
  it("① 休憩にオートを付けていない初回は、赤字を出さず落ち着いた 1 行", () => {
    render(<AutoPanel config={noCandidate({ enabled: false })} />);
    expect(redTexts()).toEqual([]);
    expect(document.body.textContent).toContain("休憩に「オート」を付けると");
  });

  it("② 読み込み中は「読み込み中」と出し、赤字を出さない", () => {
    render(<AutoPanel config={noCandidate({ loading: true })} />);
    expect(redTexts()).toEqual([]);
    expect(document.body.textContent).toContain("読み込み中");
    expect(document.body.textContent).not.toContain("休憩に「オート」を付けると候補が出ます");
  });

  it("③ 読めなかったときは赤字でなく、「1回のPt」「1回の所要」を入れれば計算できると案内する", () => {
    render(<AutoPanel config={noCandidate({ error: "楽曲データの取得に失敗しました" })} />);
    expect(redTexts()).toEqual([]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("楽曲データを読めませんでした");
    // 周期が無いと回数が 0 のままなので、Pt だけでなく所要も要る（ef4db7f）
    expect(text).toMatch(/「1回のPt」[^。]*「1回の所要」/);
  });

  it("「1回の所要」に数字でないものが入っているときは、赤字で知らせる（利用者の入力の問題）", () => {
    render(<AutoPanel config={noCandidate({ error: "x", cycleOverride: "abc", hasCycleOverride: false })} />);
    expect(redTexts().join("")).toContain("「1回の所要」");
  });

  it("「1回のPt」に数字でないものが入っているときも、赤字で知らせる", () => {
    render(<AutoPanel config={fakeConfig({ ptOverride: "abc", hasOverride: false })} />);
    expect(redTexts().join("")).toContain("「1回のPt」");
  });

  it("候補があり値がそろっていれば、赤字は出ない（1回の Pt と周期の要約）", () => {
    render(<AutoPanel config={fakeConfig()} />);
    expect(redTexts()).toEqual([]);
    expect(document.body.textContent).toContain("1周期 105秒");
  });
});
