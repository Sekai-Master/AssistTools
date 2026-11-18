/**
 * @vitest-environment jsdom
 *
 * 結果の固定バー（UX 監査 2026-11-12、指示書の共通の型 4、PR-7）。
 *
 * ★ 既定値で結果が出る計算機（リフレッシュゲージ・必要稼働時間）で、主な数字を画面の下に固定して 1 画面目に出す。
 *   形は周回ラップ計測の主ボタンの固定バー（#241 の LapActionBar）とそろえる: 全幅・下に固定・上に線・
 *   バーの高さぶんページの下に余白。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResultBar } from "./ResultBar";

afterEach(cleanup);

describe("ResultBar", () => {
  it("項目の名前と数字を並べ、結果の領域として名前を持つ", () => {
    render(
      <ResultBar
        items={[
          { label: "100%まで", value: "45回", sub: "約 2時間" },
          { label: "持続ペース", value: "21回/時" },
        ]}
      />,
    );
    const bar = screen.getByRole("region", { name: "計算の結果" });
    expect(bar.textContent).toContain("100%まで");
    expect(bar.textContent).toContain("45回");
    expect(bar.textContent).toContain("約 2時間");
    expect(bar.textContent).toContain("21回/時");
  });

  it("画面の下に固定し、全幅で出す（幅で出し分けない）", () => {
    render(<ResultBar items={[{ label: "到達ポイント", value: "1,234" }]} />);
    const bar = screen.getByRole("region", { name: "計算の結果" });
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("bottom-0");
    expect(bar.className).toContain("inset-x-0");
    expect(bar.className).not.toMatch(/(?:sm|md|lg):hidden/);
  });

  // ★ 親の space-y（Tailwind v4 は最後以外の子に margin-bottom）が付くと、固定のまま 24px 浮いた（/refresh で実測）。外の余白は 0 に固定する
  it("外の余白を 0 に固定する（親の space-y で下から浮かない）", () => {
    render(<ResultBar items={[{ label: "到達ポイント", value: "1,234" }]} />);
    expect(screen.getByRole("region", { name: "計算の結果" }).className).toContain("!m-0");
  });

  it("バーの高さぶんページの下に余白を取り、外したら戻す", () => {
    const { unmount } = render(<ResultBar items={[{ label: "到達ポイント", value: "1,234" }]} />);
    expect(document.body.style.paddingBottom).not.toBe("");
    expect(document.documentElement.style.scrollPaddingBottom).not.toBe("");
    unmount();
    expect(document.body.style.paddingBottom).toBe("");
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });

  it("項目が無いときは案内の 1 行を出す", () => {
    render(<ResultBar items={[]} empty="目標ポイントを入れると出ます" />);
    expect(screen.getByRole("region", { name: "計算の結果" }).textContent).toContain("目標ポイントを入れると出ます");
  });
});
