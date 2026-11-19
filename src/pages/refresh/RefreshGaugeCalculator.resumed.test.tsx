/**
 * @vitest-environment jsdom
 *
 * みんなでライブが再開したとき（src/lib/liveSuspension.ts の MULTI_LIVE_SUSPENDED を false に戻したとき）の
 * リフレッシュゲージ（検分 L-7）。
 *
 * ★ 縛ること: 開いたときの想定がみんなでライブに戻り、札・固定バー・周回ペースの欄・数字が足す前と同じになる。
 *   ひとりでライブ想定は選べば今までどおり使える。
 * ★ vi.mock はファイル単位で効くので、止まっている側（RefreshGaugeCalculator.test.tsx・useGaugeInputs.test.ts）と
 *   ファイルを分けた。どちらも印を固定しているので、土台の値がどちらでも両方の側が必ず走る。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

import RefreshGaugeCalculator from "./RefreshGaugeCalculator";
import { useGaugeInputs } from "./useGaugeInputs";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { overheadFromRate } from "./lib/sessionPlanner";
import { SOLO_DEFAULT_RATE, defaultLiveAssumption } from "./lib/liveAssumption";

afterEach(cleanup);

const resultPanel = () => screen.getByRole("heading", { name: "この曲で走ると" }).closest("section")!;
const bar = () => screen.getByRole("region", { name: "計算の結果" });
const barItem = (label: string) => within(bar()).getByText(label).parentElement!.textContent ?? "";
const radio = (name: string) =>
  within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", { name });

describe("みんなでライブが再開したとき", () => {
  it("既定の想定はみんなでライブ", () => {
    expect(defaultLiveAssumption()).toBe("multi");
  });

  it("hook はみんなでライブで開き、ペース 28・ロスは 28 回/時からの逆算（足す前と同じ）", () => {
    const { result } = renderHook(() => useGaugeInputs([], { liveChoice: true }));
    expect(result.current.live).toBe("multi");
    expect(result.current.rate).toBe("28");
    expect(result.current.overhead).toBe(overheadFromRate(28, 74.8));
    // 選べば、ひとりでライブ想定は今までどおり
    act(() => result.current.setLive("solo"));
    expect(result.current.rate).toBe(String(SOLO_DEFAULT_RATE));
    expect(result.current.overhead).toBe(OVERHEAD_SEC.solo);
  });

  it("ページはみんなでライブ想定で開き、札・固定バー・数字が足す前と同じ", () => {
    render(
      <MemoryRouter>
        <RefreshGaugeCalculator />
      </MemoryRouter>,
    );
    expect(radio("みんなでライブ").getAttribute("aria-checked")).toBe("true");
    expect(radio("ひとりでライブ").getAttribute("aria-checked")).toBe("false");
    expect(within(resultPanel()).getByText("みんなでライブ想定")).toBeTruthy();
    expect(within(resultPanel()).queryByText("ひとりでライブ想定")).toBeNull();
    expect((screen.getByLabelText("周回ペース") as HTMLInputElement).value).toBe("28");
    // 885580a のビルドの /refresh の既定の画面から写した値
    expect(barItem("100%まで")).toBe("100%まで501回約 17時間54分");
    expect(barItem("この曲のペース")).toBe("この曲のペース28回/時みんなでライブ");
    expect(barItem("持続ペース")).toBe("持続ペース21回/時休憩 約25%");

    fireEvent.click(radio("ひとりでライブ"));
    expect(within(resultPanel()).getByText("ひとりでライブ想定")).toBeTruthy();
    expect(barItem("この曲のペース")).toContain("ひとりでライブ");
  });
});
