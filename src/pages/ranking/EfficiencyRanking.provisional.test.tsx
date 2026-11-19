/**
 * @vitest-environment jsdom
 *
 * ひとりで周回のロスの「仮」は、印（SOLO_OVERHEAD_PROVISIONAL）だけで決まる（2026-11-19 検分 R6）。
 *
 * ★ Nori が実測の前に別の仮の値（例 40 秒）へ替えても、印が立っていれば「仮」と出す。
 *   「印かつ値が 33」のような判定だと、ここで「仮」が消えてしまう。値は overhead.ts を差し替えてずらす。
 *   （値はモジュールを読んだときに決まるので、ほかのテストとは別のファイルにしている）
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EfficiencyRanking from "./EfficiencyRanking";
import type { RankingMusic } from "./useRankingMusics";
import { DEFAULT_OVERHEAD_SEC } from "./lib/efficiency";

// 独りんぼエンヴィー MASTER（EfficiencyRanking.test.tsx と同じ）
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

vi.mock("./useRankingMusics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useRankingMusics")>()),
  useRankingMusics: () => ({ entries: [ENVY], loading: false, error: null }),
}));

// 止まっている期間（ひとりで周回で開く）として見る
vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));

// ひとりでライブのロスを 33 以外の仮の値にし、印は立てたまま
vi.mock("../../lib/overhead", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/overhead")>();
  return {
    ...actual,
    OVERHEAD_SEC: { ...actual.OVERHEAD_SEC, solo: 40 },
    SOLO_OVERHEAD_PROVISIONAL: true,
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const draw = () =>
  render(
    <MemoryRouter>
      <EfficiencyRanking />
    </MemoryRouter>,
  );

describe("ひとりで周回のロスが 33 以外の仮の値でも、印が立っていれば「仮」と出す", () => {
  it("前提の値がずれていることの確認（このファイルの差し替えが効いている）", () => {
    expect(DEFAULT_OVERHEAD_SEC.solo).toBe(40);
  });

  it("入力なしの順位の前提に「ロス 40秒（仮）」と出す", () => {
    draw();
    expect(screen.getByRole("radio", { name: "ひとりで" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/の場合$/).textContent).toContain("ロス40秒（仮）");
  });

  it("自分の条件の「1曲あたりのロス」の補足に、既定の 40 秒が仮の値だと書く", () => {
    localStorage.setItem("sekai-master:ranking-inputs", JSON.stringify({ v: 2, custom: true }));
    draw();
    expect(screen.getByText("ロード・リザルトの合計。既定の40秒はまだ測っていない仮の値")).toBeTruthy();
  });
});
