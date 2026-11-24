/**
 * @vitest-environment jsdom
 *
 * 周回プランの「ライブの種類」（2026-11-24、みんなでライブの停止期間。227 が停止のまま始まる前に入れる）。
 *
 * ★ 前は周回ペースが 28 回/時（みんなでライブ）に固定で、ひとりでライブの想定が無かった。
 *   リフレッシュゲージと同じく、止まっている間はひとりでライブで開き、ロスは OVERHEAD_SEC.solo から出す。
 * ★ 縛ること
 *   - 止まっている間はひとりでライブで開き、周回ペースはひとりでライブの既定（数字は OVERHEAD_SEC.solo から。直書きしない）
 *   - みんなでライブに切り替えた数字は足す前と同じ（28 回/時）
 *   - どちらの想定かを、タイムラインの見出しの横の札と、書き出す画像の行に出す
 *   - 保存したプランに想定を残し、呼び出すと想定と周回ペースが戻る。想定の無い旧いプランはみんなでライブで戻す
 *     （旧いプランの周回ペースはみんなでライブの欄の値なので、ひとりでライブとして読むと計算が変わる）
 * ★ 印は vi.mock で「止まっている」に固定する。再開した側は PlanPage.resumed.test.tsx が縛る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));
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

import PlanPage from "./PlanPage";
import { resetProfilesForTest } from "../../lib/profiles";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { playsPerHour } from "./lib/sessionPlanner";
import { SOLO_DEFAULT_RATE } from "./lib/liveAssumption";
import { drawPlanCanvas } from "./lib/planCanvas";

const PLANS_KEY = "sekaimaster:plans:v1";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetProfilesForTest();
});

const draw = () =>
  render(
    <MemoryRouter>
      <PlanPage />
    </MemoryRouter>,
  );

const radio = (name: string) =>
  within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", { name });
const choose = (name: string) => fireEvent.click(radio(name));
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const paceInput = () => screen.getByLabelText("周回ペース") as HTMLInputElement;
const timeline = () =>
  screen.getByRole("heading", { name: "タイムライン（曲・休憩・マイセカイ・到達pt）" }).closest("section")!;
const savedPlans = () => JSON.parse(localStorage.getItem(PLANS_KEY) ?? "[]");

describe("止まっている間に開いたとき", () => {
  it("ライブの種類はひとりでライブ、周回ペースはひとりでライブの既定（OVERHEAD_SEC.solo から）", () => {
    draw();
    expect(radio("ひとりでライブ").getAttribute("aria-checked")).toBe("true");
    expect(radio("みんなでライブ").getAttribute("aria-checked")).toBe("false");
    expect(paceInput().value).toBe(String(SOLO_DEFAULT_RATE));
    expect(screen.getByText(`既定${SOLO_DEFAULT_RATE}。長い曲は自動で少なくなります`)).toBeTruthy();
  });

  it("タイムラインの見出しの横に想定の札が出る（見出しの名前は変えない）", () => {
    draw();
    expect(within(timeline()).getByText("ひとりでライブ想定")).toBeTruthy();
    choose("みんなでライブ");
    expect(within(timeline()).getByText("みんなでライブ想定")).toBeTruthy();
    expect(within(timeline()).queryByText("ひとりでライブ想定")).toBeNull();
  });

  it("稼働 1 時間の回数は、ひとりでライブならロス OVERHEAD_SEC.solo、みんなでライブなら足す前と同じ 28 回", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "＋稼働" }));
    const solo = Math.round(playsPerHour(74.8, OVERHEAD_SEC.solo));
    expect(within(timeline()).getByText(`≈${solo}回`)).toBeTruthy();
    choose("みんなでライブ");
    expect(paceInput().value).toBe("28");
    expect(within(timeline()).getByText("≈28回")).toBeTruthy();
  });
});

describe("書き出す画像の行", () => {
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

  it("周回ペースの後ろに想定を書く", async () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "＋稼働" }));
    const solo = await exportMeta();
    expect(solo[0]).toBe(
      `時速 500,000 pt/時（基準焚き5）・${SOLO_DEFAULT_RATE}回/時（ひとりでライブ想定）`,
    );
    choose("みんなでライブ");
    const multi = await exportMeta();
    expect(multi[0]).toBe("時速 500,000 pt/時（基準焚き5）・28回/時（みんなでライブ想定）");
  });
});

describe("プランの保存・呼び出し", () => {
  it("保存したプランに想定を残し、呼び出すと想定と周回ペースが戻る", () => {
    const custom = String(SOLO_DEFAULT_RATE - 3); // 既定と違う値（OVERHEAD_SEC.solo を直しても既定と重ならない）
    draw();
    type(paceInput(), custom);
    fireEvent.click(screen.getByRole("button", { name: "＋休憩" }));
    type(screen.getByLabelText("プラン名"), "夜");
    fireEvent.click(screen.getByRole("button", { name: "この内容を保存" }));
    const [saved] = savedPlans();
    expect(saved.inputs.live).toBe("solo");
    expect(saved.inputs.rate).toBe(custom);

    choose("みんなでライブ");
    type(paceInput(), "25");
    fireEvent.click(screen.getByRole("button", { name: "呼び出し" }));
    expect(radio("ひとりでライブ").getAttribute("aria-checked")).toBe("true");
    expect(paceInput().value).toBe(custom);
    // みんなでライブの欄は呼び出しで触らない
    choose("みんなでライブ");
    expect(paceInput().value).toBe("25");
  });

  it("想定の無い旧いプランは、みんなでライブとして呼び出す（保存したペースはみんなでライブの欄に戻す）", () => {
    localStorage.setItem(
      PLANS_KEY,
      JSON.stringify([
        {
          name: "旧いプラン",
          savedAt: 1,
          startTime: "21:00",
          segments: [],
          inputs: {
            songId: "074",
            gauge: "0",
            rate: "30",
            currentPt: "",
            hourlyRate: "500000",
            refTaki: 5,
          },
        },
      ]),
    );
    draw();
    expect(radio("ひとりでライブ").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "呼び出し" }));
    expect(radio("みんなでライブ").getAttribute("aria-checked")).toBe("true");
    expect(paceInput().value).toBe("30");
    choose("ひとりでライブ");
    expect(paceInput().value).toBe(String(SOLO_DEFAULT_RATE));
  });

  it("想定の値が壊れている保存はみんなでライブとして呼び出す", () => {
    localStorage.setItem(
      PLANS_KEY,
      JSON.stringify([
        {
          name: "壊れた",
          savedAt: 1,
          startTime: "21:00",
          segments: [],
          inputs: { songId: "074", gauge: "0", rate: "30", currentPt: "", hourlyRate: "500000", refTaki: 5, live: 123 },
        },
      ]),
    );
    draw();
    fireEvent.click(screen.getByRole("button", { name: "呼び出し" }));
    expect(radio("みんなでライブ").getAttribute("aria-checked")).toBe("true");
    expect(paceInput().value).toBe("30");
  });
});
