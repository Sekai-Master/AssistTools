/**
 * @vitest-environment jsdom
 *
 * 実効値計算機の「アンコールは誰が取るとよいか」の段。
 *
 * ★ 縛ること
 *   - 既定は閉じる（読まなくてよい人の邪魔をしない）。楽曲データ（428KB）は開くまで読まない
 *   - 入力は 1 つ（ほかの 4 人でいちばん高い実効値）。境目は「同じなら取りに行ってよい」
 *   - 総合力が無ければ点を出さず割合だけ
 *   - アンコールの決まり方を公式の仕様のように書かない（印と「公式の説明は見当たりません」）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RankingMusic } from "../ranking/useRankingMusics";

const hook = vi.hoisted(() => ({ calls: [] as boolean[], entries: [] as unknown[] }));

vi.mock("../ranking/useRankingMusics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ranking/useRankingMusics")>();
  return {
    ...actual,
    useRankingMusics: (enabled = true) => {
      hook.calls.push(enabled);
      return { entries: enabled ? hook.entries : [], loading: false, error: null };
    },
  };
});

import { EncoreAdvice } from "./EncoreAdvice";

afterEach(cleanup);

/** 独りんぼエンヴィー（ENVY_ID = 074）の EXPERT・MASTER を模した 2 行。アンコールの重みは EXPERT 0.15・MASTER 0.12。 */
const envy = (difficulty: string, encore: number): RankingMusic => ({
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty,
  playLevel: 22,
  noteCount: 544,
  baseScore: 1.1,
  skillScoreSolo: [0.07, 0.07, 0.07, 0.07, 0.07, 0.07],
  baseScoreAuto: 0.7,
  skillScoreAuto: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
  skillScoreMulti: [0.07, 0.07, 0.07, 0.07, 0.07, encore],
  feverScore: 0.1,
  musicTime: 74.8,
  eventRate: 100,
  jacketLink: "jacket_s_074.webp",
});

beforeEach(() => {
  hook.calls = [];
  hook.entries = [envy("expert", 0.15), envy("master", 0.12)];
});

const summary = () => screen.getByText("アンコールは誰が取るとよいか").closest("summary")!;
const details = () => summary().closest("details")!;
const open = async () => userEvent.click(summary());
const bestInput = () => screen.getByLabelText("ほかの 4 人でいちばん高い実効値");

describe("既定は閉じる", () => {
  it("段は閉じていて、楽曲データは読みに行かない", () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    expect(details().open).toBe(false);
    expect(hook.calls.every((c) => c === false)).toBe(true);
  });

  it("開くと楽曲データを読む", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    expect(details().open).toBe(true);
    expect(hook.calls.at(-1)).toBe(true);
  });
});

describe("判定", () => {
  it("ほかの 4 人の最高より下なら「譲るほうが…」", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    await userEvent.type(bestInput(), "280");
    expect(details().textContent).toContain("譲るほうが部屋の全員のスコアが上がります");
  });

  it("同じ値なら「取りに行ってよい」で、差は無い", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={300_000} />);
    await open();
    await userEvent.type(bestInput(), "262");
    expect(details().textContent).toContain("取りに行ってよい");
    expect(details().textContent).toContain("差はありません");
  });

  it("上なら「取りに行ってよい」", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    await userEvent.type(bestInput(), "250");
    expect(details().textContent).toContain("取りに行ってよい");
  });

  it("全角の数字も読む", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    await userEvent.type(bestInput(), "２８０");
    expect(details().textContent).toContain("譲るほうが");
  });

  it("空なら判定しない（0 として扱わない）", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    expect(details().textContent).not.toContain("取りに行ってよい");
    expect(details().textContent).not.toContain("譲るほうが");
  });

  it("負の値は判定せず、直し方を出す", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    await userEvent.type(bestInput(), "-5");
    expect(details().textContent).not.toContain("取りに行ってよい");
    expect(details().textContent).toContain("0 以上の数");
  });

  it("自分の実効値がまだ出ていなければ判定せず、案内する", async () => {
    render(<EncoreAdvice myEffective={null} myRange={null} power={null} />);
    await open();
    await userEvent.type(bestInput(), "280");
    expect(details().textContent).not.toContain("譲るほうが");
    expect(details().textContent).toContain("自分の実効値が出ると判定します");
  });

  it("候補が複数ある編成: 全部が下なら譲る（候補の幅と平均を書く）", async () => {
    render(<EncoreAdvice myEffective={262} myRange={[250, 270]} power={null} />);
    await open();
    await userEvent.type(bestInput(), "280");
    expect(details().textContent).toContain("候補 250〜270、平均 262");
    expect(details().textContent).toContain("譲るほうが");
  });

  it("候補が複数ある編成: 部屋の最高が候補の幅の中なら言い切らず、差も出さない", async () => {
    render(<EncoreAdvice myEffective={262} myRange={[250, 270]} power={300_000} />);
    await open();
    await userEvent.type(bestInput(), "260");
    const text = details().textContent ?? "";
    expect(text).toContain("候補によって分かれます");
    expect(text).not.toContain("取りに行ってよい");
    expect(text).not.toContain("譲るほうが");
    expect(text).not.toMatch(/[0-9,]+ ?点（/);
  });
});

describe("スコアの差の目安", () => {
  it("既定の曲は独りんぼエンヴィー（EXPERT）", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    expect(screen.getByRole("button", { name: /独りんぼエンヴィー/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "EXPERT" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("総合力が無ければ割合だけ（点は出さない）", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    await userEvent.type(bestInput(), "280");
    const text = details().textContent ?? "";
    expect(text).toMatch(/約 ?[0-9.]+%/);
    expect(text).not.toMatch(/[0-9,]+ ?点/);
  });

  it("総合力があれば点で出す（(280 − 262) × 0.15 ÷ 100 × 30 万 × 4 ≒ 32,400 点）", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={300_000} />);
    await open();
    await userEvent.type(bestInput(), "280");
    expect(details().textContent).toMatch(/32,(39[89]|40[0-2]) ?点/);
  });

  it("難易度を替えると、その難易度のアンコールの重みで出し直す（MASTER 0.12 → 25,920 点前後）", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={300_000} />);
    await open();
    await userEvent.type(bestInput(), "280");
    await userEvent.click(screen.getByRole("button", { name: "MASTER" }));
    expect(details().textContent).toMatch(/25,9(19|2[0-2]) ?点/);
  });
});

describe("差の文言", () => {
  it("自分のほうが高ければ「自分が取ると…上がります」（差は正の数で出す）", async () => {
    render(<EncoreAdvice myEffective={280} myRange={null} power={300_000} />);
    await open();
    await userEvent.type(bestInput(), "262");
    const text = details().textContent ?? "";
    expect(text).toMatch(/自分が取ると、1 人あたりのスコアが約 32,(39[89]|40[0-2]) 点/);
    expect(text).not.toContain("-");
  });

  it("総合力を使ったときは、その値を書く", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={300_000} />);
    await open();
    await userEvent.type(bestInput(), "280");
    expect(details().textContent).toContain("自分の総合力（30.0 万）");
  });

  it("協力の重みが無い曲は差を出さず、そう書く", async () => {
    hook.entries = [{ ...envy("expert", 0.15), skillScoreMulti: null }];
    render(<EncoreAdvice myEffective={262} myRange={null} power={300_000} />);
    await open();
    await userEvent.type(bestInput(), "280");
    expect(details().textContent).toContain("差を出せません");
    // 判定は出す
    expect(details().textContent).toContain("譲るほうが");
  });

  it("選んだ難易度が無い曲では、いちばん上の難易度で出す（EASY に落ちない）", async () => {
    hook.entries = [envy("easy", 0.05), envy("master", 0.12)];
    render(<EncoreAdvice myEffective={262} myRange={null} power={300_000} />);
    await open();
    expect(screen.getByRole("button", { name: "MASTER" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.type(bestInput(), "280");
    expect(details().textContent).toMatch(/25,9(19|2[0-2]) ?点/);
  });
});

describe("文言の確かさ", () => {
  it("決まり方に公式の説明が無いことを書き、出どころの印を付ける", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    const text = details().textContent ?? "";
    expect(text).toContain("公式の説明は見当たりません");
    expect(text).toContain("〔走っている人の実感〕");
    expect(text).toContain("〔プレイヤーの間で〕");
  });

  it("譲り方: 難易度を下げる（プレイヤーの間で）と、判定位置の調整（走っている人の実感）", async () => {
    render(<EncoreAdvice myEffective={262} myRange={null} power={null} />);
    await open();
    const text = details().textContent ?? "";
    expect(text).toMatch(/難易度を下げる[^〔]*〔プレイヤーの間で〕/);
    expect(text).toMatch(/判定[^〔]*〔走っている人の実感〕/);
  });
});
