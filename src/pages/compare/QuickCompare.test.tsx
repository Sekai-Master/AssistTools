/**
 * @vitest-environment jsdom
 *
 * 編成かんたん比較。打ち込んだ数字が、編成ビルダーと同じ計算（compareDecks）で並ぶことを縛る。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickCompare } from "./QuickCompare";
import { compareDecks } from "../deck/lib/compare";
import { OVERHEAD_BY_LIVE } from "../ranking/lib/efficiency";
import type { RankingMusic } from "../ranking/useRankingMusics";

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
afterEach(cleanup);
beforeEach(() => localStorage.clear());

// 独りんぼエンヴィー MASTER（public/MusicDatas の値）
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

const draw = () => render(<QuickCompare entries={[ENVY]} loading={false} error={null} />);

async function fill(name: string, values: [string, string, string, string]) {
  const user = userEvent.setup();
  const card = screen.getByRole("group", { name: `編成 ${name}` });
  const labels = ["総合力", "ボーナス(%)", "リーダー(%)", "内部値(%)"];
  for (const [i, label] of labels.entries()) {
    await user.type(within(card).getByLabelText(label), values[i]);
  }
}

// 2026-10-01 に Nori が比べた2つ（実効値 A 210%・B 212%）
const A = ["351149", "425", "150", "450"] as const;
const B = ["318699", "430", "150", "460"] as const;

describe("編成かんたん比較", () => {
  it("4つ入れた編成を、編成ビルダーと同じ計算で並べ、最良と差を出す", async () => {
    draw();
    await fill("A", [...A]);
    await fill("B", [...B]);

    const expected = compareDecks(
      [
        { name: "A", power: 351_149, bonus: 425, skillLeader: 150, skillTotal: 450 },
        { name: "B", power: 318_699, bonus: 430, skillLeader: 150, skillTotal: 460 },
      ],
      ENVY,
      { live: "multi", taki: 5, overheadSec: OVERHEAD_BY_LIVE.multi }
    );
    const table = screen.getByRole("table");
    const [rowA, rowB] = within(table).getAllByRole("row").slice(1);
    expect(rowA.textContent).toContain("A最良");
    expect(rowA.textContent).toContain((expected[0].eventPt as number).toLocaleString());
    expect(rowB.textContent).toContain((expected[1].eventPt as number).toLocaleString());
    const loss = ((expected[1].eventPt as number) / (expected[0].eventPt as number) - 1) * 100;
    expect(rowB.textContent).toContain(`${loss.toFixed(1)}%`);
  });

  it("ボーナスが低いほうが勝てば、そう言う（勝ち負けは総合力・スキルの差で付く）", async () => {
    draw();
    await fill("A", [...A]);
    await fill("B", [...B]);
    const note = screen.getByText("ボーナスが低い方が勝っています。").closest("p");
    expect(note?.textContent).toContain("「A」はボーナス 425%（B より");
    expect(note?.textContent).toContain("総合力・スキルの差で");
  });

  it("同じ名前の編成は、表で (2) を付けて見分ける", async () => {
    draw();
    const user = userEvent.setup();
    await fill("A", [...A]);
    await fill("B", [...B]);
    const nameB = within(screen.getByRole("group", { name: "編成 B" })).getByLabelText("編成の名前");
    await user.clear(nameB);
    await user.type(nameB, "A");
    const names = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.querySelector("td")?.textContent);
    expect(names).toEqual(["A最良", "A (2)"]);
  });

  it("協力の実効値（リーダー＋ほか4枚の2割）を、入れたその場で出す", async () => {
    draw();
    await fill("A", [...A]);
    expect(within(screen.getByRole("group", { name: "編成 A" })).getByText("実効値（協力） 210%")).toBeTruthy();
  });

  it("打ちかけには理由を出し、計算には混ぜない", async () => {
    draw();
    const user = userEvent.setup();
    await user.type(within(screen.getByRole("group", { name: "編成 A" })).getByLabelText("総合力"), "351149");
    expect(screen.getByText("4つとも入れると計算します")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("開き直しても、前の入力が残る", async () => {
    const first = draw();
    await fill("A", [...A]);
    first.unmount();
    draw();
    expect((within(screen.getByRole("group", { name: "編成 A" })).getByLabelText("総合力") as HTMLInputElement).value).toBe("351149");
  });

  it("編成を足せる・外せる", async () => {
    draw();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "＋ 編成を足す" }));
    expect(screen.getByRole("group", { name: "編成 C" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "C を外す" }));
    expect(screen.queryByRole("group", { name: "編成 C" })).toBeNull();
  });
});
