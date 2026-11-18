/**
 * アンコールの判断（encoreLogic）の純関数。
 *
 * ★ 縛ること
 *   - 判定の境目: 自分の実効値が部屋の最高と同じなら「取りに行ってよい」（差は 0）
 *   - 曲の重みは skillScoreMulti の 6 番目（アンコールの枠）
 *   - スコアの差は efficiency.ts の calcScore と同じ式から出る（式を二重に持たない）
 *   - 総合力が空なら点は出さず、割合だけ
 *   - 入力の全角数字・空・負の値
 */
import { describe, expect, it } from "vitest";
import { calcScore, DEFAULT_PARAMS, type EfficiencyEntry } from "../ranking/lib/efficiency";
import { encoreGap, encoreVerdict, encoreWeight, parseRoomBest } from "./encoreLogic";

/** 計算しやすい架空の曲。協力の base = 1.1 + 0.1 × 0.5 = 1.15、通常の 5 枠は 0.07 ずつ、アンコール 0.15。 */
const entry = (over: Partial<EfficiencyEntry> = {}): EfficiencyEntry => ({
  musicId: "t",
  title: "テスト曲",
  difficulty: "expert",
  playLevel: 25,
  noteCount: 500,
  baseScore: 1.1,
  skillScoreSolo: [0.07, 0.07, 0.07, 0.07, 0.07, 0.07],
  baseScoreAuto: 0.7,
  skillScoreAuto: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
  skillScoreMulti: [0.07, 0.07, 0.07, 0.07, 0.07, 0.15],
  feverScore: 0.1,
  musicTime: 120,
  eventRate: 100,
  ...over,
});

describe("parseRoomBest（部屋でいちばん高い実効値の欄）", () => {
  it("半角の数字を読む", () => {
    expect(parseRoomBest("280")).toEqual({ kind: "ok", value: 280 });
  });

  it("全角の数字も読む", () => {
    expect(parseRoomBest("２８０")).toEqual({ kind: "ok", value: 280 });
  });

  it("空・空白だけは空として扱う（0 にしない）", () => {
    expect(parseRoomBest("")).toEqual({ kind: "empty" });
    expect(parseRoomBest("   ")).toEqual({ kind: "empty" });
  });

  it("負の値は弾く", () => {
    expect(parseRoomBest("-5")).toEqual({ kind: "negative" });
  });

  it("数でない文字は弾く", () => {
    expect(parseRoomBest("abc")).toEqual({ kind: "invalid" });
  });

  it("全角のマイナスも負として扱う", () => {
    expect(parseRoomBest("－5")).toEqual({ kind: "negative" });
    expect(parseRoomBest("−5")).toEqual({ kind: "negative" });
  });

  it("16 進・指数の書き方は通さない（数字と小数点だけ）", () => {
    expect(parseRoomBest("0x1F4")).toEqual({ kind: "invalid" });
    expect(parseRoomBest("1e3")).toEqual({ kind: "invalid" });
  });

  it("小数は読む", () => {
    expect(parseRoomBest("262.5")).toEqual({ kind: "ok", value: 262.5 });
  });

  it("1000 を超える値は弾く（編成の先頭スキルの上限と同じ）", () => {
    expect(parseRoomBest("1000")).toEqual({ kind: "ok", value: 1000 });
    expect(parseRoomBest("1001")).toEqual({ kind: "tooLarge", max: 1000 });
  });
});

describe("encoreVerdict（取りに行くか譲るか）", () => {
  it("部屋の最高と同じなら取りに行ってよい", () => {
    expect(encoreVerdict(262, 262)).toBe("take");
  });

  it("上なら取りに行ってよい", () => {
    expect(encoreVerdict(263, 262)).toBe("take");
  });

  it("下なら譲る", () => {
    expect(encoreVerdict(261, 262)).toBe("yield");
  });

  it("候補が複数あるとき: 全部が同じか上なら取りに行く、全部が下なら譲る、幅の中なら言い切らない", () => {
    expect(encoreVerdict(255, 250, [250, 260])).toBe("take");
    expect(encoreVerdict(255, 261, [250, 260])).toBe("yield");
    expect(encoreVerdict(255, 255, [250, 260])).toBe("split");
    expect(encoreVerdict(255, 260, [250, 260])).toBe("split");
  });
});

describe("encoreWeight（曲のアンコールの重み）", () => {
  it("協力の重み（skillScoreMulti）の 6 番目を取る", () => {
    expect(encoreWeight(entry({ skillScoreMulti: [1, 2, 3, 4, 5, 6] }))).toBe(6);
  });

  it("ソロの重みは使わない", () => {
    expect(
      encoreWeight(entry({ skillScoreSolo: [9, 9, 9, 9, 9, 9], skillScoreMulti: [1, 2, 3, 4, 5, 6] })),
    ).toBe(6);
  });

  it("協力の重みが無い・長さが 6 でない曲は null（黙って 0 にしない）", () => {
    expect(encoreWeight(entry({ skillScoreMulti: null }))).toBeNull();
    expect(encoreWeight(entry({ skillScoreMulti: [1, 2, 3, 4, 5] }))).toBeNull();
  });
});

describe("encoreGap（最高の人が取った場合 − 自分が取った場合の 1 人あたりのスコア）", () => {
  it("総合力があれば点で出す: (300 − 200) × 0.15 ÷ 100 × 30 万 × 4 ≒ 18 万点", () => {
    const gap = encoreGap(entry(), 200, 300, 300_000);
    expect(gap).not.toBeNull();
    expect(Math.abs(gap!.points! - 180_000)).toBeLessThanOrEqual(2);
  });

  it("割合は、自分が取ったときのスコアに対する差（ほかの 3 人は部屋の最高と同じとして）", () => {
    // 通常の 5 枠の平均 = (200 + 300 × 4) ÷ 5 = 280
    // 自分が取ったときの rate = 1.15 + 280 × 0.35 ÷ 100 + 200 × 0.15 ÷ 100 = 2.43
    // 差の rate = 100 × 0.15 ÷ 100 = 0.15 → 0.15 ÷ 2.43
    const gap = encoreGap(entry(), 200, 300, 300_000);
    expect(gap!.ratio).toBeCloseTo(0.15 / 2.43, 4);
  });

  it("総合力が空なら点は出さず、割合だけ出す", () => {
    const gap = encoreGap(entry(), 200, 300, null);
    expect(gap).not.toBeNull();
    expect(gap!.points).toBeNull();
    expect(gap!.ratio).toBeCloseTo(0.15 / 2.43, 4);
  });

  it("総合力が 0 以下も空と同じ扱い", () => {
    expect(encoreGap(entry(), 200, 300, 0)!.points).toBeNull();
    expect(encoreGap(entry(), 200, 300, -1)!.points).toBeNull();
  });

  it("同じ値なら差は 0", () => {
    const gap = encoreGap(entry(), 262, 262, 300_000);
    expect(gap!.points).toBe(0);
    expect(gap!.ratio).toBe(0);
  });

  it("自分のほうが高ければ差は負（自分が取るほうが得）", () => {
    const gap = encoreGap(entry(), 300, 200, 300_000);
    expect(gap!.points!).toBeLessThan(0);
    expect(gap!.ratio).toBeLessThan(0);
  });

  it("割合の分母は、実効値の低いほうが取ったときのスコア（自分が高いときは最高の人が取ったとき）", () => {
    // 自分 300・ほかの最高 200: 通常の 5 枠の平均 = (300 + 200 × 4) ÷ 5 = 220
    // 最高の人（200）が取ったときの rate = 1.15 + 220 × 0.35 ÷ 100 + 200 × 0.15 ÷ 100 = 2.22
    const gap = encoreGap(entry(), 300, 200, 300_000);
    expect(gap!.ratio).toBeCloseTo(-0.15 / 2.22, 4);
  });

  it("曲の重みが大きいほど差も大きい", () => {
    const small = encoreGap(entry({ skillScoreMulti: [0.07, 0.07, 0.07, 0.07, 0.07, 0.1] }), 200, 300, 300_000);
    const large = encoreGap(entry({ skillScoreMulti: [0.07, 0.07, 0.07, 0.07, 0.07, 0.2] }), 200, 300, 300_000);
    expect(large!.points!).toBeGreaterThan(small!.points!);
  });

  it("協力の重みかフィーバーが欠けた曲は null", () => {
    expect(encoreGap(entry({ skillScoreMulti: null }), 200, 300, 300_000)).toBeNull();
    expect(encoreGap(entry({ feverScore: null }), 200, 300, 300_000)).toBeNull();
  });

  it("全員が同じ実効値なら、分母は効率曲ランキングの calcScore と同じスコアになる（式が 1 つ）", () => {
    // 差が 0 なので ratio からは分母が読めない。1 だけずらして、差 ÷ 割合 で分母を戻す
    const e = entry();
    const power = 250_000;
    const gap = encoreGap(e, 250, 251, power)!;
    const denom = gap.points! / gap.ratio;
    const ranking = calcScore(e, { ...DEFAULT_PARAMS, power, skillLeader: 250, skillTotal: 250 }, "multi")!;
    // 1 だけずらした分（通常の枠の平均が 0.8 上がる）と floor の誤差を見込む
    expect(Math.abs(denom - ranking) / ranking).toBeLessThan(0.005);
  });
});
