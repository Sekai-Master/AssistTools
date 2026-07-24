import { describe, expect, it } from "vitest";
import { chooseDynamicReserve } from "./dynamicReserve";
import { allocateMySekai } from "./mySekai";
import { buildReachablePtTable, planFromReachablePtTable } from "./multiLiveAdjust";
import { calcLivePt } from "./calcLivePt";
import { ADJUST_LIVE_BONUSES, planLiveAdjustment } from "./liveAdjust";
import { DEFAULT_MAX_SCORE_N, LIVE_ADJUST_RESERVE } from "./constants";

/**
 * dynamicReserve（R5 → R6 §2）の安全網。
 *
 * R6 での方針転換:
 *   - 確保額の候補が step2ABase 起点の下方向にも伸びた（採取を最大化する小確保額）。
 *   - 優先順位を「okA&&okB の最小」→「okA||okB の最小」→「step2ABase」に刷新。
 *   - okA は単発 planLiveAdjustment が NG のときだけ modeA複数回化（planModeAMulti）を見る。
 *
 * 守るべき性質:
 *   1. minPtPerLive はボーナス依存で動く（R0 の係数）。
 *   2. 採用 reserve は候補格子上にあり、okA||okB が成立する。
 *   3. **レガシー reserve=100 で着地できた入力は新実装でも着地する**（一方向含意・破壊者診断の本丸）。
 *   4. 既定引数の allocateMySekai は従来値と厳密一致（レガシー凍結の担保）。
 */

const BRIEF_BASES = [
  100, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 130,
] as const;

/** そこそこ大きい単価（990%・ワールドパス相当）。マイセカイが実際に配分される。 */
const UNIT = 4500;

/** 採用 reserve が候補格子（step2ABase + k×step または r0 + k×step）に載っているか。 */
function onCandidateLattice(reserve: number, step2ABase: number, minPtPerLive: number): boolean {
  const r0 = 4 * minPtPerLive; // (EXHAUSTIVE_MAX_LIVES+1)×minPtPerLive
  const fromBase = reserve - step2ABase;
  const fromR0 = reserve - r0;
  return (fromBase >= 0 && fromBase % minPtPerLive === 0) || (fromR0 >= 0 && fromR0 % minPtPerLive === 0);
}

describe("dynamicReserve — R0 / minPtPerLive の動的性（ボーナス依存）", () => {
  it("bonus990% の minPtPerLive は 1,090 で、採用 reserve は候補格子上・okA&&okB が成立", () => {
    expect(calcLivePt(100, 990, 0, 0)).toBe(1_090);
    const r = chooseDynamicReserve({
      adjustableDiff: 300_000,
      unitBasePt: UNIT,
      bonus: 990,
      basePoints: BRIEF_BASES,
      step2ABase: 100,
      liveBonusesA: ADJUST_LIVE_BONUSES,
    });
    expect(r.minPtPerLive).toBe(1_090);
    expect(onCandidateLattice(r.reserve, 100, r.minPtPerLive)).toBe(true);
    // 大きい差分では両モードが両立する最小確保額が採られる
    expect(r.okA && r.okB).toBe(true);
  });

  it("ボーナスを変えると minPtPerLive（＝R0の係数）が動く", () => {
    const at = (bonus: number) =>
      chooseDynamicReserve({
        adjustableDiff: 300_000,
        unitBasePt: UNIT,
        bonus,
        basePoints: BRIEF_BASES,
        step2ABase: 100,
        liveBonusesA: ADJUST_LIVE_BONUSES,
      }).minPtPerLive;
    expect(at(990)).toBe(calcLivePt(100, 990, 0, 0));
    expect(at(500)).toBe(calcLivePt(100, 500, 0, 0));
    expect(at(200)).toBe(calcLivePt(100, 200, 0, 0));
    expect(new Set([at(990), at(500), at(200)]).size).toBe(3);
  });

  it("採用 reserve は okA∨okB を満たす（穴帯に落とさない・R5 の趣旨を維持）", () => {
    const r = chooseDynamicReserve({
      adjustableDiff: 300_000,
      unitBasePt: UNIT,
      bonus: 990,
      basePoints: BRIEF_BASES,
      step2ABase: 100,
      liveBonusesA: ADJUST_LIVE_BONUSES,
    });
    expect(r.okA || r.okB).toBe(true);
    expect(onCandidateLattice(r.reserve, 100, r.minPtPerLive)).toBe(true);
  });
});

describe("dynamicReserve — 確保後の Step2 着地可能性（取りすぎない）", () => {
  const BONUSES = [200, 416, 615, 990] as const;
  const DIFFS = [12_345, 55_555, 130_000, 470_000] as const;

  it.each(BONUSES.flatMap((bonus) => DIFFS.map((diff) => ({ bonus, diff }))))(
    "bonus %s・diff は確保後の liveRequired が B（複数回）で着地できる",
    ({ bonus, diff }) => {
      const r = chooseDynamicReserve({
        adjustableDiff: diff,
        unitBasePt: UNIT,
        bonus,
        basePoints: BRIEF_BASES,
        step2ABase: 100,
        liveBonusesA: ADJUST_LIVE_BONUSES,
      });
      const table = buildReachablePtTable(bonus, BRIEF_BASES);
      const landsB = planFromReachablePtTable(r.liveRequired, table).status === "OK";
      expect(r.okB).toBe(landsB);
      // ブリーフが名指しで保証する B はこれらの大差分では着地できているべき
      expect(r.okB).toBe(true);
      expect(r.allocation.totalPt + r.liveRequired).toBe(diff);
    }
  );
});

describe("dynamicReserve — 比較プロパティ（レガシーOK ⇒ 新OK・破壊者診断の本丸）", () => {
  it("レガシー reserve=100 で単発着地できた diff は、新実装でも okA∨okB で着地する", () => {
    // 破壊者が検出した劣化（diff=2,042 で採取丸ごとスキップ→着地不能）を含む帯を掃引。
    // 逆行（レガシーOKなのに新NG）のみを禁止する一方向含意。新が多く着地するのは許容。
    const bonus = 990;
    const table = buildReachablePtTable(bonus, BRIEF_BASES); // 使い回しで高速化
    // 含意はレガシー reserve=100 の okA が新候補列の候補100の okA に含まれることから構造的に
    // 保証される（コメント §3）。ここは回帰トリップワイヤなので素数刻みの spot-check で足りる。
    // 小差分側（採取スキップが起きる帯）は密に、大差分側は疎に。破壊者の 2,042 は必ず含める。
    const diffs = new Set<number>([2_042]);
    for (let d = 1; d <= 8_000; d += 31) diffs.add(d); // 穴帯・採取スキップ域を密に
    for (let d = 8_000; d <= 30_000; d += 211) diffs.add(d); // 大差分側は疎に
    let regressions = 0;
    for (const diff of diffs) {
      const legacyAlloc = allocateMySekai(diff, UNIT, LIVE_ADJUST_RESERVE);
      const legacyRemainder = diff - legacyAlloc.totalPt;
      const legacyOk =
        planLiveAdjustment(legacyRemainder, bonus, ADJUST_LIVE_BONUSES, DEFAULT_MAX_SCORE_N, 100)
          .status === "OK";
      if (!legacyOk) continue;
      const r = chooseDynamicReserve({
        adjustableDiff: diff,
        unitBasePt: UNIT,
        bonus,
        basePoints: BRIEF_BASES,
        step2ABase: 100,
        liveBonusesA: ADJUST_LIVE_BONUSES,
        table,
      });
      if (!(r.okA || r.okB)) regressions += 1;
    }
    expect(regressions).toBe(0);
  }, 60_000);

  it("穴帯回帰: 大 diff の残額が穴帯に落ちず、両モードが両立する（優先順位1が効く）", () => {
    // R5 が直した「大 diff で残額が [1,090, 6,807] の穴に落ちる」ケースの固定。
    const r = chooseDynamicReserve({
      adjustableDiff: 470_000,
      unitBasePt: UNIT,
      bonus: 990,
      basePoints: BRIEF_BASES,
      step2ABase: 100,
      liveBonusesA: ADJUST_LIVE_BONUSES,
    });
    expect(r.okA && r.okB).toBe(true);
    expect(r.allocation.totalPt + r.liveRequired).toBe(470_000);
  });
});

describe("dynamicReserve — レガシー allocateMySekai の凍結", () => {
  it("reserve を省略した allocateMySekai は LIVE_ADJUST_RESERVE 指定と厳密一致", () => {
    for (const diff of [1_100, 3_333, 7_777, 50_000, 107_693]) {
      const omitted = allocateMySekai(diff, UNIT);
      const explicit = allocateMySekai(diff, UNIT, LIVE_ADJUST_RESERVE);
      expect(omitted).toEqual(explicit);
    }
  });

  it("reserve を大きくすると配分が減る（取りすぎ抑制の効き）", () => {
    const small = allocateMySekai(300_000, UNIT, LIVE_ADJUST_RESERVE);
    const large = allocateMySekai(300_000, UNIT, 20_000);
    expect(large.totalPt).toBeLessThanOrEqual(small.totalPt);
    expect(large.totalPt).toBeLessThanOrEqual(300_000 - 20_000);
  });
});
