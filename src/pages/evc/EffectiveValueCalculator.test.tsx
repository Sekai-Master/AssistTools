/**
 * @vitest-environment jsdom
 *
 * スキル実効値計算機の「内部値が空」のときの扱い。
 *
 * ★ 縛るのは「未入力を 0 として計算した数字を出さない」こと（UX 監査 2026-11-12）。
 *   空のまま 0 で計算すると、先頭 150 なら 150 + (0 − 150) × 0.2 = 120 が出る。
 *   入れる前から意味のない数字が大きな字で出ていて、しかも「取り込む」で
 *   内部値 0 を編成に保存できてしまっていた。
 *   明示の「0」は利用者が入れた値なので計算してよい（未入力とは区別する）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import EffectiveValueCalculator from "./EffectiveValueCalculator";
import { createProfile, resetProfilesForTest, setActiveProfile } from "../../lib/profiles";

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetProfilesForTest();
});

// 編成が無いときの案内（ProfileBar）が設定へのリンクを持つので Router が要る
const draw = () =>
  render(
    <MemoryRouter>
      <EffectiveValueCalculator />
    </MemoryRouter>,
  );

/** 結果の段（「この編成の実効値は」を含むパネル）の文字。 */
const resultText = () =>
  screen.getByText(/この編成の実効値は/).closest("section")?.textContent ?? "";

describe("内部値が空のとき", () => {
  it("0 として計算した 120 を出さず、入れると出ることを案内する", () => {
    draw();
    expect(resultText()).not.toContain("120");
    expect(resultText()).toContain("内部値を入れると出ます");
  });

  it("編成への「取り込む」も出さない（内部値 0 を保存させない）", () => {
    // 先頭・内部値を持たない編成にする（「入力に反映」で欄が埋まらないように）
    setActiveProfile(createProfile("テスト", { power: 300_000 }).id);
    draw();
    expect(screen.queryByRole("button", { name: "取り込む" })).toBeNull();
  });

  it("内部値を入れれば計算する（150・620 → 244）", async () => {
    setActiveProfile(createProfile("テスト", { power: 300_000 }).id);
    draw();
    await userEvent.type(screen.getByLabelText("内部値"), "620");
    expect(resultText()).toContain("244");
    expect(screen.getByRole("button", { name: "取り込む" })).toBeTruthy();
  });

  it("明示の 0 は入れた値として計算する（120）", async () => {
    draw();
    await userEvent.type(screen.getByLabelText("内部値"), "0");
    expect(resultText()).toContain("120");
  });

  it("カンマ入りでも数字として読む（1,200 → 360）", async () => {
    draw();
    await userEvent.type(screen.getByLabelText("内部値"), "1,200");
    // 150 + (1200 − 150) × 0.2 = 360
    expect(resultText()).toContain("360");
  });
});

/**
 * ★ 個別入力と OC（特訓前のユニットキャラ）は 2〜5 枠の欄を使う。前は空の枠を 0 として計算し、
 *   個別入力の全部空で「150」、OC の全部空で「80(4)」を出し、「取り込む」も出ていた（検分 #239 中-1）。
 *   枠が 1 つでも空なら結果を出さない（残りを 0 として計算した値も意味がない）。
 */
describe("2〜5 枠の欄が空のとき", () => {
  const slot = (n: number) => screen.getByLabelText(`${n}枠目のスキル値`);

  it("個別入力で全部空なら、150 を出さず取り込むも出さない", async () => {
    setActiveProfile(createProfile("テスト", { power: 300_000 }).id);
    draw();
    await userEvent.click(screen.getByLabelText("スキル値を個別に入力する"));
    expect(resultText()).not.toContain("150");
    expect(resultText()).toContain("すべて入れると出ます");
    expect(screen.queryByRole("button", { name: "取り込む" })).toBeNull();
  });

  it("個別入力で 1 枠だけ入れても、残りが空なら出さない", async () => {
    draw();
    await userEvent.click(screen.getByLabelText("スキル値を個別に入力する"));
    await userEvent.type(slot(2), "120");
    expect(resultText()).toContain("すべて入れると出ます");
  });

  it("個別入力で 4 枠そろえば計算する（0 を含んでよい）", async () => {
    setActiveProfile(createProfile("テスト", { power: 300_000 }).id);
    draw();
    await userEvent.click(screen.getByLabelText("スキル値を個別に入力する"));
    for (const [n, v] of [[2, "120"], [3, "120"], [4, "120"], [5, "0"]] as const) {
      await userEvent.type(slot(n), v);
    }
    // 内部値 150 + 360 = 510 → 150 + 360 × 0.2 = 222
    expect(resultText()).toContain("222");
    expect(screen.getByRole("button", { name: "取り込む" })).toBeTruthy();
  });

  it("OC（特訓前のユニットキャラ）で枠が空なら、80(4) を出さず取り込むも出さない", async () => {
    setActiveProfile(createProfile("テスト", { power: 300_000 }).id);
    draw();
    await userEvent.click(screen.getByRole("button", { name: "ブルフェス" }));
    await userEvent.click(screen.getByRole("button", { name: "特訓前" }));
    await userEvent.click(screen.getByRole("button", { name: "ユニットキャラ" }));
    expect(resultText()).not.toContain("80");
    expect(resultText()).toContain("すべて入れると出ます");
    expect(screen.queryByRole("button", { name: "取り込む" })).toBeNull();
    // 先頭の段の「発動スキル値候補」も、空の枠から作った値は出さない
    expect(screen.queryByText(/発動スキル値候補/)).toBeNull();
  });
});
