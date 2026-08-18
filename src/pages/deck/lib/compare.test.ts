/**
 * 編成比較のテスト。
 *
 * ★ ここで確かめたいのは式そのものではない（それは efficiency.ts 側のテストの仕事）。
 *   **「総合力とボーナスを差し替えたときに、逆転がちゃんと出るか」**を固定する。
 *   逆転が出せることがこのツールの存在意義なので、ここが壊れたら価値ごと壊れる。
 */
import { describe, expect, it } from "vitest";
import { bestIndex, compareDecks, findUpset, type CompareCondition } from "./compare";
import { calcScore, eventPtFor, type EfficiencyEntry } from "../../ranking/lib/efficiency";

/** 効率曲ランキングのテストと同じ形の、素性のはっきりした1曲。 */
const song: EfficiencyEntry = {
  musicId: "test",
  title: "テスト曲",
  difficulty: "master",
  playLevel: 32,
  noteCount: 1000,
  baseScore: 4,
  skillScoreSolo: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  baseScoreAuto: 3,
  skillScoreAuto: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  skillScoreMulti: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  feverScore: 1,
  musicTime: 100,
  eventRate: 100,
};

const cond: CompareCondition = { live: "multi", taki: 5, overheadSec: 20 };

describe("compareDecks", () => {
  it("既存の calcScore / eventPtFor と同じ値を返す（式を作り直していない）", () => {
    const [row] = compareDecks([{ name: "A", power: 300_000, bonus: 400, skillLeader: 150, skillTotal: 710 }], song, cond);
    const params = { power: 300_000, bonus: 400, taki: 5, skillLeader: 150, skillTotal: 710, overheadSec: 20 };
    const score = calcScore(song, params, "multi");
    expect(row.score).toBe(score);
    expect(row.eventPt).toBe(eventPtFor("multi", score!, 100, params));
  });

  it("並び順を入れ替えない", () => {
    const rows = compareDecks(
      [
        { name: "A", power: 100_000, bonus: 100, skillLeader: 150, skillTotal: 710 },
        { name: "B", power: 300_000, bonus: 400, skillLeader: 150, skillTotal: 710 },
      ],
      song,
      cond
    );
    expect(rows.map((r) => r.name)).toEqual(["A", "B"]);
    expect(bestIndex(rows)).toBe(1);
  });

  it("時速は曲長＋オーバーヘッドで割る", () => {
    const [row] = compareDecks([{ name: "A", power: 300_000, bonus: 400, skillLeader: 150, skillTotal: 710 }], song, cond);
    expect(row.cycleSec).toBe(120);
    expect(row.ptPerHour).toBeCloseTo((row.eventPt! / 120) * 3600, 6);
  });

  it("データが欠けている曲は null で返す（0にしない）", () => {
    const broken: EfficiencyEntry = { ...song, skillScoreMulti: null };
    const [row] = compareDecks([{ name: "A", power: 300_000, bonus: 400, skillLeader: 150, skillTotal: 710 }], broken, cond);
    expect(row.score).toBeNull();
    expect(row.eventPt).toBeNull();
    expect(row.ptPerHour).toBeNull();
    expect(bestIndex([row])).toBe(-1);
  });
});

describe("逆転の検出（このツールの存在意義）", () => {
  it("ボーナスが低くても総合力で勝てば逆転として拾う", () => {
    const rows = compareDecks(
      [
        { name: "ボーナス盛り", power: 200_000, bonus: 400, skillLeader: 150, skillTotal: 710 },
        { name: "総合力盛り", power: 320_000, bonus: 395, skillLeader: 150, skillTotal: 710 },
      ],
      song,
      cond
    );
    const upset = findUpset(rows);
    expect(upset?.winner.name).toBe("総合力盛り");
    expect(upset?.loser.name).toBe("ボーナス盛り");
    // 逆転が起きている＝ボーナスが低い側の最終Ptが高い、が実際に成立していること。
    expect(upset!.winner.eventPt!).toBeGreaterThan(upset!.loser.eventPt!);
  });

  it("ボーナス最大の編成がそのまま最終Ptでも勝つなら逆転ではない", () => {
    const rows = compareDecks(
      [
        { name: "ボーナス盛り", power: 300_000, bonus: 400, skillLeader: 150, skillTotal: 710 },
        { name: "総合力盛り", power: 305_000, bonus: 300, skillLeader: 150, skillTotal: 710 },
      ],
      song,
      cond
    );
    expect(findUpset(rows)).toBeNull();
  });

  it("編成が1つだけなら逆転は無い", () => {
    expect(findUpset(compareDecks([{ name: "A", power: 300_000, bonus: 400, skillLeader: 150, skillTotal: 710 }], song, cond))).toBeNull();
  });
});

/**
 * ★★ 総合力の上限（ワールドリンク第3弾）★★
 *
 * このツールの売りは「ボーナスを少し落として総合力を盛った方が勝つ」を出せること。
 * **上限帯ではその主張がそのまま逆になる**（盛ったぶんが1点にもならないため）。
 * 上限を入れ忘れると、ツールが損をする編成を「最良」として勧める。
 */
describe("総合力の上限", () => {
  const capped: CompareCondition = { ...cond, powerLimit: 336_000 };

  it("上限を超えたぶんはスコアに乗らない", () => {
    const deck = { name: "A", power: 400_000, bonus: 400, skillLeader: 150, skillTotal: 710 };
    const [over] = compareDecks([deck], song, capped);
    const [exact] = compareDecks([{ ...deck, power: 336_000 }], song, capped);
    expect(over.score).toBe(exact.score);
    expect(over.eventPt).toBe(exact.eventPt);
  });

  it("総合力そのものは丸めない（実機との検算が壊れるため表示は生の値）", () => {
    const [row] = compareDecks(
      [{ name: "A", power: 400_000, bonus: 400, skillLeader: 150, skillTotal: 710 }],
      song,
      capped
    );
    expect(row.power).toBe(400_000);
    expect(row.powerCapped).toBe(true);
  });

  it("上限に届いていない編成には印を付けない", () => {
    const [row] = compareDecks(
      [{ name: "A", power: 300_000, bonus: 400, skillLeader: 150, skillTotal: 710 }],
      song,
      capped
    );
    expect(row.powerCapped).toBe(false);
  });

  it("上限の指定が無ければ、これまでどおり頭打ちにしない", () => {
    const deck = [{ name: "A", power: 400_000, bonus: 400, skillLeader: 150, skillTotal: 710 }];
    const [free] = compareDecks(deck, song, cond);
    const [cap] = compareDecks(deck, song, capped);
    expect(free.score).toBeGreaterThan(cap.score!);
    expect(free.powerCapped).toBe(false);
  });

  /** ★ 本命。上限を入れると「最良」の編成が入れ替わる。 */
  it("上限があると、総合力を盛った編成よりボーナスを取った編成が勝つ", () => {
    const decks = [
      // 総合力で殴る編成。上限が無ければこちらが勝つ。
      { name: "パワー", power: 400_000, bonus: 400, skillLeader: 150, skillTotal: 710 },
      // 上限に収まっていて、そのぶんボーナスを積んだ編成。
      { name: "ボーナス", power: 336_000, bonus: 420, skillLeader: 150, skillTotal: 710 },
    ];
    expect(bestIndex(compareDecks(decks, song, cond))).toBe(0);
    expect(bestIndex(compareDecks(decks, song, capped))).toBe(1);
  });
});
