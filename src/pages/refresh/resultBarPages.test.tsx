/**
 * @vitest-environment jsdom
 *
 * リフレッシュゲージ・必要稼働時間で、既定値の結果の主な数字が画面下の固定バーに出ること（UX 監査 2026-11-12、PR-7）。
 * ★ 前は結果が 2 画面目（/refresh y≈926、/worktime y≈1341）にあり、開いた瞬間には見えなかった。
 *   バーの数字は下の結果の枠と同じ値（別に計算しない）であることも縛る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RefreshGaugeCalculator from "./RefreshGaugeCalculator";
import WorkTimeCalculator from "../worktime/WorkTimeCalculator";
import { resetProfilesForTest } from "../../lib/profiles";

// 独りんぼエンヴィー（既定の曲。public/MusicDatas の値）
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

const bar = () => screen.getByRole("region", { name: "計算の結果" });
/** 下の結果の枠（Panel）の中の Stat の数字。 */
const statIn = (panelTitle: string, label: string) => {
  const panel = screen.getByRole("heading", { name: panelTitle }).closest("section")!;
  const labelEl = within(panel).getByText(label);
  return labelEl.parentElement!.textContent ?? "";
};

describe("リフレッシュゲージ", () => {
  it("既定値で、100%までの回数と持続ペースが固定バーに出る（下の枠と同じ値）", () => {
    render(
      <MemoryRouter>
        <RefreshGaugeCalculator />
      </MemoryRouter>,
    );
    const text = bar().textContent ?? "";
    expect(text).toContain("100%まで");
    expect(text).toContain("持続ペース");
    const runway = statIn("この曲で走ると", "100%まで").match(/(\d+)回/)![1];
    expect(text).toContain(`${runway}回`);
  });
});

describe("必要稼働時間", () => {
  const draw = () =>
    render(
      <MemoryRouter>
        <WorkTimeCalculator />
      </MemoryRouter>,
    );

  it("順算の既定値で、到達ポイント・総稼働・必要な石が固定バーに出る（下の枠と同じ値）", () => {
    draw();
    const text = bar().textContent ?? "";
    for (const label of ["到達ポイント", "総稼働", "必要な石"]) expect(text).toContain(label);
    const pt = statIn("結果", "到達ポイント").replace("到達ポイント", "").trim();
    expect(text).toContain(pt);
  });

  it("逆算では、目標を入れるまでは案内、入れると必要稼働時間が出る", async () => {
    draw();
    await userEvent.click(screen.getByRole("radio", { name: "逆算（→必要時間）" }));
    expect(bar().textContent).toContain("目標ポイントを入れると出ます");
    await userEvent.type(screen.getByLabelText("目標ポイント"), "10000000");
    expect(bar().textContent).toContain("必要稼働時間");
  });
});
