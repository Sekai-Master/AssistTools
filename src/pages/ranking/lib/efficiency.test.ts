import { describe, it, expect } from "vitest";
import { calcLivePt, calcMultiLivePt, multiScoreCoefficient } from "../../analyzer/lib/calcLivePt";
import {
  calcScore,
  eventPtFor,
  baseRate,
  skillWeights,
  rankSongs,
  rankSongsInWindow,
  multiEffectiveSkill,
  FEVER_RATE,
  DECK_SIZE,
  type EfficiencyEntry,
  type EfficiencyParams,
} from "./efficiency";

/**
 * フィクスチャは public/MusicDatas/musicScoreData.json からそのまま写した実データ。
 * 丸めたり手で書き換えたりすると「実データで検証している」が嘘になるので触らないこと。
 */

/** 独りんぼエンヴィー EXPERT。短くて基礎点が低い＝手動周回の王。 */
const ENVY: EfficiencyEntry = {
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty: "expert",
  playLevel: 22,
  noteCount: 544,
  baseScore: 1.109881,
  skillScoreSolo: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.104178],
  baseScoreAuto: 0.7595,
  skillScoreAuto: [0.048394, 0.049786, 0.05292, 0.053616, 0.043171, 0.070153],
  skillScoreMulti: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.148379],
  feverScore: 0.119139,
  musicTime: 74.8,
  eventRate: 100,
};

/** 初音天地開闢神話 MASTER。長尺で基礎点が高い＝オート周回の王。 */
const TENCHI: EfficiencyEntry = {
  musicId: "186",
  title: "初音天地開闢神話",
  difficulty: "master",
  playLevel: 33,
  noteCount: 2021,
  baseScore: 1.226808,
  skillScoreSolo: [0.018903, 0.030565, 0.045559, 0.023581, 0.047022, 0.049961],
  baseScoreAuto: 0.798,
  skillScoreAuto: [0.013047, 0.020572, 0.029834, 0.015006, 0.029923, 0.031794],
  skillScoreMulti: [0.018903, 0.030565, 0.045559, 0.023581, 0.070534, 0.049961],
  feverScore: 0.156391,
  musicTime: 182.4,
  eventRate: 130,
};

const PARAMS: EfficiencyParams = {
  power: 300_000,
  bonus: 700,
  taki: 5,
  skillLeader: 150,
  skillTotal: 710,
  overheadSec: 20,
};

describe("multiEffectiveSkill — ついぼの「実効値」", () => {
  it("150/710 の実効値は 262（コミュニティ表記と一致する）", () => {
    expect(multiEffectiveSkill(150, 710)).toBe(262);
  });

  it("リーダー100% + サブ各20% の合算になっている", () => {
    // サブ4枚が全部リーダーと同じ値なら 内部値 = 5×L、実効値 = L + 4L×0.2 = 1.8L
    expect(multiEffectiveSkill(100, 500)).toBeCloseTo(180, 10);
  });

  it("内部値がリーダーを下回る入力でもマイナスに振れない", () => {
    expect(multiEffectiveSkill(150, 100)).toBe(150);
  });
});

describe("baseRate — ライブ種別で base が変わる", () => {
  it("ソロは baseScore そのまま", () => {
    expect(baseRate(ENVY, "solo")).toBe(ENVY.baseScore);
  });

  it("協力はフィーバーぶんが 0.5 倍で乗る", () => {
    expect(baseRate(ENVY, "multi")).toBeCloseTo(ENVY.baseScore! + ENVY.feverScore! * FEVER_RATE, 10);
  });

  it("オートは baseScoreAuto", () => {
    expect(baseRate(ENVY, "auto")).toBe(ENVY.baseScoreAuto);
  });

  it("feverScore が無い曲は協力で計算しない（条件が揃わない曲を混ぜない）", () => {
    expect(baseRate({ ...ENVY, feverScore: null }, "multi")).toBeNull();
  });
});

describe("skillWeights — 長さ6でなければ使わない", () => {
  it("種別ごとに別の配列を返す", () => {
    expect(skillWeights(ENVY, "solo")).toBe(ENVY.skillScoreSolo);
    expect(skillWeights(ENVY, "multi")).toBe(ENVY.skillScoreMulti);
    expect(skillWeights(ENVY, "auto")).toBe(ENVY.skillScoreAuto);
  });

  it("長さが6でなければ null（黙って偽スコアを出さない）", () => {
    expect(skillWeights({ ...ENVY, skillScoreSolo: [0.1, 0.2, 0.3] }, "solo")).toBeNull();
    expect(skillWeights({ ...ENVY, skillScoreMulti: null }, "multi")).toBeNull();
  });
});

describe("calcScore", () => {
  it("ソロは内部値の平均を1〜5回目に、リーダーを6回目に掛ける", () => {
    const w = ENVY.skillScoreSolo!;
    const avgOfDeck = PARAMS.skillTotal / DECK_SIZE;
    const head = w.slice(0, DECK_SIZE).reduce((s, x) => s + x, 0);
    const rate = ENVY.baseScore! + (avgOfDeck * head + PARAMS.skillLeader * w[DECK_SIZE]) / 100;
    expect(calcScore(ENVY, PARAMS, "solo")).toBe(Math.floor(rate * 300_000 * 4));
  });

  it("協力は実効値が6回すべてに同じだけ掛かる", () => {
    const w = ENVY.skillScoreMulti!;
    const base = ENVY.baseScore! + ENVY.feverScore! * FEVER_RATE;
    const rate = base + (262 * w.reduce((s, x) => s + x, 0)) / 100; // 150/710 の実効値
    expect(calcScore(ENVY, PARAMS, "multi")).toBe(Math.floor(rate * 300_000 * 4));
  });

  it("協力ではリーダーを上げるほうが内部値を同じだけ上げるより効く", () => {
    const base = calcScore(ENVY, PARAMS, "multi")!;
    // 内部値だけ+50（サブが強くなる）は 0.2 倍しか乗らない
    const bySub = calcScore(ENVY, { ...PARAMS, skillTotal: PARAMS.skillTotal + 50 }, "multi")! - base;
    // リーダーを+50すると内部値も一緒に+50される（合計値なので）
    const byLeader =
      calcScore(
        ENVY,
        { ...PARAMS, skillLeader: PARAMS.skillLeader + 50, skillTotal: PARAMS.skillTotal + 50 },
        "multi",
      )! - base;
    expect(byLeader).toBeGreaterThan(bySub);
  });

  it("ソロで内部値を据え置いてリーダーだけ上げると、6回目の重みぶんだけ伸びる", () => {
    const a = calcScore(ENVY, PARAMS, "solo")!;
    const b = calcScore(ENVY, { ...PARAMS, skillLeader: PARAMS.skillLeader + 50 }, "solo")!;
    const expected = ((50 * ENVY.skillScoreSolo![DECK_SIZE]) / 100) * 300_000 * 4;
    // 両側に floor が掛かるので誤差は最大1点
    expect(Math.abs(b - a - expected)).toBeLessThanOrEqual(1);
  });

  it("オートは判定係数のぶん必ずソロより低い", () => {
    expect(calcScore(ENVY, PARAMS, "auto")!).toBeLessThan(calcScore(ENVY, PARAMS, "solo")!);
  });

  it("データが欠けていれば null", () => {
    expect(calcScore({ ...ENVY, baseScore: null }, PARAMS, "solo")).toBeNull();
    expect(calcScore({ ...ENVY, skillScoreSolo: null }, PARAMS, "solo")).toBeNull();
  });
});

describe("eventPtFor — 実測で確定した calcLivePt 系に委ねる", () => {
  it("ソロ／オートは calcLivePt と完全一致する（式を二重実装しない）", () => {
    const score = 1_500_000;
    expect(eventPtFor("solo", score, 130, PARAMS)).toBe(
      calcLivePt(130, PARAMS.bonus, score, PARAMS.taki),
    );
    expect(eventPtFor("auto", score, 100, PARAMS)).toBe(
      calcLivePt(100, PARAMS.bonus, score, PARAMS.taki),
    );
  });

  it("協力は calcMultiLivePt と一致し、ソロ式とは違う値になる", () => {
    const score = 1_500_000;
    expect(eventPtFor("multi", score, 100, PARAMS)).toBe(
      calcMultiLivePt(100, PARAMS.bonus, score, PARAMS.taki),
    );
    expect(eventPtFor("multi", score, 100, PARAMS)).not.toBe(
      eventPtFor("solo", score, 100, PARAMS),
    );
  });

  it("協力の係数は 110 + floor(自/17000) + min(16, floor(他4人/340000))", () => {
    // 他人のスコアを省くと自分×4で置くので、他項は floor(score/85000) 相当
    expect(multiScoreCoefficient(1_700_000)).toBe(110 + 100 + 16);
    // 他4人が弱いと上限16に届かない
    expect(multiScoreCoefficient(1_700_000, 680_000)).toBe(110 + 100 + 2);
    // 上限で頭打ちになる
    expect(multiScoreCoefficient(100_000, 99_000_000)).toBe(110 + 5 + 16);
  });

  // 2026-08-21 に event214 の走者の実機実測で上限16を確認した。
  // 自スコア 3,613,633（→ ① = 212）で1周 100,835 Pt（→ 係数 338）、338 − 110 − 212 = 16。
  it("実機実測（2026-08-21）の係数を再現する", () => {
    expect(multiScoreCoefficient(3_613_633, 99_000_000)).toBe(338);
  });

  it("小数のボーナス（0.5%刻み）を落とさない", () => {
    expect(eventPtFor("solo", 1_500_000, 100, { ...PARAMS, bonus: 415.5 })).not.toBe(
      eventPtFor("solo", 1_500_000, 100, { ...PARAMS, bonus: 415 }),
    );
  });
});

describe("rankSongs — モードで最適解が入れ替わる", () => {
  const entries = [ENVY, TENCHI];

  it("手動周回は短い曲が勝つ（時間が律速）", () => {
    const r = rankSongs(entries, PARAMS, "manual");
    expect(r[0].title).toBe("独りんぼエンヴィー");
  });

  it("オート周回は長尺・高基礎点が勝つ（ライボが律速で時間はコストにならない）", () => {
    const r = rankSongs(entries, PARAMS, "auto");
    expect(r[0].title).toBe("初音天地開闢神話");
  });

  it("手動とオートで順位が逆転する", () => {
    const manual = rankSongs(entries, PARAMS, "manual").map((r) => r.title);
    const auto = rankSongs(entries, PARAMS, "auto").map((r) => r.title);
    expect(manual[0]).not.toBe(auto[0]);
  });

  it("手動は協力ライブの式で計算する（スコアもPtもソロ式と違う）", () => {
    const r = rankSongs([ENVY], PARAMS, "manual");
    expect(r[0].score).toBe(calcScore(ENVY, PARAMS, "multi"));
    expect(r[0].score).not.toBe(calcScore(ENVY, PARAMS, "solo"));
    expect(r[0].eventPt).toBe(calcMultiLivePt(100, PARAMS.bonus, r[0].score, PARAMS.taki));
  });

  it("チャレライはソロ式・スコアで並ぶ（イベント基礎点を見ない）", () => {
    const r = rankSongs(entries, PARAMS, "challenge");
    expect(r[0].metric).toBe(r[0].score);
    expect(r[0].score).toBe(calcScore(r[0], PARAMS, "solo"));
    const shifted = rankSongs([{ ...ENVY, eventRate: 999 }, TENCHI], PARAMS, "challenge");
    expect(shifted.find((x) => x.musicId === "074")!.metric).toBe(
      r.find((x) => x.musicId === "074")!.metric,
    );
  });

  it("チャレライは曲長・基礎点が無い曲も残す（metric に無関係なため）", () => {
    const bare = { ...ENVY, musicTime: null, eventRate: null };
    expect(rankSongs([bare], PARAMS, "challenge")).toHaveLength(1);
    expect(rankSongs([bare], PARAMS, "manual")).toHaveLength(0);
    expect(rankSongs([bare], PARAMS, "auto")).toHaveLength(0);
  });

  it("指数は1位が100・2位以降はその比", () => {
    const r = rankSongs(entries, PARAMS, "manual");
    expect(r[0].index).toBe(100);
    expect(r[1].index).toBeCloseTo((r[1].metric / r[0].metric) * 100, 10);
    expect(r[1].index).toBeLessThan(100);
  });

  it("入力の配列を書き換えない", () => {
    const snapshot = JSON.stringify(entries);
    rankSongs(entries, PARAMS, "manual");
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  it("データが欠けた曲は落とす", () => {
    const r = rankSongs([{ ...ENVY, baseScore: null }, TENCHI], PARAMS, "manual");
    expect(r).toHaveLength(1);
  });

  it("総合力が変わると順位が動きうる（スコア項が式に入るため）", () => {
    const low = rankSongs(entries, { ...PARAMS, power: 50_000 }, "manual");
    const high = rankSongs(entries, { ...PARAMS, power: 330_000 }, "manual");
    expect(low[1].index).not.toBeCloseTo(high[1].index, 3);
  });
});

/**
 * 窓付きランキング（残り時間で区切る）。
 *
 * ★ ここで縛りたいのは「**制約が入れ替わると答えが変わる**」こと。
 *   1プレイあたり(Pt/プレイ)でも 時間あたり(Pt/時間)でも出せない答えが出るのが
 *   この関数の存在意義なので、その差が消えたら気づけるようにする。
 */
describe("rankSongsInWindow — 残り時間で区切る", () => {
  const entries = [ENVY, TENCHI];
  const WIN = {
    windowSec: 7200, // 2時間
    startLB: 50,
    lbCap: 50,
    maxPlays: 99, // PRECIOUS
    regen: true,
    refill: false,
  };

  it("ライボが先に尽きるなら、1回が濃い曲が勝つ（＝Pt/プレイ と同じ答え）", () => {
    // 5焚き・ライボ50 なら10回で尽きる。2時間もかからないので長尺が有利。
    const r = rankSongsInWindow(entries, { ...PARAMS, taki: 5 }, WIN);
    expect(r[0].title).toBe("初音天地開闢神話");
    expect(r[0].limitedBy).toBe("lb");
    // 1プレイあたりの答えとも一致する
    expect(rankSongs(entries, { ...PARAMS, taki: 5 }, "auto")[0].title).toBe("初音天地開闢神話");
  });

  it("時間が先に尽きるなら、短い曲が勝つ（＝Pt/プレイ の答えとは変わる）", () => {
    // 注ぎ足す前提ならライボは効かない。時間だけが制約になる。
    const r = rankSongsInWindow(entries, { ...PARAMS, taki: 5 }, { ...WIN, refill: true });
    expect(r[0].title).toBe("独りんぼエンヴィー");
    expect(r[0].limitedBy).toBe("time");
    // ★ 1プレイあたりの答え（初音天地）と食い違う。ここがこの関数の価値
    expect(rankSongs(entries, { ...PARAMS, taki: 5 }, "auto")[0].title).not.toBe(r[0].title);
  });

  it("0焚きでも計算できる（消費しないので時間だけが制約）", () => {
    const r = rankSongsInWindow(entries, { ...PARAMS, taki: 0 }, WIN);
    expect(r[0].plays).toBeGreaterThan(0);
    expect(r[0].limitedBy).toBe("time");
    // 2時間 ÷ (74.8 + 20) = 75回
    expect(r.find((x) => x.title === "独りんぼエンヴィー")!.plays).toBe(
      Math.floor(7200 / (74.8 + PARAMS.overheadSec)),
    );
  });

  it("オート回数が先に尽きるなら、そう報告する", () => {
    // 通常パス（10回）・注ぎ足しありなら、時間もライボも余って回数で止まる
    const r = rankSongsInWindow(entries, { ...PARAMS, taki: 5 }, { ...WIN, maxPlays: 10, refill: true });
    expect(r[0].plays).toBe(10);
    expect(r[0].limitedBy).toBe("plays");
  });

  // ★ 現行オートタブは焚き数で順位が動かない（倍率が全曲に等しく掛かるため）。
  //   窓付きは動く。この差が消えたら、窓付きの意味が無くなっている。
  it("焚き数を変えると順位が動きうる（現行オートタブとの本質的な差）", () => {
    const auto1 = rankSongs(entries, { ...PARAMS, taki: 1 }, "auto").map((r) => r.title);
    const auto5 = rankSongs(entries, { ...PARAMS, taki: 5 }, "auto").map((r) => r.title);
    expect(auto1).toEqual(auto5); // 現行は動かない

    const win0 = rankSongsInWindow(entries, { ...PARAMS, taki: 0 }, WIN)[0].title;
    const win5 = rankSongsInWindow(entries, { ...PARAMS, taki: 5 }, WIN)[0].title;
    expect(win0).not.toBe(win5); // 窓付きは動く
  });

  it("時間が足りなければ0回（回しきれない1回は数えない）", () => {
    const r = rankSongsInWindow(entries, PARAMS, { ...WIN, windowSec: 30 });
    expect(r.every((x) => x.plays === 0)).toBe(true);
  });

  it("合計Ptは 回数 × 1回のPt に一致する", () => {
    const r = rankSongsInWindow(entries, PARAMS, WIN);
    for (const x of r) expect(x.totalPt).toBe(x.plays * x.eventPt);
  });

  it("指数は1位が100", () => {
    const r = rankSongsInWindow(entries, PARAMS, WIN);
    expect(r[0].index).toBe(100);
  });

  it("入力の配列を書き換えない", () => {
    const snapshot = JSON.stringify(entries);
    rankSongsInWindow(entries, PARAMS, WIN);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  /**
   * ★★ **この機能が無意味になる条件を、仕様として固定する。** ★★
   *
   * 手持ちだけで走る（refill=false）と、窓が
   *   (所持ライボ ÷ 焚き数) × 最長曲の cycleSec
   * を超えた時点で全曲の回数が同じになり、totalPt = 回数 × Pt/回 なので
   * **並びが通常のオートタブと完全に一致する**。
   * 10炊き・ライボ50 では境界がわずか18分で、それ以降どれだけ長い窓を入れても答えが変わらない。
   *
   * だから既定は refill=true にしてある（画面側）。ここを false に戻すと
   * この機能は対象ユーザーに対して no-op になる。**変えたらこのテストで気づけるようにしておく。**
   */
  it("手持ちだけで走ると、窓を伸ばしても通常オートと同じ順位になる（no-op 帯）", () => {
    const heavy = { ...PARAMS, taki: 10 };
    const auto = rankSongs(entries, heavy, "auto").map((r) => r.title);
    for (const hours of [1, 2, 6, 24]) {
      const win = rankSongsInWindow(entries, heavy, {
        ...WIN,
        refill: false,
        windowSec: hours * 3600,
      }).map((r) => r.title);
      expect(win, `${hours}h で順位が変わってしまった`).toEqual(auto);
    }
  });

  it("注ぎ足す前提なら、窓の長さで答えが変わる（＝機能が効いている）", () => {
    const heavy = { ...PARAMS, taki: 10 };
    const short = rankSongsInWindow(entries, heavy, { ...WIN, refill: true, windowSec: 3600 });
    const long = rankSongsInWindow(entries, heavy, { ...WIN, refill: true, windowSec: 24 * 3600 });
    // 短い窓では時間が制約になり、短い曲が有利になる
    expect(short[0].limitedBy).toBe("time");
    expect(short[0].musicTime!).toBeLessThan(long[0].musicTime!);
  });

  it("残り時間0なら0回（入力欄を空にして時間無制限にしない）", () => {
    const r = rankSongsInWindow(entries, PARAMS, { ...WIN, windowSec: 0 });
    expect(r.every((x) => x.plays === 0)).toBe(true);
  });

  /**
   * ★ 回数上限とライボ切れが同時に起きたら「回数上限」と言う。
   *   ここでライボ切れと言うと「石で注ぎ足せ」と促すことになるが、
   *   回数が尽きているので**石を割っても1回も増えない**（破壊者指摘 2026-08-18）。
   *   既定のライボ25・5焚き・残り5回でそのまま起きる組み合わせ。
   */
  it("回数上限とライボ切れが同時なら、石で解決できない方（回数上限）を報告する", () => {
    const r = rankSongsInWindow(entries, PARAMS, {
      ...WIN,
      refill: false,
      startLB: 25,
      maxPlays: 5,
      windowSec: 7200,
    });
    const t = r.find((x) => x.title === "初音天地開闢神話")!;
    expect(t.plays).toBe(5);
    expect(t.limitedBy).toBe("plays");
  });

  // ★ ライボを使い切って止まったのに「時間切れ」と出ると、短い曲に替えろと誤って促す。
  it("ライボ切れで止まったら time ではなく lb と報告する", () => {
    // 10炊き・ライボ50 → 5回でライボが尽きる。窓はぴったり5回ぶん
    const heavy = { ...PARAMS, taki: 10 };
    const cycle = (TENCHI.musicTime ?? 0) + heavy.overheadSec;
    const r = rankSongsInWindow(entries, heavy, {
      ...WIN,
      refill: false,
      windowSec: Math.ceil(cycle * 5),
    });
    const t = r.find((x) => x.title === "初音天地開闢神話")!;
    expect(t.plays).toBe(5);
    expect(t.limitedBy).toBe("lb");
  });
});
