/**
 * @vitest-environment jsdom
 *
 * オートの入力をゲームの決まりに収める（2026-11-21 Nori 指摘）。
 *
 * ★ オートは 0 焚きができない（下限 1）。焚き数の state はモード間で共有なので、ひとりで・みんなでで 0 にしてから
 *   オートに切り替えたときも、オートでは 1 として扱い・表示する。ひとりで・みんなでの 0 焚きはゲームで可能なので変えない。
 * ★ オートの 1 日の回数はカラフルパスで決まる（lbRun.ts の PASS_LIMITS: なし／BASIC と DELUXE は 10、PRECIOUS は 99）。
 *   「今日の残りオート回数」「回数を指定」のプレイ回数は上限を超えない。パスを下げたら上限に収め、
 *   保存済みの値が上限を超えていても、計算と表示は上限で扱う。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EfficiencyRanking from "./EfficiencyRanking";
import type { RankingMusic } from "./useRankingMusics";

// 独りんぼエンヴィー MASTER（public/MusicDatas の値。EfficiencyRanking.test.tsx と同じ）
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

// 止まっている期間（ひとりで周回で開く）。印は本物と同じ true
vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));

const STORE_KEY = "sekai-master:ranking-inputs";

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

const tab = (name: string) => screen.getByRole("radio", { name });
/** 焚き数の欄（オートではまとめの欄、ひとりで・みんなでは自分の条件の欄。同時には 1 つしか出ない）。 */
const takiInput = () => screen.getByLabelText("焚き数") as HTMLInputElement;
const takiMinus = () => takiInput().parentElement!.querySelector("button")!;
/** ラベルの文で入力欄を引く（Field は htmlFor を持たない欄がある）。 */
const fieldOf = (label: string) =>
  [...document.querySelectorAll("label")].find((l) => l.textContent === label)!.closest("div.space-y-2")!;
const inputOf = (label: string) => fieldOf(label).querySelector("input")!;
const hintOf = (label: string) => fieldOf(label).querySelector("p")?.textContent ?? "";
const passSelect = () => screen.getByLabelText("カラフルパスのコース") as HTMLSelectElement;
/** 表のすぐ上の前提の 1 行（自分の条件のときは「自分の条件で計算：」で始まる）。 */
const premise = () => screen.getByText(/の場合$|^自分の条件で計算：/).textContent ?? "";
const body = () => document.body.textContent ?? "";
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("オートの焚き数は 1 から（0 焚きはできない）", () => {
  it("保存した焚き数が 0 でも、オートでは 1 と出し、計算も 1 焚き。下げるボタンは押せない", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, taki: 0 }));
    draw();
    fireEvent.click(tab("オート"));
    expect(takiInput().value).toBe("1");
    expect(takiMinus().disabled).toBe(true);
    expect(premise()).toContain("・1焚き・");
    expect(premise()).not.toContain("0焚き");
    // 既定の入口（ライボがなくなるまで）の換算の文も 1 焚き
    expect(body()).toContain("を 1焚きで、ライボ 25 がなくなるまで まわすと");
  });

  it("オートの欄に 0 を打っても 1 のまま", () => {
    draw();
    fireEvent.click(tab("オート"));
    type(takiInput(), "0");
    expect(takiInput().value).toBe("1");
    expect(premise()).toContain("・1焚き・");
  });

  it("ひとりでで 0 にしてからオートへ切り替えても 1。ひとりでに戻すと 0 のまま（ひとりで・みんなでは 0 焚きができる）", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
    draw();
    fireEvent.click(tab("ひとりで"));
    type(takiInput(), "0");
    expect(takiInput().value).toBe("0");
    expect(premise()).toContain("・0焚き・");

    fireEvent.click(tab("オート"));
    expect(takiInput().value).toBe("1");
    expect(premise()).toContain("・1焚き・");

    fireEvent.click(tab("ひとりで"));
    expect(takiInput().value).toBe("0");
    expect(premise()).toContain("・0焚き・");
  });

  it("オートの焚き数の補足に「1焚きから」と書く", () => {
    draw();
    fireEvent.click(tab("オート"));
    expect(hintOf("焚き数")).toContain("1焚きから");
  });
});

describe("オートの回数はカラフルパスの上限まで", () => {
  it("今日の残りオート回数に 150 を入れても、なし／BASIC は 10、PRECIOUS は 99 で止まる。空欄にはできる", () => {
    draw();
    fireEvent.click(tab("オート"));
    type(inputOf("今日の残りオート回数"), "150");
    expect(inputOf("今日の残りオート回数").value).toBe("10");
    fireEvent.change(passSelect(), { target: { value: "precious" } });
    type(inputOf("今日の残りオート回数"), "150");
    expect(inputOf("今日の残りオート回数").value).toBe("99");
    // 打ち直せるように、空欄はそのまま
    type(inputOf("今日の残りオート回数"), "");
    expect(inputOf("今日の残りオート回数").value).toBe("");
  });

  it("PRECIOUS で 50 にしてからパスを なし に下げると、10 に収める", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, pass: "precious", autoLeft: "50" }));
    draw();
    fireEvent.click(tab("オート"));
    expect(inputOf("今日の残りオート回数").value).toBe("50");
    fireEvent.change(passSelect(), { target: { value: "none" } });
    expect(inputOf("今日の残りオート回数").value).toBe("10");
  });

  it("保存した残り回数が上限を超えていても、上限で出して計算する（この時間で最大化）", () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ v: 2, autoFrom: "window", windowMin: "600", refill: true, autoLeft: "150" }),
    );
    draw();
    fireEvent.click(tab("オート"));
    expect(inputOf("今日の残りオート回数").value).toBe("10");
    expect(premise()).toContain("残り10回");
    expect(body()).toContain("どの曲でも残りオート10回を回り切ります");
  });

  it("回数を指定のプレイ回数も上限まで。保存値 100 は 10 で出して計算し、150 を入れても PRECIOUS は 99、なしに下げると 10", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, autoFrom: "plays", plays: "100" }));
    draw();
    fireEvent.click(tab("オート"));
    expect(inputOf("プレイ回数").value).toBe("10");
    expect(body()).toContain("を 5焚きで 10回 まわすと");
    fireEvent.change(passSelect(), { target: { value: "precious" } });
    type(inputOf("プレイ回数"), "150");
    expect(inputOf("プレイ回数").value).toBe("99");
    fireEvent.change(passSelect(), { target: { value: "none" } });
    expect(inputOf("プレイ回数").value).toBe("10");
  });

  it("何も保存していなければ、プレイ回数の既定は上限を超えない", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, autoFrom: "plays" }));
    draw();
    fireEvent.click(tab("オート"));
    expect(Number(inputOf("プレイ回数").value)).toBeLessThanOrEqual(10);
  });
});
