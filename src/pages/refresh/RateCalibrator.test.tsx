/**
 * @vitest-environment jsdom
 *
 * 時速・周回ペースの較正 UI。**押した結果どの値が動くか**を縛る。
 *
 * 計算そのものは lib/rateTools.test.ts が見ている。ここで見るのは配線
 * ── どのボタンがどの setter を呼ぶか。3方式あって、それぞれ書き込む先が違うので、
 * 取り違えると「押したのに別の欄が変わる」という一番たちの悪い壊れ方をする。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RateCalibrator } from "./RateCalibrator";

// このリポジトリは vitest の globals を使っていないので、
// testing-library の自動クリーンアップが入らない。明示的に消す
//（消さないと前のテストの DOM が残り、同じラベルが複数見つかって落ちる）。
afterEach(cleanup);

function setup(over: Partial<Parameters<typeof RateCalibrator>[0]> = {}) {
  const props = {
    hourlyRate: "500000",
    setHourlyRate: vi.fn(),
    refTaki: 5,
    setRefTaki: vi.fn(),
    pace: "28",
    setPace: vi.fn(),
    ...over,
  };
  render(<RateCalibrator {...props} />);
  return props;
}

// `<details>` の中身は閉じていても DOM に居る（表示だけの話）ので、
// 開く操作をしなくても取得・操作できる。
// 方式の切り替えは SegmentedControl ＝ role="radio"（見た目は button だが radiogroup）。

describe("実績から", () => {
  it("時間と獲得ptから時速を出して、時速と基準焚き数の両方を書き換える", async () => {
    const user = userEvent.setup();
    const p = setup();

    // 既定は60分なので、250,000pt なら時速も 250,000。
    await user.type(
      screen.getByLabelText("この時間で稼いだポイント"),
      "250000",
    );
    const btn = await screen.findByRole("button", {
      name: /時速250,000にする/,
    });
    await user.click(btn);

    expect(p.setHourlyRate).toHaveBeenCalledWith("250000");
    // ★ 焚き数も一緒に書く。時速だけ更新すると、別の焚き数の時速が
    //   前の基準焚き数のものとして扱われて黙って狂う。
    expect(p.setRefTaki).toHaveBeenCalledWith(5);
  });

  it("獲得ptが空のあいだはボタンを押せない", () => {
    setup();
    // jest-dom は入れていないので、素の DOM で見る（マッチャを増やさない）。
    const btn = screen.getByRole("button", {
      name: /時速\?にする/,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("1回×ペース", () => {
  it("1回の獲得pt × ペース を時速にする", async () => {
    const user = userEvent.setup();
    const p = setup({ pace: "28" });
    await user.click(screen.getByRole("radio", { name: "1回×ペース" }));

    await user.type(screen.getByLabelText("1回の獲得ポイント"), "18000");
    await user.click(
      await screen.findByRole("button", { name: /時速504,000にする/ }),
    );

    expect(p.setHourlyRate).toHaveBeenCalledWith("504000");
  });

  it("ペース欄はページ側と同じ値を書き換える（別々に持たない）", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("radio", { name: "1回×ペース" }));

    await user.clear(screen.getByLabelText("周回ペース"));
    expect(p.setPace).toHaveBeenCalled();
  });
});

describe("ペースを出す", () => {
  it("時速 ÷ 1回の獲得pt をペースにする（時速は書き換えない）", async () => {
    const user = userEvent.setup();
    const p = setup({ hourlyRate: "504000" });
    await user.click(screen.getByRole("radio", { name: "ペースを出す" }));

    await user.type(screen.getByLabelText("1回の獲得ポイント"), "18000");
    await user.click(
      await screen.findByRole("button", { name: /ペース28回\/時 にする/ }),
    );

    expect(p.setPace).toHaveBeenCalledWith("28");
    // ★ この方式は時速を「入力」として使う。書き換えたら循環する。
    expect(p.setHourlyRate).not.toHaveBeenCalled();
  });

  it("いま設定されている基準焚き数を出す（揃っていないと黙って狂うため）", async () => {
    const user = userEvent.setup();
    setup({ refTaki: 7 });
    await user.click(screen.getByRole("radio", { name: "ペースを出す" }));
    expect(screen.getByText("焚き7")).toBeTruthy();
  });
});
