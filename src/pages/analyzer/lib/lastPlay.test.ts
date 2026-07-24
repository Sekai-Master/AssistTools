import { describe, expect, it } from "vitest";
import {
  type LastPlayMode,
  type PlanWithLastPlayInput,
  earnFinalPtError,
  lastPlayFieldVisibility,
  planWithLastPlay,
} from "./lastPlay";
import { ENVY_ID, type MusicData } from "./calculator";
import { calcLivePt } from "./calcLivePt";

/**
 * lastPlay（Step3 の3択・R5 / docs §1・§2）の安全網。
 *
 * 旧 scoreZeroFinish.test.ts から移植した3観点を含む:
 *   (a) 締め値が calcLivePt(基礎点, bonus, 0, LB) と厳密一致
 *   (b) 恒等式 現在+Step1+Step2+締め === 目標
 *   (c) LB昇順選好（最小LBの締めを採る）
 * さらに Step3 特有の:
 *   - 入力欄の出し分け（lastPlayFieldVisibility）
 *   - 曲未選択→エビ自動割当（既定基礎点100）
 *   - none/scoreZero では希望Pt入力が計算に残り込まない
 */

const MUSICS: MusicData[] = [
  { id: ENVY_ID, basePoint: 100 },
  { id: "melt", basePoint: 130 },
];
const BONUS = 990;

function baseInput(overrides: Partial<PlanWithLastPlayInput> = {}): PlanWithLastPlayInput {
  return {
    currentPt: 1_000_000,
    targetPt: 1_025_000,
    talent: 380_470,
    bonus: BONUS,
    hasWorldPass: false,
    lastPlaySongId: ENVY_ID,
    musicsList: MUSICS,
    options: { useMySekai: false },
    ...overrides,
  };
}

describe("lastPlayFieldVisibility — 入力欄の出し分け（docs §1 の表）", () => {
  it("none は曲✕・希望Pt✕", () => {
    expect(lastPlayFieldVisibility("none")).toEqual({ showSong: false, showPtInput: false });
  });
  it("earn は曲◯・希望Pt◯", () => {
    expect(lastPlayFieldVisibility("earn")).toEqual({ showSong: true, showPtInput: true });
  });
  it("scoreZero は曲◯・希望Pt✕（自動算出）", () => {
    expect(lastPlayFieldVisibility("scoreZero")).toEqual({ showSong: true, showPtInput: false });
  });
});

describe("planWithLastPlay — none（指定しない）", () => {
  it("finalRunPt=0 で計算し、finalText を読まない", () => {
    const r = planWithLastPlay(baseInput(), "none", "99999");
    expect(r.lastPlay).toEqual({ mode: "none" });
    expect(r.result.finalRunPt).toBe(0); // finalText の 99999 は無視される
    expect(r.result.adjustableDiff).toBe(r.result.totalDiff);
  });
});

describe("planWithLastPlay — earn（希望Ptを稼ぐ）", () => {
  it("finalText をパースして finalRunPt にする", () => {
    const r = planWithLastPlay(baseInput(), "earn", "1,090");
    expect(r.lastPlay).toEqual({ mode: "earn", pt: 1_090 });
    expect(r.result.finalRunPt).toBe(1_090);
  });
});

describe("planWithLastPlay — scoreZero（叩かずに締める）", () => {
  it("(a) 締め値は calcLivePt(基礎点, bonus, 0, finishLb) と厳密一致", () => {
    const r = planWithLastPlay(baseInput({ targetPt: 1_000_000 + 25_000 }), "scoreZero", "");
    expect(r.lastPlay.mode).toBe("scoreZero");
    if (r.lastPlay.mode === "scoreZero" && r.lastPlay.status === "OK") {
      expect(r.lastPlay.pt).toBe(calcLivePt(r.lastPlay.finishBase, BONUS, 0, r.lastPlay.finishLb));
      expect(r.result.finalRunPt).toBe(r.lastPlay.pt);
    }
  });

  it("(b) 恒等式 現在+マイセカイ+調整+締め = 目標（着地時）", () => {
    const r = planWithLastPlay(baseInput({ targetPt: 1_000_000 + 25_000 }), "scoreZero", "");
    expect(r.result.isVerified).toBe(true);
    expect(
      r.result.currentPt +
        r.result.mySekaiAllocation.totalPt +
        r.result.liveAdjustment.requiredPt +
        r.result.finalRunPt
    ).toBe(r.result.targetPt);
  });

  it("(c) 手前簡略優先（同点LB昇順）: 残額が締めLB0ちょうどなら finishLb=0・締め1本のみ", () => {
    const finishLb0 = calcLivePt(100, BONUS, 0, 0); // 1,090
    const r = planWithLastPlay(baseInput({ targetPt: 1_000_000 + finishLb0 }), "scoreZero", "");
    expect(r.result.isVerified).toBe(true);
    if (r.lastPlay.mode === "scoreZero" && r.lastPlay.status === "OK") {
      // requiredPt=0 で全 finishLb が simplicity 同点 → 同点は最小LBを採る
      expect(r.lastPlay.finishLb).toBe(0);
      expect(r.lastPlay.pt).toBe(finishLb0);
    }
    // 残りは0なので Step2 は不要
    expect(r.result.liveAdjustment.requiredPt).toBe(0);
  });

  it("手前簡略優先: 締めLBを上げると requiredPt=0 にできる入力では finishLb>0 を選ぶ", () => {
    // totalDiff = 締めLB1ちょうど。lb=0（締め1,090・残4,360）でも着地するが、
    // lb=1（締め5,450・残0）なら Step2 が丸ごと不要。手前簡略を優先して lb=1 を採る。
    const finishLb1 = calcLivePt(100, BONUS, 0, 1); // 5,450
    const r = planWithLastPlay(baseInput({ targetPt: 1_000_000 + finishLb1 }), "scoreZero", "");
    expect(r.result.isVerified).toBe(true);
    if (r.lastPlay.mode === "scoreZero" && r.lastPlay.status === "OK") {
      expect(r.lastPlay.finishLb).toBe(1);
      expect(r.result.liveAdjustment.requiredPt).toBe(0);
    }
  });

  it("曲未選択（エビ既定）は finishBase=100 に自動割当", () => {
    const r = planWithLastPlay(baseInput({ targetPt: 1_000_000 + 25_000 }), "scoreZero", "");
    if (r.lastPlay.mode === "scoreZero") expect(r.lastPlay.finishBase).toBe(100);
  });

  it("曲を melt(基礎点130)にすると finishBase=130 を読む（musicsList 解決）", () => {
    const finishLb0 = calcLivePt(130, BONUS, 0, 0);
    const r = planWithLastPlay(
      baseInput({ lastPlaySongId: "melt", targetPt: 1_000_000 + finishLb0 }),
      "scoreZero",
      ""
    );
    if (r.lastPlay.mode === "scoreZero" && r.lastPlay.status === "OK") {
      expect(r.lastPlay.finishBase).toBe(130);
      expect(r.lastPlay.pt).toBe(finishLb0);
    }
  });

  it("finalText を読まない（希望Pt入力が計算に残り込まない）", () => {
    // finalText に巨大値を渡しても finalRunPt は締め値（自動算出）になる
    const r = planWithLastPlay(baseInput({ targetPt: 1_000_000 + 25_000 }), "scoreZero", "99999999");
    if (r.lastPlay.mode === "scoreZero" && r.lastPlay.status === "OK") {
      expect(r.result.finalRunPt).toBe(r.lastPlay.pt);
      expect(r.result.finalRunPt).not.toBe(99_999_999);
    }
  });

  it("締め値未満の残額は NG（どの締めもオーバー）", () => {
    // 目標差分が最小締め値(1,090)未満 → scoreZero では締められない
    const r = planWithLastPlay(baseInput({ targetPt: 1_000_000 + 500 }), "scoreZero", "");
    expect(r.lastPlay.mode).toBe("scoreZero");
    if (r.lastPlay.mode === "scoreZero") expect(r.lastPlay.status).toBe("NG");
  });
});

describe("earnFinalPtError — earn の希望Pt必須バリデーション（弱点5）", () => {
  it("空欄は未入力エラー（parseAmount('')===0 の素通り穴を塞ぐ）", () => {
    expect(earnFinalPtError("", 10_000)).toBe("ラストプレイの希望ポイントを入力してください。");
  });
  it("明示0も未入力エラー（空欄と同罪）", () => {
    expect(earnFinalPtError("0", 10_000)).toBe("ラストプレイの希望ポイントを入力してください。");
  });
  it("負値も未入力エラー", () => {
    expect(earnFinalPtError("-5", 10_000)).toBe("ラストプレイの希望ポイントを入力してください。");
  });
  it("差分超過は既存文言のエラー", () => {
    expect(earnFinalPtError("20000", 10_000)).toBe("最終獲得希望ポイントが差分を超えています。");
  });
  it("正常値（0<pt<=差分）は null", () => {
    expect(earnFinalPtError("5,000", 10_000)).toBeNull();
    expect(earnFinalPtError("10000", 10_000)).toBeNull();
  });
});

describe("planWithLastPlay — モード×マイセカイのマトリクス", () => {
  const MODES: LastPlayMode[] = ["none", "earn", "scoreZero"];
  it.each(MODES)("mode=%s は ON/OFF どちらでも矛盾なく結果を返す", (mode) => {
    for (const options of [
      { useMySekai: false },
      { useMySekai: true, integrated: { step2ABase: 100 } },
    ]) {
      const r = planWithLastPlay(
        baseInput({ targetPt: 1_000_000 + 30_000, options }),
        mode,
        "1090"
      );
      expect(r.result).toBeDefined();
      // 着地したときは必ず恒等式が閉じる（モード・ON/OFF に関わらず）
      if (r.result.isVerified) {
        expect(
          r.result.currentPt +
            r.result.mySekaiAllocation.totalPt +
            r.result.liveAdjustment.requiredPt +
            r.result.finalRunPt
        ).toBe(r.result.targetPt);
      }
    }
  }, 30_000);
});
