/**
 * @vitest-environment jsdom
 *
 * 「ひとりで」タブの並べ方「時間あたり」／「1回あたり」（2026-11-25）。
 *
 * ★ みんなでライブが止まって、ひとりでライブを手で叩いて走る人が多い。ライボが律速の人には
 *   1 回あたりのイベントPtが正しい軸。今までは 1 回あたりで並ぶのがオート（オートのスコア）のタブだけだった。
 * ★ 既定は「時間あたり」（今の挙動を変えない）。切り替えは保存し、URL（?tab=solo&by=play）からも開ける。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EfficiencyRanking from "./EfficiencyRanking";
import type { RankingMusic } from "./useRankingMusics";
import { DEFAULT_OVERHEAD_SEC, DEFAULT_PARAMS, rankSongs } from "./lib/efficiency";

// EfficiencyRanking.table.test.tsx と同じ実データ（public/MusicDatas の値）
const ENVY_MASTER: RankingMusic = {
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
const ENVY_EXPERT: RankingMusic = {
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty: "expert",
  playLevel: 22,
  noteCount: 544,
  baseScore: 1.109881,
  skillScoreSolo: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.104178],
  baseScoreAuto: 0.7595,
  skillScoreAuto: [0.048394, 0.049786, 0.05292, 0.053616, 0.043171, 0.070153],
  skillScoreMulti: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.148379],
  feverScore: 0.119139,
  musicTime: 74.8,
  eventRate: 100,
  jacketLink: "jacket_s_074.webp",
};
const TENCHI: RankingMusic = {
  musicId: "186",
  title: "初音天地開闢神話",
  difficulty: "master",
  playLevel: 33,
  noteCount: 2021,
  baseScore: 1.226808,
  skillScoreSolo: [0.018903, 0.030565, 0.045559, 0.023581, 0.047022, 0.049961],
  baseScoreAuto: 0.798,
  skillScoreAuto: [0.013047, 0.020572, 0.029834, 0.015006, 0.029923, 0.031794],
  skillScoreMulti: [0.018903, 0.030565, 0.045559, 0.023581, 0.070534, 0.049961],
  feverScore: 0.156391,
  musicTime: 182.4,
  eventRate: 130,
  jacketLink: "jacket_s_186.webp",
};
const ENTRIES = [ENVY_EXPERT, ENVY_MASTER, TENCHI];

vi.mock("./useRankingMusics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useRankingMusics")>()),
  useRankingMusics: () => ({ entries: ENTRIES, loading: false, error: null }),
}));

// 止まっている期間（ひとりでで開く）。印は本物と同じ true
vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));

const STORE_KEY = "sekai-master:ranking-inputs";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const draw = (url = "/ranking") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <EfficiencyRanking />
    </MemoryRouter>,
  );

const tab = (name: string) => screen.getByRole("radio", { name });
const byHour = () => screen.queryByRole("radio", { name: "時間効率優先" });
const byPlay = () => screen.queryByRole("radio", { name: "ライボ効率優先" });
const rows = () => [...document.querySelectorAll<HTMLElement>("[data-ranking-row]")];
const rowKeys = () => rows().map((r) => r.dataset.rankingRow);
const mainNumbers = () => rows().map((r) => r.querySelector("[data-main-number]")?.textContent ?? "");
const unit = () => document.querySelector("[data-ranking-unit]")?.textContent;
const fmt = (n: number) => Math.round(n).toLocaleString("ja-JP");
const stored = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
// タブの直後が見出し、その次が説明（EfficiencyRanking.test.tsx と同じたどり方）
const headline = () => tab("みんなで").closest('[role="radiogroup"]')!.nextElementSibling!;
const body = () => headline().nextElementSibling!.textContent ?? "";
const lossInput = () =>
  [...document.querySelectorAll("label")]
    .find((l) => l.textContent === "1曲あたりのロス（秒）")!
    .parentElement!.querySelector("input")!;

const SOLO_PARAMS = { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.solo };
/** 時間あたりの行（今までの並び）。 */
const hourRows = () => rankSongs(ENTRIES, SOLO_PARAMS, "solo");
/**
 * 1 回あたりの答え合わせ（実装とは別に書く）: 1 プレイの Pt の降順、同点は曲が短い順・ID 順（既存の並べ方と同じ）。
 */
const playRows = () =>
  [...hourRows()].sort(
    (a, b) =>
      b.eventPt - a.eventPt ||
      (a.musicTime ?? 0) - (b.musicTime ?? 0) ||
      a.musicId.localeCompare(b.musicId),
  );
const firstPerSong = <T extends { musicId: string }>(list: T[]) =>
  list.filter((r, i) => list.findIndex((x) => x.musicId === r.musicId) === i);
const keys = (list: { musicId: string; difficulty: string }[]) => list.map((r) => `${r.musicId}-${r.difficulty}`);

describe("並べ方の切り替え", () => {
  it("ひとりでタブに出て、既定は「時間あたり」（今の並び・Pt/時 のまま）", () => {
    draw();
    expect(tab("ひとりで").getAttribute("aria-checked")).toBe("true");
    expect(byHour()?.getAttribute("aria-checked")).toBe("true");
    expect(byPlay()?.getAttribute("aria-checked")).toBe("false");
    expect(unit()).toBe("Pt/時");
    expect(headline().textContent).toBe("ひとりでライブ・時間あたりのイベントポイント");
    expect(rowKeys()).toEqual(keys(firstPerSong(hourRows())));
    expect(mainNumbers()).toEqual(firstPerSong(hourRows()).map((r) => fmt(r.ptPerHour)));
  });

  it("閉じた段（絞り込み）の中ではなく、開いてすぐ見える所にある", () => {
    draw();
    expect(byPlay()!.closest("details")).toBeNull();
  });

  it("「1回あたり」で、主役の数字が Pt/回 になり、並びも Pt/回 の降順になる", () => {
    draw();
    // 時間あたりでは短い独りんぼが上、1 回あたりでは長尺の初音天地開闢神話が上（並びが入れ替わる形）
    expect(rowKeys()[0]?.startsWith("074-")).toBe(true);
    fireEvent.click(byPlay()!);
    expect(byPlay()!.getAttribute("aria-checked")).toBe("true");
    expect(unit()).toBe("Pt/回");
    expect(rowKeys()).toEqual(keys(firstPerSong(playRows())));
    expect(rowKeys()[0]).toBe("186-master");
    expect(mainNumbers()).toEqual(firstPerSong(playRows()).map((r) => fmt(r.eventPt)));
  });

  it("「1回あたり」では、行の小さな字に Pt/時 を回し、1 回の Pt は 2 回出さない", () => {
    draw();
    fireEvent.click(byPlay()!);
    const top = playRows()[0];
    const sub = rows()[0].querySelector("[data-sub]")?.textContent ?? "";
    expect(sub).toContain(`1時間 ${fmt(top.ptPerHour)}Pt`);
    expect(sub).not.toContain(`1回 ${fmt(top.eventPt)}Pt`);
    // 回/時 まで並べると 390px で内訳が次の行へ折れる（本番の字体で撮影して確認）ので出さない
    expect(sub).not.toContain("回/時");
    // 時間あたりに戻すと今までの小さな字
    fireEvent.click(byHour()!);
    const first = hourRows()[0];
    const back = rows()[0].querySelector("[data-sub]")?.textContent ?? "";
    expect(back).toContain(`1回 ${fmt(first.eventPt)}Pt`);
    expect(back).not.toContain("1時間");
  });

  it("「1回あたり」では見出しと説明（26 字以内）が 1 回あたりの文になる", () => {
    draw();
    fireEvent.click(byPlay()!);
    expect(headline().textContent).toBe("ひとりでライブ・1回あたりのイベントポイント");
    expect(body()).toContain("ライボ");
    expect(body().length).toBeGreaterThan(0);
    expect(body().length).toBeLessThanOrEqual(26);
  });

  it("「この数字について」に 1 回あたりの話がある", () => {
    draw();
    const about = screen.getByText("この数字について").closest("details")!.textContent ?? "";
    expect(about).toContain("ひとりでライブ・1回あたりのイベントポイント");
    expect(about).toContain("オートのタブより");
  });

  it("ほかのタブには切り替えが出ない（戻ると選んでいた並べ方のまま）", () => {
    draw();
    fireEvent.click(byPlay()!);
    for (const name of ["みんなで", "オート", "チャレライ"]) {
      fireEvent.click(tab(name));
      expect(byHour()).toBeNull();
      expect(byPlay()).toBeNull();
    }
    // ほかのタブの単位は今までどおり
    fireEvent.click(tab("オート"));
    expect(unit()).toBe("Pt/回");
    fireEvent.click(tab("みんなで"));
    expect(unit()).toBe("Pt/時");
    expect(headline().textContent).toBe("みんなでライブ・時間あたりのイベントポイント");
    fireEvent.click(tab("ひとりで"));
    expect(byPlay()!.getAttribute("aria-checked")).toBe("true");
    expect(rowKeys()[0]).toBe("186-master");
  });
});

describe("1回あたりでも絞り込みがそのまま効く", () => {
  it("難易度ごとに全部並べると、rankSongs の行が Pt/回 順に全部並ぶ", () => {
    draw();
    fireEvent.click(byPlay()!);
    fireEvent.click(screen.getByRole("checkbox", { name: "難易度ごとに全部並べる" }));
    expect(rowKeys()).toEqual(keys(playRows()));
  });

  it("難易度の絞り込みの中で 1 曲 1 行（MASTER を外すと独りんぼは EXPERT、初音天地は消える）", () => {
    draw();
    fireEvent.click(byPlay()!);
    fireEvent.click(screen.getByRole("button", { name: "MASTER" }));
    expect(rowKeys()).toEqual(["074-expert"]);
  });

  it("譜面レベルの上限で絞れる（上限 26 で初音天地 33 は消える）", () => {
    draw();
    fireEvent.click(byPlay()!);
    // ENTRIES のレベルは 22〜33。上限は入力の初期値 99 なので、まず 33 に収まってから 26 まで下げる
    const down = () => fireEvent.click(screen.getByRole("button", { name: "上限を下げる" }));
    down();
    for (let i = 0; i < 7; i++) down();
    expect(rowKeys()).not.toContain("186-master");
    expect(rowKeys()[0]?.startsWith("074-")).toBe(true);
  });
});

describe("保存と復元", () => {
  it("切り替えは保存し、開き直しても残る。ほかの入力を保存しても消えない", () => {
    draw();
    fireEvent.click(byPlay()!);
    expect(stored().soloBy).toBe("play");
    fireEvent.click(screen.getByRole("button", { name: "下限を上げる" }));
    expect(stored().soloBy).toBe("play");
    cleanup();
    draw();
    expect(byPlay()!.getAttribute("aria-checked")).toBe("true");
    expect(rowKeys()[0]).toBe("186-master");
    fireEvent.click(byHour()!);
    expect(stored().soloBy).toBe("hour");
  });

  it("保存値が不正なら既定（時間あたり）に戻す", () => {
    for (const soloBy of ["minute", 1, null, true, "PLAY"]) {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, soloBy }));
      draw();
      expect(byHour()!.getAttribute("aria-checked")).toBe("true");
      expect(unit()).toBe("Pt/時");
      cleanup();
    }
  });

  it("古い版の保存値（v が違う）は読まない", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, soloBy: "play" }));
    draw();
    expect(byHour()!.getAttribute("aria-checked")).toBe("true");
  });
});

describe("URL からの直接表示", () => {
  it("?tab=solo&by=play で、ひとりで・1回あたりが開く", () => {
    draw("/ranking?tab=solo&by=play");
    expect(tab("ひとりで").getAttribute("aria-checked")).toBe("true");
    expect(byPlay()!.getAttribute("aria-checked")).toBe("true");
    expect(unit()).toBe("Pt/回");
    expect(rowKeys()).toEqual(keys(firstPerSong(playRows())));
  });

  it("URL の指定は保存値より優先する（どちら向きでも）", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, soloBy: "hour" }));
    draw("/ranking?by=play");
    expect(byPlay()!.getAttribute("aria-checked")).toBe("true");
    cleanup();
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, soloBy: "play" }));
    draw("/ranking?tab=solo&by=hour");
    expect(byHour()!.getAttribute("aria-checked")).toBe("true");
  });

  it("URL の指定は保存しない（開き直すと保存値・既定のまま）", () => {
    draw("/ranking?tab=solo&by=play");
    expect(stored().soloBy).toBeUndefined();
    cleanup();
    draw();
    expect(byHour()!.getAttribute("aria-checked")).toBe("true");
  });

  it("?tab= で 4 つのタブを開ける（今は開けなかったオートも）", () => {
    for (const [value, name] of [
      ["manual", "みんなで"],
      ["solo", "ひとりで"],
      ["auto", "オート"],
      ["challenge", "チャレライ"],
    ]) {
      draw(`/ranking?tab=${value}`);
      expect(tab(name).getAttribute("aria-checked")).toBe("true");
      cleanup();
    }
  });

  it("不正なクエリは無視して、いつもどおり開く", () => {
    for (const url of ["/ranking?tab=hitori&by=time", "/ranking?tab=&by=", "/ranking?tab=SOLO&by=PLAY"]) {
      draw(url);
      expect(tab("ひとりで").getAttribute("aria-checked")).toBe("true");
      expect(byHour()!.getAttribute("aria-checked")).toBe("true");
      expect(unit()).toBe("Pt/時");
      cleanup();
    }
  });

  it("?tab=auto で開いても、自分の条件のロスはオートの既定（みんなでの値を持ち込まない）。手で入れた値は残す", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
    draw("/ranking?tab=auto");
    expect(lossInput().value).toBe(String(DEFAULT_OVERHEAD_SEC.auto));
    cleanup();
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true, overhead: "40" }));
    draw("/ranking?tab=auto");
    expect(lossInput().value).toBe("40");
  });
});
