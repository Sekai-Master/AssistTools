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
function fakeConfig(): AutoConfig {
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
    loading: false,
    error: null,
    runtime: { cycleSec: option.cycleSec, ptPerPlay: option.eventPt, taki: 10, dailyCap: 10, usedToday: 0 },
  };
}

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
