/**
 * @vitest-environment jsdom
 *
 * 効率曲ランキングの説明の置き場（UX 監査 2026-11-12、PR-4）。
 *
 * ★ 表の前の黄色の注意枠（129 字）は 1 行に縮める。要る事実「1枠補正と巻き込みを含まない」「2〜5枠の実感に近い」は残し、
 *   「効率難易度」との違いなどの詳しい話は「この数字について」へ移す（消さない）。
 * ★ 「この数字について」（約 730 字）は開いたままだったので、閉じた段にする。見出しだけで中身が分かる言い方にする。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EfficiencyRanking from "./EfficiencyRanking";
import type { RankingMusic } from "./useRankingMusics";

// 独りんぼエンヴィー MASTER（public/MusicDatas の値。QuickCompare.test.tsx と同じ）
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

afterEach(cleanup);

const draw = () =>
  render(
    <MemoryRouter>
      <EfficiencyRanking />
    </MemoryRouter>,
  );

/** el がどこかの閉じた <details> の中（summary を除く）にあるか。 */
const folded = (el: Element) => {
  if (el.closest("summary")) return false;
  const d = el.closest("details");
  return d != null && !d.open;
};

describe("表の前の注意枠", () => {
  it("1 行（26 字以内）に縮め、「1枠補正と巻き込みを含まない」「2〜5枠」は畳まずに残す", () => {
    draw();
    const box = [...document.querySelectorAll("p.bg-amber-50")].find((p) => p.textContent?.includes("1枠補正"))!;
    expect(box).toBeTruthy();
    const text = box.textContent ?? "";
    // スマホ（390px）で 1 行に収まる長さ（text-xs で約 25 字）
    expect(text.length).toBeLessThanOrEqual(26);
    expect(text).toContain("巻き込み");
    expect(text).toContain("2〜5枠");
    expect(folded(box)).toBe(false);
  });
});

describe("この数字について", () => {
  const about = () => screen.getByText("この数字について").closest("details");

  it("閉じた段で、見出しに中身（式・AP 前提）が書いてある", () => {
    draw();
    const details = about();
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    const summary = details!.querySelector("summary")!.textContent ?? "";
    expect(summary).toContain("式");
    expect(summary).toContain("AP");
    // 検分 #245 低-1: 注意枠から移した「効率難易度」との違いも、見出しで分かるように
    expect(summary).toContain("効率難易度との違い");
  });

  it("中身は消さない。注意枠から移した「効率難易度」との違いも入っている", () => {
    draw();
    const text = about()!.textContent ?? "";
    expect(text).toContain("全ノーツPERFECT（AP）を前提にした理論値です");
    expect(text).toContain("協力ライブの活躍ボーナス");
    expect(text).toContain("効率難易度");
    expect(text).toContain("1枠を取って巻き込みまで決める場合は低い難易度がもっと強くなることがあり");
  });
});
