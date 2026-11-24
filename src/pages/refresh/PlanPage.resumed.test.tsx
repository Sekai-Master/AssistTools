/**
 * @vitest-environment jsdom
 *
 * みんなでライブが再開したとき（src/lib/liveSuspension.ts の MULTI_LIVE_SUSPENDED を false に戻したとき）の周回プラン。
 *
 * ★ 縛ること: 開いたときの想定がみんなでライブに戻り、周回ペースの欄と回数が足す前と同じ（28 回/時）になる。
 *   ひとりでライブ想定は選べば使える。
 * ★ vi.mock はファイル単位で効くので、止まっている側（PlanPage.live.test.tsx）とファイルを分けた。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: false }));
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
import { SOLO_DEFAULT_RATE } from "./lib/liveAssumption";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetProfilesForTest();
});

const radio = (name: string) =>
  within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", { name });
const paceInput = () => screen.getByLabelText("周回ペース") as HTMLInputElement;

describe("みんなでライブが再開したとき", () => {
  it("みんなでライブで開き、周回ペース 28・稼働 1 時間 28 回（足す前と同じ）", () => {
    render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );
    expect(radio("みんなでライブ").getAttribute("aria-checked")).toBe("true");
    expect(paceInput().value).toBe("28");
    expect(screen.getByText("既定28。長い曲は自動で少なくなります")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "＋稼働" }));
    expect(screen.getByText("≈28回")).toBeTruthy();
    expect(screen.getByText("みんなでライブ想定")).toBeTruthy();

    fireEvent.click(radio("ひとりでライブ"));
    expect(paceInput().value).toBe(String(SOLO_DEFAULT_RATE));
    expect(screen.getByText("ひとりでライブ想定")).toBeTruthy();
  });
});
