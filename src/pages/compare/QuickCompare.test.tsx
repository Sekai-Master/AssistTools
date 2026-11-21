/**
 * @vitest-environment jsdom
 *
 * 編成かんたん比較。打ち込んだ数字が、編成ビルダーと同じ計算（compareDecks）で並ぶことを縛る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickCompare } from "./QuickCompare";
import { compareDecks } from "../deck/lib/compare";
import { OVERHEAD_BY_LIVE } from "../ranking/lib/efficiency";
import type { RankingMusic } from "../ranking/useRankingMusics";

// みんなでライブが止まっている期間の印。既定は本物と同じ true。テストごとに差し替える。
const suspension = vi.hoisted(() => ({ value: true }));
vi.mock("../../lib/liveSuspension", () => ({
  get MULTI_LIVE_SUSPENDED() {
    return suspension.value;
  },
}));

// ひとりでライブのロスが仮の値かの印。既定は本物と同じ true。値（OVERHEAD_SEC）は本物のまま使う。
const provisional = vi.hoisted(() => ({ value: true }));
vi.mock("../../lib/overhead", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/overhead")>();
  return {
    ...actual,
    get SOLO_OVERHEAD_PROVISIONAL() {
      return provisional.value;
    },
  };
});

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
afterEach(() => {
  cleanup();
  suspension.value = true;
  provisional.value = true;
});
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
  // ふだん（みんなでライブが動いている）の振る舞い。停止期間の既定は下の describe で見る。
  beforeEach(() => {
    suspension.value = false;
  });

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
    expect(within(screen.getByRole("group", { name: "編成 A" })).getByText("実効値（みんなでライブ） 210%")).toBeTruthy();
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

/**
 * ライブ種別の呼び方と、みんなでライブの停止期間（2026-11-18〜）の既定。
 *
 * ★ 公式名に合わせて「みんなで／ひとりで／オート」。画面の文に「協力」と書かない。
 * ★ 止まっている間は ひとりでライブで開く。古い保存値（みんなでライブ）は書き換えない。
 *   止まっている間に選び直した種類は、ふだんどおり保存して次も使う。
 */
describe("ライブ種別（みんなで／ひとりで／オート）", () => {
  const KEY = "quickCompare:v1";
  const radio = (name: string) => screen.getByRole("radio", { name });
  const saved = () => JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
  const ROW = { id: "r1", name: "A", power: "351149", bonus: "425", leader: "150", total: "450" };

  it("選べるのは みんなで・ひとりで・オート。画面の文に「協力」が無い", async () => {
    draw();
    await fill("A", [...A]);
    const group = radio("みんなで").closest('[role="radiogroup"]') as HTMLElement;
    expect(within(group).getAllByRole("radio").map((b) => b.textContent)).toEqual(["みんなで", "ひとりで", "オート"]);
    expect(document.body.textContent ?? "").not.toContain("協力");
    expect(document.body.textContent ?? "").not.toContain("ソロ");
  });

  it("止まっている間は ひとりでライブで開き、計算も ひとりでライブ（ロスは OVERHEAD_BY_LIVE.solo）", async () => {
    draw();
    expect(radio("ひとりで").getAttribute("aria-checked")).toBe("true");
    await fill("A", [...A]);
    const [expected] = compareDecks(
      [{ name: "A", power: 351_149, bonus: 425, skillLeader: 150, skillTotal: 450 }],
      ENVY,
      { live: "solo", taki: 5, overheadSec: OVERHEAD_BY_LIVE.solo }
    );
    const [row] = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(row.textContent).toContain((expected.eventPt as number).toLocaleString());
  });

  it("古い保存値が みんなでライブ でも ひとりでライブで開き、保存値は書き換えない", async () => {
    localStorage.setItem(KEY, JSON.stringify({ rows: [ROW], live: "multi", taki: 5 }));
    draw();
    expect(radio("ひとりで").getAttribute("aria-checked")).toBe("true");
    expect(saved().live).toBe("multi");
    // ほかの入力を触って保存し直しても、ライブ種別は前の保存値のまま
    const user = userEvent.setup();
    await user.type(within(screen.getByRole("group", { name: "編成 A" })).getByLabelText("総合力"), "0");
    expect(saved().live).toBe("multi");
  });

  it("保存値が無いときは、既定の ひとりで を保存しない（再開したら みんなでライブ で開くように）", () => {
    draw();
    expect(saved().live).toBeUndefined();
  });

  it("止まっている間に みんなで を選び直したら保存し、次に開いたときも みんなで", async () => {
    localStorage.setItem(KEY, JSON.stringify({ rows: [ROW], live: "multi", taki: 5 }));
    const first = draw();
    const user = userEvent.setup();
    await user.click(radio("みんなで"));
    expect(saved()).toMatchObject({ live: "multi", liveInSuspension: true });
    first.unmount();
    draw();
    expect(radio("みんなで").getAttribute("aria-checked")).toBe("true");
  });

  // ★ 2026-11-19 検分 R7: すでに選ばれている側を押しただけで保存すると、見た目は何も変わらないのに
  //   「止まっている間に選び直した ひとりで」が残り、再開後もひとりでで開いてしまう。
  it("すでに選ばれている側を押しても保存しない（値が変わったときだけ保存する）", async () => {
    localStorage.setItem(KEY, JSON.stringify({ rows: [ROW], live: "multi", taki: 5 }));
    draw();
    const user = userEvent.setup();
    await user.click(radio("ひとりで"));
    expect(radio("ひとりで").getAttribute("aria-checked")).toBe("true");
    expect(saved().live).toBe("multi");
    expect(saved().liveInSuspension).toBeUndefined();
  });

  it("保存値がオートなら、止まっている間もオートで開く", () => {
    localStorage.setItem(KEY, JSON.stringify({ rows: [ROW], live: "auto", taki: 5 }));
    draw();
    expect(radio("オート").getAttribute("aria-checked")).toBe("true");
  });

  it("再開したら（印が false）、保存値の みんなでライブ で開く", () => {
    suspension.value = false;
    localStorage.setItem(KEY, JSON.stringify({ rows: [ROW], live: "multi", taki: 5 }));
    draw();
    expect(radio("みんなで").getAttribute("aria-checked")).toBe("true");
  });

  it("ひとりでライブのロスは「実測値」と言わず、仮の値と書く。みんなで・オートは実測値のまま", async () => {
    draw();
    await fill("A", [...A]);
    const note = () => screen.getByText(/オーバーヘッドは/).textContent ?? "";
    expect(note()).toContain(`${OVERHEAD_BY_LIVE.solo} 秒`);
    expect(note()).toContain("仮");
    expect(note()).not.toContain("実測値");
    const user = userEvent.setup();
    await user.click(radio("みんなで"));
    expect(note()).toContain(`${OVERHEAD_BY_LIVE.multi} 秒（ライブ種別ごとの実測値）`);
    await user.click(radio("オート"));
    expect(note()).toContain(`${OVERHEAD_BY_LIVE.auto} 秒（ライブ種別ごとの実測値）`);
  });

  it("仮の値の印が下りたら（Nori が測ったら）、ひとりでライブも「仮」が消えて実測値と書く", async () => {
    provisional.value = false;
    draw();
    await fill("A", [...A]);
    const note = screen.getByText(/オーバーヘッドは/).textContent ?? "";
    expect(note).toContain(`${OVERHEAD_BY_LIVE.solo} 秒（ライブ種別ごとの実測値）`);
    expect(note).not.toContain("仮");
  });
});

/**
 * ★ オートは 0 焚きができない（下限 1。2026-11-21 Nori 指摘）。焚き数はライブ種別の間で共有なので、
 *   ひとりで・みんなでで 0 にしてからオートへ切り替えても、オートでは 1 として出し・計算する。
 *   ひとりで・みんなでの 0 焚きはゲームで可能なので変えない。
 */
describe("オートの焚き数は 1 から", () => {
  const KEY = "quickCompare:v1";
  const radio = (name: string) => screen.getByRole("radio", { name });
  const takiInput = () => screen.getByLabelText("焚き数") as HTMLInputElement;
  const ROW = { id: "r1", name: "A", power: "351149", bonus: "425", leader: "150", total: "450" };
  const CANDIDATE = { name: "A", power: 351_149, bonus: 425, skillLeader: 150, skillTotal: 450 };

  it("ひとりでの 0 焚きからオートへ切り替えると 1 で出して計算し、ひとりでに戻すと 0 のまま", async () => {
    localStorage.setItem(KEY, JSON.stringify({ rows: [ROW], live: "solo", taki: 0 }));
    draw();
    expect(takiInput().value).toBe("0");
    const user = userEvent.setup();
    await user.click(radio("オート"));
    expect(takiInput().value).toBe("1");
    expect(takiInput().parentElement!.querySelector("button")!.disabled).toBe(true);
    const [expected] = compareDecks([CANDIDATE], ENVY, { live: "auto", taki: 1, overheadSec: OVERHEAD_BY_LIVE.auto });
    const [row] = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(row.textContent).toContain((expected.eventPt as number).toLocaleString());
    expect(screen.getByText(/オーバーヘッドは/).textContent).toMatch(/^1焚き・/);
    await user.click(radio("ひとりで"));
    expect(takiInput().value).toBe("0");
  });
});
