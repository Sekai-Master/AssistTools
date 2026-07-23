import { describe, expect, it } from "vitest";
import { findSameBasePlans } from "./sameBaseAdjust";
import { calcLivePt } from "./calcLivePt";
import { MAX_LIVE_BONUS, SCORE_STEP } from "./constants";

/**
 * findSameBasePlans（P1-6・致命傷Aの根治）の安全網。
 *
 * 破壊者レポートの実測: ボーナス990%・ブリーフ28基礎点で、残額2,000〜60,000の
 * うちエビ(base100)単独で厳密着地可能な残額は54件、うち15件が旧実装（表示
 * フィルタ）では欠落していた。例: req=40,330 / 42,510 / 44,690 / 46,870 は
 * いずれもエビ2本で組める。ここではこれらの残額を実際に findSameBasePlans が
 * 拾えることを固定する。
 */
const BRIEF_BASES = [
  100, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 130,
] as const;
const BONUS = 990;

describe("findSameBasePlans — 致命傷Aの根治（表示フィルタではなく実探索）", () => {
  it.each([40_330, 42_510, 44_690, 46_870])(
    "破壊者レポートの実測ケース req=%i はエビ(base100)単独2本で拾える",
    (req) => {
      const r = findSameBasePlans(req, BONUS, BRIEF_BASES);
      const envy = r.entries.find((e) => e.basePoint === 100);
      expect(envy?.status).toBe("OK");
      expect(envy?.plan?.liveCount).toBe(2);
      expect(envy?.plan?.totalPt).toBe(req);
      // 全ユニットが基礎点100のみ（同一曲縛りの前提）
      expect(envy?.plan?.units.every((u) => u.basePoint === 100)).toBe(true);
    }
  );

  it("entries は基礎点ごとに独立して埋まる（入力順・全件ぶん存在）", () => {
    const req = 40_330;
    const r = findSameBasePlans(req, BONUS, BRIEF_BASES);
    expect(r.entries.map((e) => e.basePoint)).toEqual([...BRIEF_BASES]);
    expect(r.entries).toHaveLength(BRIEF_BASES.length);
    // 基礎点100（エビ）は解けるはず（上のパラメタライズドテストと同一ケース）
    const envy = r.entries.find((e) => e.basePoint === 100);
    expect(envy?.status).toBe("OK");
  });
});

describe("findSameBasePlans — 戻り値の形（探索有無の区別・厳密一致）", () => {
  it("entries は入力 basePoints と同順・同件数（探索していない基礎点との区別の土台）", () => {
    const bases = [100, 114, 130];
    const r = findSameBasePlans(50_000, BONUS, bases);
    expect(r.entries.map((e) => e.basePoint)).toEqual(bases);
  });

  it("status OK の entry は必ず plan を伴い、totalPt が liveRequired と厳密一致する", () => {
    const req = calcLivePt(114, BONUS, 100_000, 2); // 1回で必ず解ける値
    const r = findSameBasePlans(req, BONUS, [100, 114, 130]);
    for (const e of r.entries) {
      if (e.status !== "OK") continue;
      expect(e.plan).toBeDefined();
      expect(e.plan!.totalPt).toBe(req);
      const unitSum = e.plan!.units.reduce((s, u) => s + u.pt * u.count, 0);
      expect(unitSum).toBe(req);
      for (const u of e.plan!.units) {
        expect(u.basePoint).toBe(e.basePoint); // 単一基礎点縛りの検証
        expect(u.pt).toBe(calcLivePt(u.basePoint, BONUS, u.minScore, u.liveBonus));
      }
    }
    // 基礎点114自身は単発で確実に解けるはず（liveRequiredをそこから作った）
    const own = r.entries.find((e) => e.basePoint === 114);
    expect(own?.status).toBe("OK");
    expect(own?.plan?.liveCount).toBe(1);
  });

  it("status NG の entry は plan を持たない", () => {
    // 1 Pt は最小到達Pt未満（どの基礎点でも作れない）ので全滅する。
    const r = findSameBasePlans(1, BONUS, [100, 114, 130]);
    for (const e of r.entries) {
      expect(e.status).toBe("NG");
      expect(e.plan).toBeUndefined();
    }
  });

  it("solved は status OK のみを liveCount 昇順→lbCost 昇順で並べる", () => {
    const req = 50_000;
    const r = findSameBasePlans(req, BONUS, [100, 103, 114, 116, 130]);
    expect(r.solved.length).toBeGreaterThan(0);
    expect(r.solved.length).toBeLessThanOrEqual(r.entries.filter((e) => e.status === "OK").length);
    for (const s of r.solved) {
      expect(s.status).toBe("OK");
      expect(s.plan.totalPt).toBe(req);
    }
    for (let i = 1; i < r.solved.length; i += 1) {
      const prev = r.solved[i - 1].plan;
      const cur = r.solved[i].plan;
      expect(
        cur.liveCount > prev.liveCount || (cur.liveCount === prev.liveCount && cur.lbCost >= prev.lbCost)
      ).toBe(true);
    }
  });

  it("liveRequired 0 は全基礎点が OK・0本の空プラン（調整不要の明示）", () => {
    const r = findSameBasePlans(0, BONUS, [100, 114, 130]);
    for (const e of r.entries) {
      expect(e.status).toBe("OK");
      expect(e.plan).toEqual({ units: [], liveCount: 0, lbCost: 0, totalPt: 0 });
    }
  });

  it("負の liveRequired は全基礎点が NG", () => {
    const r = findSameBasePlans(-100, BONUS, [100, 114, 130]);
    for (const e of r.entries) {
      expect(e.status).toBe("NG");
    }
  });

  it("basePoints が空なら既定基礎点100に退避する（distinctBasePoints と同じ規約）", () => {
    const req = calcLivePt(100, BONUS, 0, 0);
    const r = findSameBasePlans(req, BONUS, []);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].basePoint).toBe(100);
    expect(r.entries[0].status).toBe("OK");
  });

  it("status NG の entry には landability が伝播する（弱点2対応・握り潰し禁止）", () => {
    // req=1 は base100 の最小獲得Pt未満なので原理的に着地不能 → UNREACHABLE。
    const unreachable = findSameBasePlans(1, BONUS, [100]);
    expect(unreachable.entries[0].status).toBe("NG");
    expect(unreachable.entries[0].landability).toBe("UNREACHABLE");

    // req=9,465 は破壊者レポートの偽NGクラス（4本以上×3値以上の解が本来は
    // 存在するが、この探索クラスの死角で見つからない）→ UNPROVEN。
    // 「無い」と「見つからない」の区別が伝わっていることの確認。
    const unproven = findSameBasePlans(9_465, 990, [100]);
    expect(unproven.entries[0].status).toBe("NG");
    expect(unproven.entries[0].landability).toBe("UNPROVEN");
  });

  it("status OK の entry は landability を持たない", () => {
    const r = findSameBasePlans(50_000, BONUS, [100, 114, 130]);
    for (const e of r.entries) {
      if (e.status === "OK") expect(e.landability).toBeUndefined();
    }
  });

  it("maxScoreN を渡すと単発解の探索スコア上限にも反映される", () => {
    // 既定上限(maxScoreN=55)の下では、50回上限×既定上限内の最大Ptでも
    // 到達し得ないほど巨大な値を用意する（回数上限超過で確実にNGになる）。
    // 上限を引き上げると、その1点をちょうど作る単発値として直接解ける。
    const hugeScoreN = 45_000;
    const req = calcLivePt(100, BONUS, hugeScoreN * SCORE_STEP, MAX_LIVE_BONUS);
    const narrow = findSameBasePlans(req, BONUS, [100]);
    expect(narrow.entries[0].status).toBe("NG");
    const wide = findSameBasePlans(req, BONUS, [100], hugeScoreN);
    expect(wide.entries[0].status).toBe("OK");
    expect(wide.entries[0].plan?.liveCount).toBe(1);
  });
});
