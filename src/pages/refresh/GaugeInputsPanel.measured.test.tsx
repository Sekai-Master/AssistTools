/**
 * @vitest-environment jsdom
 *
 * ひとりでライブのロスを実測し終えたとき（src/lib/overhead.ts の SOLO_OVERHEAD_PROVISIONAL を false にしたとき）、
 * リフレッシュゲージの画面から「仮」の字が消えること（指揮 2026-11-19）。
 *
 * ★ 「仮」と出すかは印だけで決める。値（OVERHEAD_SEC.solo）が 33 かどうかでは判定しない。
 *   ここでは値を 33 のままにして印だけ false にし、値で判定していたら落ちるようにしている。
 * ★ vi.mock はファイル単位で効くので、印が true の場合（いまの土台）のテストとはファイルを分けた。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/overhead", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/overhead")>()),
  SOLO_OVERHEAD_PROVISIONAL: false,
}));

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
import { OVERHEAD_SEC } from "../../lib/overhead";
import { SOLO_DEFAULT_RATE } from "./lib/liveAssumption";

afterEach(cleanup);

describe("ひとりでライブのロスが実測済み（印が false）", () => {
  it("ひとりでライブ想定で「入力について」を開いても、ページのどこにも「仮」が出ない", () => {
    render(
      <MemoryRouter>
        <RefreshGaugeCalculator />
      </MemoryRouter>,
    );
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "ライブの種類" })).getByRole("radio", {
        name: "ひとりでライブ",
      }),
    );
    const about = screen.getByText("入力について", { selector: "summary" }).closest("details")!;
    about.open = true;
    const text = about.textContent ?? "";
    // 説明そのものは残る（既定のペースとロスの秒数）
    expect(text).toContain(`既定${SOLO_DEFAULT_RATE}`);
    expect(text).toContain(`${OVERHEAD_SEC.solo}秒`);
    expect(document.body.textContent).not.toContain("仮");
    expect(document.body.textContent).not.toContain("実測していない");
  });
});
