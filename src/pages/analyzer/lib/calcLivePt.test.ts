import { describe, expect, it } from "vitest";
import { LIVE_BONUS_MULTIPLIERS, calcLivePt, maxEfficientLiveBonus } from "./calcLivePt";

describe("calcLivePt", () => {
  it("実機実測値を再現する（base=114, bonus=416%, score=1,224,240 → 946）", () => {
    // 「小数第1位まで保持」を確定させた実測。base=100では3方式が同値になり判別
    // できないため、この114の実測が丸め方式の一次証拠になっている。
    expect(calcLivePt(114, 416, 1_224_240, 0)).toBe(946);
  });

  it("最小値は100（score=0, bonus=0, base=100, 0炊き）", () => {
    expect(calcLivePt(100, 0, 0, 0)).toBe(100);
  });

  it("ライブボーナス倍率が正しく乗る", () => {
    const zero = calcLivePt(100, 100, 500_000, 0);
    expect(calcLivePt(100, 100, 500_000, 1)).toBe(zero * LIVE_BONUS_MULTIPLIERS[1]);
    expect(calcLivePt(100, 100, 500_000, 10)).toBe(zero * LIVE_BONUS_MULTIPLIERS[10]);
  });

  it("0.5%刻みのボーナスでも整数で正しく処理する", () => {
    // bonus に小数が来ても NaN や誤差を出さない（内部で100倍整数化している）。
    const v = calcLivePt(100, 12.5, 400_000, 0);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });

  it("どの入力でも整数を返す（浮動小数点の桁落ちで壊れない）", () => {
    // 割り算を最後まで遅らせているので、base×step のところで
    // 32299.999... のような桁落ちが起きず、常に整数になる。
    for (const base of [100, 114, 125, 150]) {
      for (const bonus of [0, 12.5, 217.5, 615]) {
        for (const score of [0, 20_000, 900_000, 2_500_000]) {
          expect(Number.isInteger(calcLivePt(base, bonus, score, 0))).toBe(true);
        }
      }
    }
  });

  it("スコアが2万点をまたぐと係数が1上がる", () => {
    const below = calcLivePt(100, 100, 19_999, 0);
    const at = calcLivePt(100, 100, 20_000, 0);
    expect(at).toBeGreaterThan(below);
  });
});

/**
 * maxEfficientLiveBonus（P2-8のハードコード解消）の安全網。
 *
 * 弱点7・弱点2で「3焚き/5焚き」という数字がUI文言に直書きされ、表の改定に
 * 追随しなかった反省を踏まえ、この関数だけで現行表・仮想の改定表の両方から
 * 正しい閾値が導出できることを固定する。
 */
describe("maxEfficientLiveBonus", () => {
  it("現行表（2024-09-28改定）では5を返す", () => {
    // 1〜5炊きの効率: 5/1=5.00, 10/2=5.00, 15/3=5.00, 20/4=5.00, 25/5=5.00
    // 6炊き以降: 27/6=4.50 と下がるため、横ばいの終わりは5。
    expect(maxEfficientLiveBonus()).toBe(5);
    expect(maxEfficientLiveBonus(LIVE_BONUS_MULTIPLIERS)).toBe(5);
  });

  it("仮想の旧表（3炊きで頭打ち）では3を返す", () => {
    // 弱点7の元ネタ: 旧仕様は 4→19（効率4.75）で3炊き(効率5.00)から早々に落ちていた。
    const oldTable: Record<number, number> = { 0: 1, 1: 5, 2: 10, 3: 15, 4: 19, 5: 23, 6: 26 };
    expect(maxEfficientLiveBonus(oldTable)).toBe(3);
  });

  it("効率が単調減少する表では1を返す（最大効率は1炊きのみ）", () => {
    const table: Record<number, number> = { 0: 1, 1: 5, 2: 8, 3: 9 };
    expect(maxEfficientLiveBonus(table)).toBe(1);
  });

  it("0炊きは1LBあたりの概念に当てはまらないため計算対象から除く", () => {
    // 0炊きの倍率をどう設定しても結果が変わらないこと（除外の確認）。
    const withZero: Record<number, number> = { 0: 999, 1: 5, 2: 10, 3: 15 };
    const withoutZero: Record<number, number> = { 1: 5, 2: 10, 3: 15 };
    expect(maxEfficientLiveBonus(withZero)).toBe(maxEfficientLiveBonus(withoutZero));
  });

  it("空の表では0を返す（防御的な既定値）", () => {
    expect(maxEfficientLiveBonus({})).toBe(0);
  });
});
