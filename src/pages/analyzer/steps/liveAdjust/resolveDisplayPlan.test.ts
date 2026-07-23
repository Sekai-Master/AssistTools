import { describe, expect, it } from "vitest";
import type { MultiLiveAdjustResult, MultiLivePlan, MultiLiveUnit } from "../../lib/multiLiveAdjust";
import type { SameBaseEntry, SameBaseSearchResult } from "../../lib/sameBaseAdjust";
import type { ScoreZeroFinishResult } from "../../lib/scoreZeroFinish";
import { resolveDisplayPlan } from "./resolveDisplayPlan";

/**
 * 致命傷C（トグル併用時の無言不適用と矛盾説明文）の再発防止網。
 * トグルの全組合せ（両OFF / 同一曲のみ / イベ乙のみ / 両ON）× （解あり / 解なし）で
 * 「返す表示プラン」と「notice の有無」を固定する。
 * 「ONなのに不適用」の状態が必ず notices を伴うことをここで保証する。
 */

function unit(basePoint: number): MultiLiveUnit {
  return { basePoint, liveBonus: 0, minScore: 0, maxScore: 19999, pt: 1000, count: 1 };
}

function plan(basePoints: number[], liveCount = basePoints.length, lbCost = 0): MultiLivePlan {
  return { units: basePoints.map(unit), liveCount, lbCost, totalPt: basePoints.length * 1000 };
}

function multiResult(plans: MultiLivePlan[], sameCountVariants: MultiLivePlan[] = []): MultiLiveAdjustResult {
  return {
    status: plans.length > 0 ? "OK" : "NG",
    plans,
    sameCountVariants,
    liveCountCap: 50,
    maxPtPerLive: 0,
    minPtPerLive: 0,
    logs: [],
  };
}

function songLockSolved(basePoints: number[], solvedPlan: MultiLivePlan): SameBaseSearchResult {
  const entries: SameBaseEntry[] = basePoints.map((basePoint) => ({
    basePoint,
    status: "OK",
    plan: solvedPlan,
  }));
  return { entries, solved: [{ ...entries[0], plan: solvedPlan }] };
}

function songLockFailed(landability: "UNREACHABLE" | "UNPROVEN"): SameBaseSearchResult {
  return {
    entries: [
      { basePoint: 100, status: "NG", landability },
      { basePoint: 130, status: "NG", landability: "UNREACHABLE" },
    ],
    solved: [],
  };
}

function scoreZeroOk(finishPlan: MultiLivePlan): ScoreZeroFinishResult {
  return {
    status: "OK",
    plan: {
      regular: plan([]),
      finish: unit(finishPlan.units[finishPlan.units.length - 1]?.basePoint ?? 100),
      full: finishPlan,
    },
  };
}

const SCORE_ZERO_NG: ScoreZeroFinishResult = { status: "NG", reason: "NO_EXACT" };

describe("resolveDisplayPlan（致命傷C: トグル併用の無言不適用防止）", () => {
  const primaryPlan = plan([100, 130], 2, 9);

  it("両OFF: 主役をそのまま出す。notice無し", () => {
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: false,
      songLockResult: undefined,
      scoreZeroOn: false,
      scoreZeroResult: undefined,
    });
    expect(r.plan).toBe(primaryPlan);
    expect(r.cardLabel).toBe("▸ 主役");
    expect(r.notices).toEqual([]);
    expect(r.isScoreZeroFinish).toBe(false);
  });

  it("同一曲のみON・解あり: 同一曲固定案を出す。notice無し", () => {
    const songPlan = plan([100, 100, 100]);
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: true,
      songLockResult: songLockSolved([100], songPlan),
      scoreZeroOn: false,
      scoreZeroResult: undefined,
    });
    expect(r.plan).toBe(songPlan);
    expect(r.cardLabel).toBe("▸ 同一曲固定案");
    expect(r.notices).toEqual([]);
  });

  it("同一曲のみON・解なし(UNREACHABLE): 主役にフォールバックし断定文言のnoticeを出す", () => {
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: true,
      songLockResult: songLockFailed("UNREACHABLE"),
      scoreZeroOn: false,
      scoreZeroResult: undefined,
    });
    expect(r.plan).toBe(primaryPlan);
    expect(r.cardLabel).toBe("▸ 主役");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("見つかりませんでした");
    expect(r.notices[0]).not.toContain("この探索範囲では");
  });

  it("同一曲のみON・解なし(UNPROVENが混在): 断定を避けた弱い文言のnoticeを出す（弱点2）", () => {
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: true,
      songLockResult: songLockFailed("UNPROVEN"),
      scoreZeroOn: false,
      scoreZeroResult: undefined,
    });
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("この探索範囲では");
  });

  it("イベ乙のみON・解あり: スコア0イベ乙プランを出す。notice無し", () => {
    const finishPlan = plan([100, 100]);
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: false,
      songLockResult: undefined,
      scoreZeroOn: true,
      scoreZeroResult: scoreZeroOk(finishPlan),
    });
    expect(r.plan).toBe(finishPlan);
    expect(r.cardLabel).toBe("▸ スコア0イベ乙");
    expect(r.isScoreZeroFinish).toBe(true);
    expect(r.notices).toEqual([]);
  });

  it("イベ乙のみON・解なし: 主役にフォールバックしnoticeを出す", () => {
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: false,
      songLockResult: undefined,
      scoreZeroOn: true,
      scoreZeroResult: SCORE_ZERO_NG,
    });
    expect(r.plan).toBe(primaryPlan);
    expect(r.cardLabel).toBe("▸ 主役");
    expect(r.isScoreZeroFinish).toBe(false);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("スコア0イベ乙では締められません");
  });

  it("両ON・両方解あり・スコア0解が同一曲に収まる: イベ乙プランを出し、notice無し（致命傷C核心）", () => {
    // ロック走査成功で得た解をそのまま渡すケース（LiveAdjustStep側のフォールバック不要パス）。
    const finishPlan = plan([100, 100]); // 同一基礎点のみ＝同一曲
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: true,
      songLockResult: songLockSolved([100], plan([100, 100, 100])),
      scoreZeroOn: true,
      scoreZeroResult: scoreZeroOk(finishPlan),
    });
    expect(r.plan).toBe(finishPlan);
    expect(r.cardLabel).toBe("▸ スコア0イベ乙");
    expect(r.isScoreZeroFinish).toBe(true);
    expect(r.notices).toEqual([]);
  });

  it("両ON・スコア0解が全基礎点フォールバックで曲混在: イベ乙プランを出しつつ同一曲が崩れたnoticeを出す（致命傷C核心）", () => {
    // LiveAdjustStep がロック走査NG→全基礎点フォールバックで得た「曲が混ざった」解を渡すケース。
    const mixedFinishPlan = plan([100, 130]);
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: true,
      songLockResult: songLockSolved([100], plan([100, 100, 100])),
      scoreZeroOn: true,
      scoreZeroResult: scoreZeroOk(mixedFinishPlan),
    });
    expect(r.plan).toBe(mixedFinishPlan);
    expect(r.cardLabel).toBe("▸ スコア0イベ乙");
    expect(r.isScoreZeroFinish).toBe(true);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("同一曲だけでは組めていません");
  });

  it("両ON・スコア0解なし＋同一曲解あり: 同一曲固定案を出しスコア0側のnoticeのみ出す", () => {
    const songPlan = plan([100, 100, 100]);
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: true,
      songLockResult: songLockSolved([100], songPlan),
      scoreZeroOn: true,
      scoreZeroResult: SCORE_ZERO_NG,
    });
    expect(r.plan).toBe(songPlan);
    expect(r.cardLabel).toBe("▸ 同一曲固定案");
    expect(r.isScoreZeroFinish).toBe(false);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("スコア0イベ乙では締められません");
  });

  it("両ON・両方解なし: 主役にフォールバックし両方のnoticeを出す（無言不適用ゼロを保証）", () => {
    const r = resolveDisplayPlan({
      multi: multiResult([primaryPlan]),
      primaryPlan,
      adopted: { kind: "primary" },
      sameSongOnly: true,
      songLockResult: songLockFailed("UNREACHABLE"),
      scoreZeroOn: true,
      scoreZeroResult: SCORE_ZERO_NG,
    });
    expect(r.plan).toBe(primaryPlan);
    expect(r.cardLabel).toBe("▸ 主役");
    expect(r.notices).toHaveLength(2);
    expect(r.notices.some((n) => n.includes("スコア0イベ乙では締められません"))).toBe(true);
    expect(r.notices.some((n) => n.includes("見つかりませんでした"))).toBe(true);
  });

  it("明示的な採択中: トグルの状態やlibの結果に関わらず採択プランをそのまま出し、notice無し", () => {
    const variantPlan = plan([130, 130]);
    const multi = multiResult([primaryPlan], [variantPlan]);
    const r = resolveDisplayPlan({
      multi,
      primaryPlan,
      adopted: { kind: "variant", index: 0 },
      sameSongOnly: true,
      songLockResult: songLockFailed("UNREACHABLE"),
      scoreZeroOn: true,
      scoreZeroResult: SCORE_ZERO_NG,
    });
    expect(r.plan).toBe(variantPlan);
    expect(r.cardLabel).toBe("▸ 採択中");
    expect(r.notices).toEqual([]);
    expect(r.isScoreZeroFinish).toBe(false);
  });
});
