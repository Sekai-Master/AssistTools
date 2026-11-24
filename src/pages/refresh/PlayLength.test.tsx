/**
 * @vitest-environment jsdom
 *
 * 稼働ブロックを「時間」と「ゲージ%」で切り替えて積む（2026-11-24、使い手の要望「切り替えながら積んでいけるといいね」）。
 * ★ 縛ること
 *   - ゲージ%で決めたブロックは、開始のゲージから入れた%まで上げる時間を逆算して入る（100% ならムダ 0 で終わる）
 *   - 切り替えでプランが動かない（時間→ゲージ はいまの終わりの%、ゲージ→時間 は逆算した分を引き継ぐ）
 *   - 並べ替えても、ブロックごとの決め方と値は残る。前のブロックを変えると逆算し直す
 *   - 周回プランの保存・呼び出しで、決め方と「次の回復まで」（ダイヤル）の値が戻る
 *   - リフレッシュゲージ計算機でも同じ部品が出る
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlanPage from "./PlanPage";
import RefreshGaugeCalculator from "./RefreshGaugeCalculator";
import { resetProfilesForTest } from "../../lib/profiles";
import { minutesToTarget } from "./lib/timeline";
import { overheadForPace } from "./lib/liveAssumption";
import { fmtDuration } from "./lib/format";

// 独りんぼエンヴィー（既定の曲。public/MusicDatas の値。定数は実測の 84）
vi.mock("../analyzer/useAnalyzerMusics", () => ({
  useAnalyzerMusics: () => ({
    musics: [
      {
        id: "074",
        title: "独りんぼエンヴィー",
        basePoint: 100,
        basePointSource: "verified",
        musicTime: 74.8,
        jacketLink: "jacket_s_074.webp",
      },
    ],
    aliases: [],
    loading: false,
    error: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetProfilesForTest();
});

const drawPlan = () =>
  render(
    <MemoryRouter>
      <PlanPage />
    </MemoryRouter>,
  );

/** 稼働ブロックの行（上から順）。 */
const playRows = () =>
  screen.queryAllByRole("radiogroup", { name: "稼働の長さの決め方" }).map((g) => g.closest("li")!);
const modeOf = (row: Element) =>
  within(row as HTMLElement)
    .getAllByRole("radio")
    .find((r) => r.getAttribute("aria-checked") === "true")?.textContent;
const choose = (row: Element, name: "時間" | "ゲージ") =>
  fireEvent.click(within(row as HTMLElement).getByRole("radio", { name }));
const targetInput = (row: Element) => within(row as HTMLElement).getByLabelText("目標のゲージ") as HTMLInputElement;
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const stat = (label: string) => screen.getByText(label, { selector: "div" }).parentElement!.textContent ?? "";
/** 周回プランの行の終わりのゲージ（右の列の「ゲージN%」）。 */
const rowGauge = (row: Element) => /ゲージ([\d.]+)%/.exec(row.textContent ?? "")?.[1];
const add = (name: "＋稼働" | "＋休憩") => fireEvent.click(screen.getByRole("button", { name }));

// 周回プランは想定を選ばない（みんなでライブ 28 回/時）。逆算の期待値も同じ式から出す
const OH = overheadForPace("multi", "28");
const PER = 84 * 157;

describe("ゲージ%で決める（周回プラン）", () => {
  it("稼働を足した直後は時間で決める（前のまま）", () => {
    drawPlan();
    add("＋稼働");
    expect(modeOf(playRows()[0])).toBe("時間");
    expect(within(playRows()[0] as HTMLElement).getByLabelText("時間")).toBeTruthy();
  });

  it("ゲージに切り替えると、いまの終わりの%が入り、時間はほぼ変わらない", () => {
    drawPlan();
    add("＋稼働");
    const before = rowGauge(playRows()[0]);
    choose(playRows()[0], "ゲージ");
    expect(modeOf(playRows()[0])).toBe("ゲージ");
    expect(targetInput(playRows()[0]).value).toBe(before);
    expect(playRows()[0].textContent).toContain("%まで");
    expect(playRows()[0].textContent).toContain("1時間0分");
  });

  it("100% を入れると、0%からちょうど100%まで回す時間が入り、ムダは出ない", () => {
    drawPlan();
    add("＋稼働");
    choose(playRows()[0], "ゲージ");
    type(targetInput(playRows()[0]), "100");
    const minutes = minutesToTarget(0, 100, 84, 74.8, OH);
    expect(minutes).toBeCloseTo(((6_600_000 / PER) * (74.8 + OH)) / 60, 9);
    expect(playRows()[0].textContent).toContain(fmtDuration(minutes));
    expect(rowGauge(playRows()[0])).toBe("100.0");
    expect(stat("終了ゲージ")).toContain("100.0%");
    expect(stat("ムダ時間")).toBe("ムダ時間0分無駄なし");
    expect(stat("総時間")).toContain(fmtDuration(minutes));
  });

  it("今より小さい%は 0 分", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "50");
    add("＋稼働");
    choose(playRows()[0], "ゲージ");
    type(targetInput(playRows()[0]), "30");
    expect(playRows()[0].textContent).toContain("0分");
    expect(rowGauge(playRows()[0])).toBe("50.0");
  });

  it("打ちかけの「37.」や空欄でも字が消えない（離れると決まった値に戻る）", () => {
    drawPlan();
    add("＋稼働");
    choose(playRows()[0], "ゲージ");
    const input = targetInput(playRows()[0]);
    type(input, "37.");
    expect(targetInput(playRows()[0]).value).toBe("37.");
    type(targetInput(playRows()[0]), "");
    expect(targetInput(playRows()[0]).value).toBe("");
    fireEvent.blur(targetInput(playRows()[0]));
    expect(targetInput(playRows()[0]).value).toBe("37");
  });

  it("時間に戻すと、逆算した分（丸め）が時間の欄に入る", () => {
    drawPlan();
    add("＋稼働");
    choose(playRows()[0], "ゲージ");
    type(targetInput(playRows()[0]), "100");
    const minutes = Math.round(minutesToTarget(0, 100, 84, 74.8, OH));
    choose(playRows()[0], "時間");
    const row = playRows()[0] as HTMLElement;
    expect((within(row).getByLabelText("時間") as HTMLInputElement).value).toBe(String(Math.floor(minutes / 60)));
    expect((within(row).getByLabelText("分") as HTMLInputElement).value).toBe(String(minutes % 60));
  });

  it("時間と%を混ぜて積める。前のブロックを変えると逆算し直し、終わりは100%のまま", () => {
    drawPlan();
    add("＋稼働");
    add("＋休憩");
    add("＋稼働");
    choose(playRows()[1], "ゲージ");
    type(targetInput(playRows()[1]), "100");
    expect(stat("終了ゲージ")).toContain("100.0%");
    const lastBefore = playRows()[1].textContent;
    // 最初の稼働を 30 分延ばす
    fireEvent.click(within(playRows()[0] as HTMLElement).getByRole("button", { name: "30分増やす" }));
    expect(stat("終了ゲージ")).toContain("100.0%");
    expect(playRows()[1].textContent).not.toBe(lastBefore);
  });

  it("並べ替えても、ブロックごとの決め方と値は残る", () => {
    drawPlan();
    add("＋稼働");
    add("＋稼働");
    choose(playRows()[1], "ゲージ");
    type(targetInput(playRows()[1]), "80");
    fireEvent.click(within(playRows()[1] as HTMLElement).getByRole("button", { name: "上へ" }));
    expect(modeOf(playRows()[0])).toBe("ゲージ");
    expect(targetInput(playRows()[0]).value).toBe("80");
    expect(modeOf(playRows()[1])).toBe("時間");
  });
});

describe("保存・呼び出し（周回プラン）", () => {
  it("決め方・目標の%・「次の回復まで」のダイヤルの値が、保存したプランから戻る", () => {
    drawPlan();
    fireEvent.change(screen.getByRole("slider", { name: "次の回復まで" }), { target: { value: "12" } });
    add("＋稼働");
    add("＋稼働");
    choose(playRows()[1], "ゲージ");
    type(targetInput(playRows()[1]), "100");
    type(screen.getByLabelText("プラン名"), "後半");
    fireEvent.click(screen.getByRole("button", { name: "この内容を保存" }));

    // 開き直す（作業中のタイムラインは保存しない。保存したプランから呼び出す）
    cleanup();
    drawPlan();
    expect(playRows()).toHaveLength(0);
    expect(screen.getByRole("slider", { name: "次の回復まで" }).getAttribute("aria-valuetext")).toBe("未設定（30分で計算）");
    fireEvent.click(screen.getByRole("button", { name: "呼び出し" }));
    expect(modeOf(playRows()[0])).toBe("時間");
    expect(modeOf(playRows()[1])).toBe("ゲージ");
    expect(targetInput(playRows()[1]).value).toBe("100");
    const slider = screen.getByRole("slider", { name: "次の回復まで" }) as HTMLInputElement;
    expect(slider.value).toBe("12");
    expect(slider.getAttribute("aria-valuetext")).toBe("12分");
    expect(stat("終了ゲージ")).toContain("100.0%");
  });
});

describe("リフレッシュゲージ計算機", () => {
  it("同じ切り替えが出て、100% で終わる", () => {
    render(
      <MemoryRouter>
        <RefreshGaugeCalculator />
      </MemoryRouter>,
    );
    add("＋稼働");
    choose(playRows()[0], "ゲージ");
    type(targetInput(playRows()[0]), "100");
    expect(stat("終了ゲージ")).toContain("100.0%");
    expect(stat("ムダ時間")).toBe("ムダ時間0分無駄なし");
  });

  it("「次の回復まで」はダイヤル（0〜30 の slider）", () => {
    render(
      <MemoryRouter>
        <RefreshGaugeCalculator />
      </MemoryRouter>,
    );
    const slider = screen.getByRole("slider", { name: "次の回復まで" }) as HTMLInputElement;
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("30");
  });
});
