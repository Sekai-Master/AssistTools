/**
 * @vitest-environment jsdom
 *
 * ひとりでライブのロスの「仮」は、印（SOLO_OVERHEAD_PROVISIONAL）だけで決まる（2026-11-19 検分 R6）。
 *
 * ★ Nori が実測の前に別の仮の値（例 40 秒）へ替えても、印が立っていれば「仮」と出す。
 *   「印かつ値が 33」のような判定だと、ここで「仮」が消えてしまう。
 * ★ 値は、画面が読む OVERHEAD_BY_LIVE.solo を直接ずらす（この PR の木では OVERHEAD_SEC.challenge を、
 *   #263 が入った後は OVERHEAD_SEC.solo を読むので、overhead.ts を差し替えるとどちらの木かで結果が変わる）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickCompare } from "./QuickCompare";
import { OVERHEAD_BY_LIVE } from "../ranking/lib/efficiency";
import type { RankingMusic } from "../ranking/useRankingMusics";

vi.mock("../ranking/lib/efficiency", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ranking/lib/efficiency")>();
  return { ...actual, OVERHEAD_BY_LIVE: { ...actual.OVERHEAD_BY_LIVE, solo: 40 } };
});
// 止まっている期間（ひとりでで開く）・印は立てたまま
vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));
vi.mock("../../lib/overhead", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/overhead")>()),
  SOLO_OVERHEAD_PROVISIONAL: true,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// 独りんぼエンヴィー MASTER（QuickCompare.test.tsx と同じ）
const ENVY: RankingMusic = {
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty: "master",
  playLevel: 26,
  noteCount: 589,
  baseScore: 1.13309,
  skillScoreSolo: [0.073695, 0.064296, 0.070625, 0.082429, 0.069849, 0.085787],
  baseScoreAuto: 0.7735,
  skillScoreAuto: [0.051586, 0.044845, 0.048948, 0.056569, 0.047483, 0.057741],
  skillScoreMulti: [0.073695, 0.064296, 0.070625, 0.082429, 0.069849, 0.128681],
  feverScore: 0.140221,
  musicTime: 74.8,
  eventRate: 100,
  jacketLink: "jacket_s_074.webp",
};

describe("ひとりでライブのロスが 33 以外の仮の値でも、印が立っていれば「仮」と出す", () => {
  it("前提の値がずれていることの確認（このファイルの差し替えが効いている）", () => {
    expect(OVERHEAD_BY_LIVE.solo).toBe(40);
  });

  it("断り書きは「40 秒（ひとりでライブはまだ測っていない仮の値）」", async () => {
    render(<QuickCompare entries={[ENVY]} loading={false} error={null} />);
    expect(screen.getByRole("radio", { name: "ひとりで" }).getAttribute("aria-checked")).toBe("true");
    const user = userEvent.setup();
    const card = screen.getByRole("group", { name: "編成 A" });
    for (const [label, v] of [
      ["総合力", "351149"],
      ["ボーナス(%)", "425"],
      ["リーダー(%)", "150"],
      ["内部値(%)", "450"],
    ] as const) {
      await user.type(within(card).getByLabelText(label), v);
    }
    expect(screen.getByText(/オーバーヘッドは/).textContent).toContain("40 秒（ひとりでライブはまだ測っていない仮の値）");
  });
});
