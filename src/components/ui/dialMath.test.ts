import { describe, expect, it } from "vitest";
import { type DialDrag, dialAngle, dialAngleOfPoint, dialMove, dialStart, dialValueAt } from "./dialMath";

/** 押して、向き degs の順に動かしたあとの状態。 */
const run = (from: number, ...degs: number[]): DialDrag =>
  degs.reduce((s, d) => dialMove(s, d, 0, 30), dialStart(from, 0, 30));

describe("dialAngle — 値から角度（0〜30 なら 1 分 10°）", () => {
  it("最小は左下 -150°、最大は右下 +150°、真ん中は真上", () => {
    expect(dialAngle(0, 0, 30)).toBe(-150);
    expect(dialAngle(15, 0, 30)).toBe(0);
    expect(dialAngle(30, 0, 30)).toBe(150);
    expect(dialAngle(12, 0, 30)).toBe(-30);
  });

  it("範囲の外は端に収める", () => {
    expect(dialAngle(-3, 0, 30)).toBe(-150);
    expect(dialAngle(45, 0, 30)).toBe(150);
  });
});

describe("dialAngleOfPoint・dialValueAt — 指の位置から向きと値", () => {
  it("真上 0°・右 90°・下 ±180°・左 -90°（画面の座標なので下が +dy）", () => {
    expect(dialAngleOfPoint(0, -10)).toBeCloseTo(0, 9);
    expect(dialAngleOfPoint(10, 0)).toBeCloseTo(90, 9);
    expect(Math.abs(dialAngleOfPoint(0, 10))).toBeCloseTo(180, 9);
    expect(dialAngleOfPoint(-10, 0)).toBeCloseTo(-90, 9);
  });

  it("向きの近い整数。切れ目の中は null", () => {
    expect(dialValueAt(0, 0, 30)).toBe(15);
    expect(dialValueAt(-150, 0, 30)).toBe(0);
    expect(dialValueAt(150, 0, 30)).toBe(30);
    expect(dialValueAt(-26, 0, 30)).toBe(12); // 12.4 → 12
    expect(dialValueAt(-24, 0, 30)).toBe(13); // 12.6 → 13
    expect(dialValueAt(170, 0, 30)).toBeNull();
    expect(dialValueAt(-151, 0, 30)).toBeNull();
  });
});

describe("dialStart — 押した瞬間", () => {
  it("押した向きの値。切れ目を押したら角度の近い端", () => {
    expect(dialStart(-30, 0, 30).value).toBe(12);
    expect(dialStart(170, 0, 30).value).toBe(30);
    expect(dialStart(-170, 0, 30).value).toBe(0);
  });
});

describe("dialMove — 回している途中", () => {
  it("ふつうに回すと指の向きを追う（行きも帰りも）", () => {
    expect(run(0, 10, 20, 30).value).toBe(18);
    expect(run(0, 10, 20, 30, 20, 10, 0, -10).value).toBe(14);
  });

  it("切れ目へ入ったら来た側の端で止まる（29 → 30、1 → 0）", () => {
    expect(run(130, 140, 160, 170).value).toBe(30);
    expect(run(-130, -140, -160, -170).value).toBe(0);
  });

  it("30 を越えて切れ目の向こう（0 の側）へ回し込んでも 30 のまま。戻ってくるとまた追う", () => {
    const over = run(130, 145, 170, -170, -145, -130);
    expect(over.value).toBe(30);
    expect(dialMove(dialMove(over, -160, 0, 30), 170, 0, 30).value).toBe(30);
    expect(run(130, 145, 170, -170, -145, -160, 170, 150, 140).value).toBe(29);
  });

  it("切れ目を 1 回の移動でまたいでも（145° → -145°）端で止まる", () => {
    expect(run(130, 145, -145).value).toBe(30);
    expect(run(-130, -145, 145).value).toBe(0);
  });

  it("0 の側へ回り込んだまま上まで回しても、30 の所へ来るまでは 30 のまま", () => {
    expect(run(140, 150, 170, -170, -140, -90, 0, 90, 120).value).toBe(30);
    expect(run(140, 150, 170, -170, -140, -90, 0, 90, 120, 135, 140).value).toBe(29);
  });

  // ★ 検分 #279 M: 前は「1 回で半周より大きく動いたら端へ」だったので、ここが 0 や 30 に化けた
  it("中心をまたいで向きが反転しても（50° → -130°）、端に化けず前の値で止まる", () => {
    const flipped = run(50, -130);
    expect(flipped.value).toBe(20);
    expect(flipped.held).toBe(true);
    // 反対側で回しても止めたまま
    expect(dialMove(flipped, -120, 0, 30).value).toBe(20);
    expect(dialMove(dialMove(flipped, -175, 0, 30), 175, 0, 30).value).toBe(20);
  });

  it("止めた値の所へ指が戻ってくると（±1 か、値をまたぐと）また追う", () => {
    expect(run(50, -130, -60, 0, 40, 47).value).toBe(20); // 19.7 → 20 の所へ来た
    expect(run(50, -130, -60, 0, 40, 47, 60).value).toBe(21);
    expect(run(50, -130, -60, 0, 30, 60).value).toBe(21); // 30°(18) → 60°(21) で 20 をまたいだ
  });

  it.each([
    [10, -170, 16],
    [-10, 175, 14],
    [0, 130, 15],
    [0, -100, 15],
  ])("素早く振って %i° → %i° と跳んでも、値は %i のまま", (from, to, value) => {
    expect(run(from, to).value).toBe(value);
  });

  it("跳びの境目: 90° までは追い、90° を越えたら止める", () => {
    expect(run(0, 90).value).toBe(24);
    expect(run(0, 91).value).toBe(15);
  });
});
