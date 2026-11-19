/**
 * @vitest-environment jsdom
 *
 * リフレッシュゲージ計算機の「ひとりでライブ想定」（2026-11-18、みんなでライブの停止期間。Nori の決定
 * 「リフレゲージはひとり想定を作ってタグかなんかで明示」）。
 *
 * ★ 縛ること
 *   - 止まっている間はひとりでライブ想定で開き、結果の枠と画面下の固定バーにどちらの想定かが出る
 *   - ひとりでライブの数字はロス OVERHEAD_SEC.solo（実測前の仮の値）で出る。期待値も定数から出す（33 を直書きしない）
 *   - みんなでライブに切り替えた数字は、足す前（885580a）の画面と 1 つも変わらない（ゴールデン。値は土台のビルドの
 *     /refresh に同じ入力を入れて画面から写した）
 *   - 書き出す画像の「ペース」の行に、ページの想定が届く（PlanTimeline への配線。検分 L-8）
 * ★ 印は vi.mock で「止まっている」「仮の値」に固定する（検分 L-7。前は describe.runIf で、印を戻すと黙って飛んでいた）。
 *   再開した側は RefreshGaugeCalculator.resumed.test.tsx、実測済みの側は GaugeInputsPanel.measured.test.tsx が縛る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RefreshGaugeCalculator from "./RefreshGaugeCalculator";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { planSession, playsPerHour } from "./lib/sessionPlanner";
import { fmtDuration } from "./lib/format";
import { SOLO_DEFAULT_RATE, paceMetaLine } from "./lib/liveAssumption";
import { drawPlanCanvas } from "./lib/planCanvas";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));
vi.mock("../../lib/overhead", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/overhead")>()),
  SOLO_OVERHEAD_PROVISIONAL: true,
}));
// 画像の描画は jsdom で動かないので、描画に渡すデータだけを受け取る
vi.mock("./lib/planCanvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/planCanvas")>()),
  drawPlanCanvas: vi.fn(async () => {}),
}));

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
beforeEach(() => localStorage.clear());

const draw = () =>
  render(
    <MemoryRouter>
      <RefreshGaugeCalculator />
    </MemoryRouter>,
  );

const resultPanel = () => screen.getByRole("heading", { name: "この曲で走ると" }).closest("section")!;
/** 結果の枠の Stat 1 つぶんの文字（名前＋数字＋補足）。 */
const stat = (label: string) => within(resultPanel()).getByText(label).parentElement!.textContent ?? "";
const bar = () => screen.getByRole("region", { name: "計算の結果" });
/** 固定バーの 1 項目ぶんの文字。 */
const barItem = (label: string) => within(bar()).getByText(label).parentElement!.textContent ?? "";
const choose = (name: string) =>
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", { name }),
  );
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const paceInput = () => screen.getByLabelText("周回ペース") as HTMLInputElement;

describe("止まっている間に開いたとき（ひとりでライブ想定）", () => {
  it("想定の札が結果の枠の見出しの横と固定バーに出る（見出しの名前は変えない）", () => {
    draw();
    expect(screen.getByRole("heading", { name: "この曲で走ると" })).toBeTruthy();
    expect(within(resultPanel()).getByText("ひとりでライブ想定")).toBeTruthy();
    expect(barItem("この曲のペース")).toContain("ひとりでライブ");
  });

  // 検分 M-1: 「仮」は周回ペースの補足と「入力について」だけ。札・固定バーには足さない
  it("札と固定バーには「仮」を足さない（補足には出す）", () => {
    draw();
    expect(within(resultPanel()).getByText("ひとりでライブ想定").textContent).toBe("ひとりでライブ想定");
    expect(resultPanel().textContent).not.toContain("仮");
    expect(bar().textContent).not.toContain("仮");
    expect(screen.getByText(`既定${SOLO_DEFAULT_RATE}（仮）。長い曲は自動で少なくなります`)).toBeTruthy();
  });

  it("周回ペースの欄は既定のひとりでライブのペース（OVERHEAD_SEC.solo から）", () => {
    draw();
    expect(paceInput().value).toBe(String(SOLO_DEFAULT_RATE));
  });

  it("数字はロス OVERHEAD_SEC.solo で出る（結果の枠と固定バーで同じ）", () => {
    draw();
    const p = planSession(84, 74.8, 0, OVERHEAD_SEC.solo);
    const runway = `100%まで${p.runwayPlays}回約 ${fmtDuration(p.runwayMinutes)}`;
    const pace = `${playsPerHour(74.8, OVERHEAD_SEC.solo).toFixed(0)}回/時`;
    const sustain = `持続ペース${p.sustainablePerHour.toFixed(0)}回/時休憩 約${p.restSharePercent.toFixed(0)}%`;
    expect(stat("100%まで")).toBe(runway);
    expect(stat("この曲のペース")).toBe(`この曲のペース${pace}`);
    expect(stat("持続ペース")).toBe(sustain);
    expect(barItem("100%まで")).toBe(runway);
    expect(barItem("この曲のペース")).toContain(pace);
    expect(barItem("持続ペース")).toBe(sustain);
  });
});

describe("みんなでライブに切り替えたとき（足す前と同じ数字）", () => {
  it("札がみんなでライブ想定に変わる", () => {
    draw();
    choose("みんなでライブ");
    expect(within(resultPanel()).getByText("みんなでライブ想定")).toBeTruthy();
    expect(within(resultPanel()).queryByText("ひとりでライブ想定")).toBeNull();
    expect(barItem("この曲のペース")).toContain("みんなでライブ");
  });

  // 885580a のビルドの /refresh で同じ入力を入れて写した値
  it.each([
    { gauge: null, next: null, rate: null, runway: "501回約 17時間54分", pace: "28回/時", sustain: "21回/時休憩 約25%" },
    { gauge: "50", next: "12", rate: "32", runway: "251回約 7時間51分", pace: "32回/時", sustain: "23回/時休憩 約28%" },
    { gauge: "50", next: "12", rate: "", runway: "251回約 8時間58分", pace: "28回/時", sustain: "21回/時休憩 約25%" },
    { gauge: "13.6", next: "12", rate: "22", runway: "433回約 19時間41分", pace: "22回/時", sustain: "17回/時休憩 約21%" },
  ])("ゲージ$gauge・ペース$rate → $runway", ({ gauge, next, rate, runway, pace, sustain }) => {
    draw();
    choose("みんなでライブ");
    if (gauge != null) type(screen.getByLabelText("現在のゲージ"), gauge);
    if (next != null) type(screen.getByLabelText("次の回復まで"), next);
    if (rate != null) type(paceInput(), rate);
    expect(stat("100%まで")).toBe(`100%まで${runway}`);
    expect(stat("この曲のペース")).toBe(`この曲のペース${pace}`);
    expect(stat("持続ペース")).toBe(`持続ペース${sustain}`);
    expect(barItem("100%まで")).toBe(`100%まで${runway}`);
    expect(barItem("持続ペース")).toBe(`持続ペース${sustain}`);
    expect(barItem("この曲のペース")).toBe(`この曲のペース${pace}みんなでライブ`);
  });
});

describe("切り替え", () => {
  it("ペースは想定ごとに別々に持つ（行き来しても入れた値が残る）", () => {
    const custom = String(SOLO_DEFAULT_RATE - 3); // 既定と違う値（OVERHEAD_SEC.solo を直しても既定と重ならない）
    draw();
    choose("ひとりでライブ");
    type(paceInput(), custom);
    choose("みんなでライブ");
    expect(paceInput().value).toBe("28");
    choose("ひとりでライブ");
    expect(paceInput().value).toBe(custom);
  });

  it("どちらの想定でも、画面の文に「協力」と書かない", () => {
    draw();
    for (const name of ["ひとりでライブ", "みんなでライブ"]) {
      choose(name);
      expect(document.body.textContent).not.toContain("協力");
    }
  });
});

/**
 * 検分 L-8: ページの想定が、PlanTimeline を通って画像の「ペース」の行に届くこと。
 * ★ paceMetaLine 単体のテストだけでは、PlanTimeline で live を渡し忘れても通っていた（変異が生き残った）。
 */
describe("書き出す画像の「ペース」の行", () => {
  const exportMeta = async () => {
    vi.mocked(drawPlanCanvas).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "画像を保存" }));
    await waitFor(() => expect(drawPlanCanvas).toHaveBeenCalledTimes(1));
    return vi.mocked(drawPlanCanvas).mock.calls[0][1].meta;
  };

  // 描画のあとの書き出し（PNG にしてリンクを押す）は jsdom に無いので、何もしないものに替える
  let spies: { mockRestore: () => void }[] = [];
  beforeEach(() => {
    spies = [
      vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:,"),
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}),
    ];
  });
  afterEach(() => spies.forEach((s) => s.mockRestore()));

  it("ひとりでライブ想定・みんなでライブ想定がそれぞれ書かれる（「仮」は足さない）", async () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "＋稼働" }));

    const solo = await exportMeta();
    expect(solo[0]).toBe(paceMetaLine(SOLO_DEFAULT_RATE, "solo"));
    expect(solo[0]).toContain("ひとりでライブ想定");
    expect(solo.join("")).not.toContain("仮");

    choose("みんなでライブ");
    const multi = await exportMeta();
    expect(multi[0]).toBe("ペース: 28回/時（エビ基準・みんなでライブ想定）");
  });
});
