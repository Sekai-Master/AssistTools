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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EfficiencyRanking from "./EfficiencyRanking";
import type { RankingMusic } from "./useRankingMusics";
import { DEFAULT_OVERHEAD_SEC } from "./lib/efficiency";

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

/**
 * ひとりで周回（2026-11-18〜 みんなでライブが止まったイベント向け）。
 *
 * ★ 既存の3つのタブのラベルは変えない。新しい説明には公式名「ひとりでライブ」を使い、「協力」と書かない。
 */
describe("ひとりで周回", () => {
  // EfficiencyRanking.tsx の STORE_KEY。保存の鍵は変えない（変えると既存の利用者の入力が消える）。
  const STORE_KEY = "sekai-master:ranking-inputs";
  afterEach(() => localStorage.clear());

  const tab = (name: string) => screen.getByRole("radio", { name });
  // タブの直後の段落が見出し、その次が説明
  const headline = () => tab("手動周回").closest('[role="radiogroup"]')!.nextElementSibling!;
  const body = () => headline().nextElementSibling!.textContent ?? "";

  it("タブは4つ。既存の3つのラベルは変えず、手動周回の隣に足す", () => {
    draw();
    const group = tab("手動周回").closest('[role="radiogroup"]') as HTMLElement;
    expect(within(group).getAllByRole("radio").map((b) => b.textContent)).toEqual([
      "手動周回",
      "ひとりで周回",
      "オート周回",
      "チャレライ",
    ]);
  });

  it("選ぶと「ひとりでライブ」の時間あたりPtの説明になり、「協力」と書かない。長さは他のタブ並み", () => {
    draw();
    const others = ["手動周回", "オート周回", "チャレライ"].map((name) => {
      fireEvent.click(tab(name));
      return body().length;
    });
    fireEvent.click(tab("ひとりで周回"));
    expect(tab("ひとりで周回").getAttribute("aria-checked")).toBe("true");
    expect(headline().textContent).toBe("ひとりでライブ・時間あたりのイベントポイント");
    expect(headline().textContent + body()).not.toContain("協力");
    expect(body().length).toBeLessThanOrEqual(Math.max(...others));
  });

  it("自分の条件で計算するとき、焚き数を入れられ、ロスの補足は「表示にだけ使う」と言わない", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
    draw();
    fireEvent.click(tab("ひとりで周回"));
    const labels = [...document.querySelectorAll("label")].map((l) => l.textContent);
    expect(labels).toContain("焚き数");
    expect(labels).toContain("1曲あたりのロス（秒）");
    // このタブではロスが順位を動かす。オート用の「所要時間の表示にだけ使う」は嘘になる
    expect(screen.queryByText(/所要時間の表示にだけ使う/)).toBeNull();
    expect(screen.getByText("ロード・リザルトの合計")).toBeTruthy();
  });

  it("触っていないロス（手動周回の既定 54）はタブの既定へ差し替え、手で入れた値は残す", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true, overhead: "54" }));
    draw();
    fireEvent.click(tab("ひとりで周回"));
    const input = () =>
      [...document.querySelectorAll("label")]
        .find((l) => l.textContent === "1曲あたりのロス（秒）")!
        .parentElement!.querySelector("input")!;
    expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.solo));
    expect(input().value).not.toBe("54");
    cleanup();

    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true, overhead: "40" }));
    draw();
    fireEvent.click(tab("ひとりで周回"));
    expect(input().value).toBe("40");
  });

  it("保存値に知らない mode・古い版・壊れた JSON が入っていても落ちずに手動周回で開く", () => {
    const blobs = [
      JSON.stringify({ v: 2, mode: "solo-legacy", overhead: "54" }),
      JSON.stringify({ v: 1, mode: "solo" }),
      "{broken",
    ];
    for (const raw of blobs) {
      localStorage.setItem(STORE_KEY, raw);
      draw();
      expect(tab("手動周回").getAttribute("aria-checked")).toBe("true");
      cleanup();
    }
  });
});
