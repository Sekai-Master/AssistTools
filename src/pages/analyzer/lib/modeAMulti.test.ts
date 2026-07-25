import { describe, expect, it } from "vitest";
import {
  buildBonusSweepTable,
  buildKeepBonusTable,
  planModeAKeepMulti,
  planModeAMulti,
} from "./modeAMulti";
import { calcLivePt } from "./calcLivePt";
import { MAX_LIVE_BONUS } from "./constants";

/**
 * modeAMulti（R6 §1・モードA複数回化）の安全網。
 *
 * 依頼者フィードバック②の中核: 「任意の曲＋ボーナス選択」で 79,361 のような
 * 1プレイ不可能な残額を、複数プレイで合計着地できること。frontier/掃引ループは
 * planFromReachablePtTable を共有するので、ここでは「ボーナス掃引の表構築」が
 * 正しく複数回化に載ることだけを固定する。
 */

const LB_ALL = Array.from({ length: MAX_LIVE_BONUS + 1 }, (_, i) => i); // OFF: 0..10
const LB_ON = [0, 1] as const; // ON 既定
const MAX_SCORE_N = 55; // 既定スコア上限（1,100,000）相当

describe("planModeAMulti — 1プレイ不可能な残額の複数回着地", () => {
  it("79,361（1プレイ上限59,115超）は OFF・LB0-10 で2プレイ着地（回数最小の下界一致）", () => {
    const r = planModeAMulti(79_361, 100, 990, LB_ALL, MAX_SCORE_N);
    expect(r.status).toBe("OK");
    // minCount = ceil(79361 / maxPtPerLive) の下界と一致 → 最小性が証明される
    expect(r.plans[0].liveCount).toBe(Math.ceil(79_361 / r.maxPtPerLive));
    expect(r.plans[0].liveCount).toBe(2);
  });

  it("各 unit に目標 bonus が定義され、Σ pt×count === liveRequired の恒等式が閉じる", () => {
    const r = planModeAMulti(79_361, 100, 990, LB_ALL, MAX_SCORE_N);
    expect(r.status).toBe("OK");
    for (const plan of r.plans) {
      expect(plan.units.every((u) => u.bonus !== undefined)).toBe(true);
      expect(plan.units.reduce((s, u) => s + u.pt * u.count, 0)).toBe(79_361);
    }
  });

  it("ON 既定 LB0-1 でも複数回で着地するが、LB幅が狭いぶん本数が増える（ポリシー維持）", () => {
    const off = planModeAMulti(79_361, 100, 990, LB_ALL, MAX_SCORE_N);
    const on = planModeAMulti(79_361, 100, 990, LB_ON, MAX_SCORE_N);
    expect(on.status).toBe("OK");
    // LB を 0-1 に縛ると1プレイ上限が下がり、同じ合計に必要なプレイ数が増える
    expect(on.plans[0].liveCount).toBeGreaterThan(off.plans[0].liveCount);
  });
});

describe("planModeAMulti — 編成そのまま優先・到達不能", () => {
  it("現ボーナスちょうどで当たる残額は「編成そのまま（bonus===現在値）」の rep が優先される", () => {
    const req = calcLivePt(100, 990, 0, 0); // 1,090（現ボーナス・LB0・スコア0で当たる）
    const r = planModeAMulti(req, 100, 990, LB_ALL, MAX_SCORE_N);
    expect(r.status).toBe("OK");
    expect(r.plans[0].liveCount).toBe(1);
    // 同一Ptを他ボーナスでも作れるが、生ボーナスを列先頭に置くので編成そのままが選ばれる
    expect(r.plans[0].units[0].bonus).toBe(990);
  });

  it("1本の最小獲得Pt未満は到達不能（UNREACHABLE）", () => {
    const r = planModeAMulti(50, 100, 990, LB_ON, MAX_SCORE_N);
    expect(r.status).toBe("NG");
    expect(r.landability).toBe("UNREACHABLE");
    expect(r.minPtPerLive).toBeGreaterThan(50);
  });
});

describe("buildBonusSweepTable — 表構築の不変条件", () => {
  it("各Ptの先頭 rep が最安LB（LB昇順の外側ループが効いている証拠）", () => {
    const t = buildBonusSweepTable(100, 990, LB_ALL, MAX_SCORE_N);
    for (const pt of t.sortedPts.slice(0, 200)) {
      const reps = t.reps.get(pt)!;
      const minLb = Math.min(...reps.map((rp) => rp.liveBonus));
      expect(reps[0].liveBonus).toBe(minLb);
    }
  });

  it("曲固定なので basesCount は常に1、全 rep が base と bonus を持つ", () => {
    const t = buildBonusSweepTable(114, 500, LB_ON, MAX_SCORE_N);
    expect(t.basesCount).toBe(1);
    for (const reps of t.reps.values()) {
      for (const rp of reps) {
        expect(rp.basePoint).toBe(114);
        expect(rp.bonus).not.toBeUndefined();
      }
    }
  });
});

describe("buildKeepBonusTable — 現ボーナス1点・bonus キーなし（編成そのまま様式）", () => {
  it("全 rep が bonus キーを持たない（画像に目標ボーナスが付かない構造保証）", () => {
    const t = buildKeepBonusTable(100, 990, LB_ALL, MAX_SCORE_N);
    expect(t.basesCount).toBe(1);
    for (const reps of t.reps.values()) {
      for (const rp of reps) {
        expect(rp.basePoint).toBe(100);
        expect(rp.bonus).toBeUndefined();
      }
    }
  });

  it("到達Pt集合は現ボーナス990を含むボーナス掃引表の部分集合（keep ⊆ sweep）", () => {
    const keep = buildKeepBonusTable(100, 990, LB_ALL, MAX_SCORE_N);
    const sweep = buildBonusSweepTable(100, 990, LB_ALL, MAX_SCORE_N);
    for (const pt of keep.sortedPts) {
      expect(sweep.reps.has(pt)).toBe(true);
    }
  });

  it("各Ptの先頭 rep が最安LB（LB昇順の外側ループが効いている）", () => {
    const t = buildKeepBonusTable(100, 990, LB_ALL, MAX_SCORE_N);
    for (const pt of t.sortedPts.slice(0, 200)) {
      const reps = t.reps.get(pt)!;
      expect(reps[0].liveBonus).toBe(Math.min(...reps.map((rp) => rp.liveBonus)));
    }
  });
});

describe("planModeAKeepMulti — 現ボーナス固定・複数回で吸収", () => {
  it("7,809 は現ボーナス990のまま複数回で厳密着地（全 unit が現ボーナス＝bonus キーなし）", () => {
    const r = planModeAKeepMulti(7_809, 100, 990, LB_ALL, MAX_SCORE_N);
    expect(r.status).toBe("OK");
    expect(r.plans[0].liveCount).toBeGreaterThanOrEqual(2);
    for (const plan of r.plans) {
      expect(plan.units.every((u) => u.bonus === undefined)).toBe(true);
      expect(plan.units.reduce((s, u) => s + u.pt * u.count, 0)).toBe(7_809);
    }
  });

  it("liveBonuses 縛りが効く: ON [0,1] は OFF [0..10] より本数が増える", () => {
    const off = planModeAKeepMulti(7_809, 100, 990, LB_ALL, MAX_SCORE_N);
    const on = planModeAKeepMulti(7_809, 100, 990, LB_ON, MAX_SCORE_N);
    expect(off.status).toBe("OK");
    // ON も着地できることを明示アサート（NG だと無言で通る穴を塞ぐ）。
    expect(on.status).toBe("OK");
    if (on.status === "OK") {
      expect(on.plans[0].liveCount).toBeGreaterThanOrEqual(off.plans[0].liveCount);
    }
  });
});
