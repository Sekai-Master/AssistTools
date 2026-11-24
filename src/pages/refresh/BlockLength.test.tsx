/**
 * @vitest-environment jsdom
 *
 * 稼働ブロックを「時間」と「ゲージ%」で切り替えて積む（2026-11-24、使い手の要望「切り替えながら積んでいけるといいね」）。
 * ★ 縛ること
 *   - ゲージ%で決めたブロックは、開始のゲージから入れた%まで上げる時間を逆算して入る（100% ならムダ 0 で終わる）
 *   - 切り替えでは、時間→ゲージ はいまの終わりの%、ゲージ→時間 は逆算した分を引き継ぐ（稼働はプランが動かない。
 *     休憩は段が下がった瞬間に終わる長さ＝進捗 0 なら 30 分の倍数のときだけ動かない）
 *   - 並べ替えても、ブロックごとの決め方と値は残る。前のブロックを変えると逆算し直す
 *   - 周回プランの保存・呼び出しで、決め方と「次の回復まで」（ピッカー）の値が戻る
 *   - リフレッシュゲージ計算機でも同じ部品が出る
 *   - ひとりでライブ想定でも、その 1 周の秒で逆算する（想定を替えると逆算し直す）
 *   - 休憩も「時間」と「ゲージ」で切り替えられる（2026-11-25、持ち主「45%まで回復したら、残り55%でイベント終了まで走る」）。
 *     入れた%以下になる段まで休む時間と、休んだ後の%を出す。繰り越しの30分タイマーも効く
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlanPage from "./PlanPage";
import RefreshGaugeCalculator from "./RefreshGaugeCalculator";
import { resetProfilesForTest } from "../../lib/profiles";
import { minutesToTarget, restMinutesToTarget } from "./lib/timeline";
import { SOLO_DEFAULT_RATE, overheadForPace } from "./lib/liveAssumption";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { fmtDuration } from "./lib/format";

// 開いたときの想定をみんなでライブに固定する（止まっている間の既定はひとりでライブ。印を戻しても期待値がずれないように）。
// ひとりでライブの逆算は、下の describe で切り替えて確かめる
vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: false }));

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
/** 休憩ブロックの行（上から順）。 */
const restRows = () =>
  screen.queryAllByRole("radiogroup", { name: "休憩の長さの決め方" }).map((g) => g.closest("li")!);
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

// 周回プランはみんなでライブ 28 回/時（上の vi.mock）。逆算の期待値も同じ式から出す
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

/**
 * ひとりでライブ想定（#278 で周回プランにも想定の切り替えが入った）。既定のペースは SOLO_DEFAULT_RATE（いまは 34 回/時）で、
 * そのときのロスは OVERHEAD_SEC.solo。逆算もこのロスの 1 周の秒で出ること。想定を替えたら逆算し直し、終わりは目標のまま。
 */
describe("ひとりでライブ想定の逆算（周回プラン・リフレッシュゲージ）", () => {
  const OH_SOLO = overheadForPace("solo", String(SOLO_DEFAULT_RATE));
  const chooseLive = (name: "ひとりでライブ" | "みんなでライブ") =>
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", { name }));

  it("既定のペースとロスの前提（ひとりでライブの 1 周はロス OVERHEAD_SEC.solo）", () => {
    expect(OH_SOLO).toBe(OVERHEAD_SEC.solo);
    expect(SOLO_DEFAULT_RATE).toBe(Math.round(3600 / (74.8 + OVERHEAD_SEC.solo)));
  });

  it.each([
    ["周回プラン", drawPlan],
    [
      "リフレッシュゲージ",
      () =>
        render(
          <MemoryRouter>
            <RefreshGaugeCalculator />
          </MemoryRouter>,
        ),
    ],
  ] as const)("%s: ひとりでライブの 1 周の秒で逆算し、みんなでライブに替えると逆算し直す", (_, draw) => {
    draw();
    chooseLive("ひとりでライブ");
    expect((screen.getByLabelText("周回ペース") as HTMLInputElement).value).toBe(String(SOLO_DEFAULT_RATE));
    add("＋稼働");
    choose(playRows()[0], "ゲージ");
    type(targetInput(playRows()[0]), "100");
    const solo = minutesToTarget(0, 100, 84, 74.8, OH_SOLO);
    expect(solo).toBeCloseTo(((6_600_000 / PER) * (74.8 + OVERHEAD_SEC.solo)) / 60, 9);
    expect(playRows()[0].textContent).toContain(`%まで${fmtDuration(solo)}`);
    expect(stat("総時間")).toContain(fmtDuration(solo));
    expect(stat("終了ゲージ")).toContain("100.0%");
    expect(stat("ムダ時間")).toBe("ムダ時間0分無駄なし");

    chooseLive("みんなでライブ");
    const multi = minutesToTarget(0, 100, 84, 74.8, OH);
    expect(multi).toBeGreaterThan(solo); // ロスが大きいぶん長くかかる
    expect(playRows()[0].textContent).toContain(`%まで${fmtDuration(multi)}`);
    expect(stat("終了ゲージ")).toContain("100.0%");
  });

  it("周回プラン: 前に時間で 1 時間積んでも、ひとりでライブの 1 周で 100% ぎりぎりまでの残りを逆算する", () => {
    drawPlan();
    chooseLive("ひとりでライブ");
    add("＋稼働");
    add("＋稼働");
    choose(playRows()[1], "ゲージ");
    type(targetInput(playRows()[1]), "100");
    const sec = 74.8 + OH_SOLO;
    const firstInternal = Math.min(6_600_000, ((60 * 60) / sec) * PER);
    const rest = minutesToTarget(firstInternal, 100, 84, 74.8, OH_SOLO);
    expect(playRows()[1].textContent).toContain(`%まで${fmtDuration(rest)}`);
    expect(stat("総時間")).toContain(fmtDuration(60 + rest));
    expect(stat("終了ゲージ")).toContain("100.0%");
  });
});

describe("保存・呼び出し（周回プラン）", () => {
  it("決め方・目標の%・「次の回復まで」のピッカーの値が、保存したプランから戻る", () => {
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
    expect(screen.getByRole("slider", { name: "次の回復まで" }).getAttribute("aria-valuetext")).toBe("30分");
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

/**
 * 保存したプランの「次の回復まで」が空・壊れた値のとき（2026-11-25、ピッカーに替えたときに足した）。
 * ★ 保存は端末に残り続けるので、文字でない値（数・null）でも落ちずに読み、読めない値は 30（回していない）として出す。
 *   前は数が入っていると nextDecay.trim() で落ちていた。
 */
describe("保存したプランの「次の回復まで」（空・壊れた値）", () => {
  const KEY = "sekaimaster:plans:v1";
  const saveRaw = (nextDecay: unknown) =>
    localStorage.setItem(
      KEY,
      JSON.stringify([
        {
          name: "前の",
          savedAt: 1,
          startTime: "20:00",
          segments: [],
          inputs: { songId: "074", gauge: "50", nextDecay, rate: "28", currentPt: "", hourlyRate: "500000", refTaki: 5 },
        },
      ]),
    );
  const slider = () => screen.getByRole("slider", { name: "次の回復まで" }) as HTMLInputElement;
  const empty = () => /全回復まで\s*(\d+時間\d+分|\d+分)/.exec(document.body.textContent ?? "")?.[1];

  it.each([
    { label: "空", saved: "", shown: "30", emptyIn: "3時間0分" },
    { label: "項目が無い（旧い保存）", saved: undefined, shown: "30", emptyIn: "3時間0分" },
    { label: "分の文字", saved: "12", shown: "12", emptyIn: "2時間42分" },
    { label: "数（文字でない）", saved: 12, shown: "12", emptyIn: "2時間42分" },
    { label: "数でない文字", saved: "abc", shown: "30", emptyIn: "3時間0分" },
    { label: "負", saved: "-5", shown: "30", emptyIn: "3時間0分" },
    { label: "30 を超える", saved: "99", shown: "30", emptyIn: "3時間0分" },
    { label: "null", saved: null, shown: "30", emptyIn: "3時間0分" },
  ] as const)("$label → ピッカーは $shown 分の段", ({ saved, shown, emptyIn }) => {
    saveRaw(saved);
    drawPlan();
    fireEvent.click(screen.getByRole("button", { name: "呼び出し" }));
    expect(slider().value).toBe(shown);
    expect(slider().getAttribute("aria-valuetext")).toBe(`${shown}分`);
    const rows = [...slider().parentElement!.querySelectorAll<HTMLElement>("[data-value]")];
    expect(rows.filter((r) => r.dataset.selected === "true").map((r) => r.dataset.value)).toEqual([shown]);
    expect(empty()).toBe(emptyIn);
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

  it("「次の回復まで」はピッカー（0〜30 の slider）", () => {
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

/**
 * 休憩をゲージで決める（2026-11-25）。休憩中のゲージは30分ごとに一段（550,000 = 8.33%）下がるので、
 * 入れた%以下になる段まで休む。ブロックには休む時間と、休んだ後の実際の%（「45%まで 2時間0分 → 43.4%」）を出す。
 */
describe("休憩をゲージで決める", () => {
  const MAX = 6_600_000;
  const D = 550_000;
  const chooseLive = (name: "ひとりでライブ" | "みんなでライブ") =>
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", { name }));
  /** 現在 g% から、ロス oh で 1 時間稼働したあとの%。 */
  const afterHour = (g: number, oh: number) => g + (((60 * 60) / (74.8 + oh)) * PER * 100) / MAX;

  it("休憩を足した直後は時間で決める（前のまま）", () => {
    drawPlan();
    add("＋休憩");
    expect(modeOf(restRows()[0])).toBe("時間");
    expect((within(restRows()[0] as HTMLElement).getByLabelText("分") as HTMLInputElement).value).toBe("30");
  });

  it.each([
    ["みんなでライブ", OH],
    ["ひとりでライブ", overheadForPace("solo", String(SOLO_DEFAULT_RATE))],
  ] as const)("例（%s）: 現在70% → 稼働1時間 → 休憩ゲージ45 → 稼働ゲージ100 で、終了100.0%・ムダ0分", (live, oh) => {
    drawPlan();
    chooseLive(live);
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋稼働");
    add("＋休憩");
    add("＋稼働");
    choose(restRows()[0], "ゲージ");
    type(targetInput(restRows()[0]), "45");
    choose(playRows()[1], "ゲージ");
    type(targetInput(playRows()[1]), "100");

    const g1 = afterHour(70, oh);
    const rest = restMinutesToTarget((g1 / 100) * MAX, 45, 0);
    const g2 = g1 - (rest.ticks * D * 100) / MAX;
    const last = minutesToTarget((g2 / 100) * MAX, 100, 84, 74.8, oh);
    expect(rest.ticks).toBe(Math.ceil(((g1 - 45) / 100) * (MAX / D)));
    expect(rest.minutes).toBe(30 * rest.ticks);
    expect(restRows()[0].textContent).toContain(`%まで${fmtDuration(rest.minutes)}→ ${g2.toFixed(1)}%`);
    expect(Number(rowGauge(restRows()[0]))).toBeCloseTo(Number(g2.toFixed(1)), 9);
    expect(playRows()[1].textContent).toContain(`%まで${fmtDuration(last)}`);
    expect(stat("総時間")).toContain(fmtDuration(60 + rest.minutes + last));
    expect(stat("終了ゲージ")).toContain("100.0%");
    expect(stat("ムダ時間")).toBe("ムダ時間0分無駄なし");
  });

  it("前の稼働を延ばすと、休む時間を逆算し直す（休んだ後の%は 45 以下のまま）", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋稼働");
    add("＋休憩");
    choose(restRows()[0], "ゲージ");
    type(targetInput(restRows()[0]), "45");
    const before = restRows()[0].textContent;
    for (let i = 0; i < 4; i++) {
      fireEvent.click(within(playRows()[0] as HTMLElement).getByRole("button", { name: "30分増やす" }));
    }
    expect(restRows()[0].textContent).not.toBe(before);
    expect(Number(rowGauge(restRows()[0]))).toBeLessThanOrEqual(45);
  });

  it("目標が今以上なら 0 分で、休んだ後の%は今のまま", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋休憩");
    choose(restRows()[0], "ゲージ");
    type(targetInput(restRows()[0]), "80");
    expect(restRows()[0].textContent).toContain("%まで0分→ 70.0%");
  });

  it("「次の回復まで」10 分（タイマーが 20 分進んでいる）なら、1 段下までは 10 分", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "60");
    fireEvent.change(screen.getByRole("slider", { name: "次の回復まで" }), { target: { value: "10" } });
    add("＋休憩");
    choose(restRows()[0], "ゲージ");
    type(targetInput(restRows()[0]), "55");
    expect(restRows()[0].textContent).toContain(`%まで10分→ ${(60 - (D * 100) / MAX).toFixed(1)}%`);
  });

  it("30 分の倍数の休憩は、切り替えてもプランが動かない（時間→ゲージ は休んだ後の%を切り上げて引き継ぎ、ゲージ→時間 は逆算した分）", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋稼働");
    add("＋休憩");
    fireEvent.click(within(restRows()[0] as HTMLElement).getByRole("button", { name: "30分増やす" })); // 1時間
    const endBefore = rowGauge(restRows()[0]);
    choose(restRows()[0], "ゲージ");
    expect(Number(targetInput(restRows()[0]).value)).toBeGreaterThanOrEqual(Number(endBefore));
    expect(restRows()[0].textContent).toContain("%まで1時間0分");
    expect(rowGauge(restRows()[0])).toBe(endBefore);
    choose(restRows()[0], "時間");
    const row = restRows()[0] as HTMLElement;
    expect((within(row).getByLabelText("時間") as HTMLInputElement).value).toBe("1");
    expect((within(row).getByLabelText("分") as HTMLInputElement).value).toBe("0");
  });

  // ★ 検分 #285 M: ゲージは30分ごとの段なので、30 分の倍数でない休憩は切り替えると縮む。この動きのまま固定する
  it("30 分の倍数でない休憩（進捗 0 の 45 分）は、ゲージにすると段が下がった 30 分に縮み、タイマーの端数 15 分は落ちる", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋休憩");
    fireEvent.change(within(restRows()[0] as HTMLElement).getByLabelText("分"), { target: { value: "45" } });
    const step = (70 - (D * 100) / MAX).toFixed(1);
    expect(rowGauge(restRows()[0])).toBe(step); // 45 分で 1 段
    expect(restRows()[0].textContent).toContain("次の減少まであと15分（累計15/30分・繰り越し）");
    choose(restRows()[0], "ゲージ");
    expect(targetInput(restRows()[0]).value).toBe(step);
    expect(restRows()[0].textContent).toContain(`%まで30分→ ${step}%`);
    expect(restRows()[0].textContent).toContain("次の減少まであと30分（累計0/30分・繰り越し）");
    choose(restRows()[0], "時間");
    expect((within(restRows()[0] as HTMLElement).getByLabelText("分") as HTMLInputElement).value).toBe("30");
  });

  it("1 段も下がらない休憩（10 分）は、ゲージにすると 0 分になり、時間に戻しても 10 分は戻らない", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋休憩");
    fireEvent.change(within(restRows()[0] as HTMLElement).getByLabelText("分"), { target: { value: "10" } });
    expect(restRows()[0].textContent).toContain("次の減少まであと20分（累計10/30分・繰り越し）");
    choose(restRows()[0], "ゲージ");
    expect(targetInput(restRows()[0]).value).toBe("70");
    expect(restRows()[0].textContent).toContain("%まで0分→ 70.0%");
    choose(restRows()[0], "時間");
    const row = restRows()[0] as HTMLElement;
    expect((within(row).getByLabelText("時間") as HTMLInputElement).value).toBe("0");
    expect((within(row).getByLabelText("分") as HTMLInputElement).value).toBe("0");
  });

  it("並べ替え・保存と呼び出しで、休憩の決め方と%が残る", () => {
    drawPlan();
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋休憩");
    add("＋休憩");
    choose(restRows()[1], "ゲージ");
    type(targetInput(restRows()[1]), "45");
    fireEvent.click(within(restRows()[1] as HTMLElement).getByRole("button", { name: "上へ" }));
    expect(modeOf(restRows()[0])).toBe("ゲージ");
    expect(targetInput(restRows()[0]).value).toBe("45");
    expect(modeOf(restRows()[1])).toBe("時間");

    type(screen.getByLabelText("プラン名"), "休憩");
    fireEvent.click(screen.getByRole("button", { name: "この内容を保存" }));
    cleanup();
    drawPlan();
    fireEvent.click(screen.getByRole("button", { name: "呼び出し" }));
    expect(modeOf(restRows()[0])).toBe("ゲージ");
    expect(targetInput(restRows()[0]).value).toBe("45");
    expect(modeOf(restRows()[1])).toBe("時間");
  });

  it("リフレッシュゲージ計算機でも休憩をゲージで決められる", () => {
    render(
      <MemoryRouter>
        <RefreshGaugeCalculator />
      </MemoryRouter>,
    );
    type(screen.getByLabelText("現在のゲージ"), "70");
    add("＋休憩");
    choose(restRows()[0], "ゲージ");
    type(targetInput(restRows()[0]), "45");
    expect(restRows()[0].textContent).toContain("%まで1時間30分→ 45.0%");
    expect(stat("終了ゲージ")).toContain("45.0%");
  });
});
