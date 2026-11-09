/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusics } from "./useBingoMusics";
import { type Cell, buildRandomCard } from "./bingoLogic";
import { buildOdaiCandidates, buildOdaiCard, createRng } from "./odaiLogic";
import type { KindedCard } from "./bingoShare";
import { matchingCells } from "./bingoPlayed";
import type { PlayedEntry } from "./playedStorage";
import { type PlayedSlot, planListFill, planRevert, singleRef, usableAt, withMarks } from "./playedLogic";

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const BY_ID = new Map(MUSICS.map((m) => [m.id, m]));
const T0 = 1_790_000_000_000;
const MIN = 60_000;

const SONG = buildRandomCard(MUSICS, "free", null);
const songsOnCard = SONG.filter((c): c is Exclude<Cell, "FREE"> => c !== "FREE");
const ODAI = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(5));
const slot = (kc: KindedCard, over: Partial<PlayedSlot> = {}): PlayedSlot => ({
  ref: "a1",
  name: "カード1",
  kc,
  addedAt: T0,
  paused: [],
  pausedNow: false,
  ...over,
});
const e = (id: string, at: number, cells?: PlayedEntry["cells"]): PlayedEntry => ({ id, at, ...(cells ? { cells } : {}) });
const filledOf = (kc: KindedCard) => kc.card.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));

describe("usableAt（一覧から埋めるときに使う曲か）", () => {
  it("足した時刻より後で、休止の区間の外だけ使う（今の休止は終わりが無い）", () => {
    const s = { addedAt: T0, paused: [[T0 + 10 * MIN, T0 + 20 * MIN], [T0 + 30 * MIN, null]] as const };
    expect(usableAt(s, T0 - 1)).toBe(false);
    expect(usableAt(s, T0 + MIN)).toBe(true);
    expect(usableAt(s, T0 + 15 * MIN)).toBe(false);
    expect(usableAt(s, T0 + 20 * MIN)).toBe(true);
    expect(usableAt(s, T0 + 40 * MIN)).toBe(false);
    // 足した時刻が分からない（前の版の保存）カードは、時刻では絞らない
    expect(usableAt({ addedAt: 0, paused: [] }, 1)).toBe(true);
  });
});

describe("planListFill（この一覧でカードを埋める）", () => {
  const [s1, s2, s3] = songsOnCard;

  it("足した時刻より後の曲で、まだ埋めていない当てはまるマスを埋める。曲数と休止で外した曲数も返す", () => {
    const off = MUSICS.find((m) => !songsOnCard.some((c) => c.id === m.id))!;
    const entries = [e(s1.id, T0 - MIN), e(s2.id, T0 + MIN), e(s3.id, T0 + 15 * MIN), e(off.id, T0 + 2 * MIN)];
    const plan = planListFill(slot({ kind: "song", card: SONG }, { paused: [[T0 + 10 * MIN, T0 + 20 * MIN]] }), entries, BY_ID);
    expect(plan.cells).toEqual([SONG.indexOf(s2)]);
    // 足す前の s1 は数えない。休止中の s3 は「休止中に遊んだ曲」に数える。カードに無い曲も遊んだ曲として数える
    expect(plan.usable).toBe(2);
    expect(plan.pausedOut).toBe(1);
    expect(plan.credits).toEqual([{ entry: entries[1], cells: [SONG.indexOf(s2)] }]);
  });

  it("埋めてあるマスは数えない。同じマスに当てはまる曲が 2 つあれば、古いほうの記録に付ける", () => {
    const card = SONG.map((c) => (c !== "FREE" && c.id === s1.id ? { ...c, cleared: true } : c));
    const entries = [e(s1.id, T0 + MIN), e(s2.id, T0 + 2 * MIN), e(s2.id, T0 + 3 * MIN)];
    const plan = planListFill(slot({ kind: "song", card }), entries, BY_ID);
    expect(plan.cells).toEqual([SONG.indexOf(s2)]);
    expect(plan.credits).toEqual([{ entry: entries[1], cells: [SONG.indexOf(s2)] }]);
  });

  it("お題のカードは、お題に当てはまる曲で埋める", () => {
    const m = MUSICS.find((x) => matchingCells(ODAI, x).length >= 2)!;
    const plan = planListFill(slot({ kind: "odai", card: ODAI }), [e(m.id, T0 + MIN)], BY_ID);
    expect(plan.cells).toEqual(matchingCells(ODAI, m));
  });

  it("楽曲データに無い曲は数えない", () => {
    const plan = planListFill(slot({ kind: "song", card: SONG }), [e("9999", T0 + MIN)], BY_ID);
    expect(plan).toEqual({ usable: 0, pausedOut: 0, cells: [], credits: [] });
  });
});

describe("planRevert（一覧から 1 曲消すときに戻すマス）", () => {
  const [s1, s2] = songsOnCard;
  const i1 = SONG.indexOf(s1);
  const filled = SONG.map((c) => (c !== "FREE" && (c.id === s1.id || c.id === s2.id) ? { ...c, cleared: true } : c));
  const kc: KindedCard = { kind: "song", card: filled };

  it("その曲で埋めたマスのうち、いま埋まっていて、まだ当てはまるマスを返す", () => {
    const target = e(s1.id, T0 + MIN, [{ card: "a1", filled: [i1] }]);
    expect(planRevert(target, [target], [slot(kc)], BY_ID)).toEqual([{ slot: slot(kc), cells: [i1], kept: 0 }]);
  });

  it("一覧のほかの曲（同じ曲の 2 回目など）でも当てはまるマスは戻さず、残す数に数える", () => {
    const target = e(s1.id, T0 + MIN, [{ card: "a1", filled: [i1] }]);
    const again = e(s1.id, T0 + 2 * MIN);
    expect(planRevert(target, [target, again], [slot(kc)], BY_ID)).toEqual([{ slot: slot(kc), cells: [], kept: 1 }]);
    // ほかの曲が足す前・休止中なら、そのカードには使えないので戻す
    const before = e(s1.id, T0 - MIN);
    expect(planRevert(target, [before, target], [slot(kc)], BY_ID)[0].cells).toEqual([i1]);
  });

  it("もう無いカード・戻したマス・差し替えで当てはまらなくなったマスは返さない", () => {
    const target = e(s1.id, T0 + MIN, [{ card: "gone", filled: [i1] }, { card: "a1", filled: [i1] }]);
    expect(planRevert(target, [target], [slot({ kind: "song", card: SONG })], BY_ID)).toEqual([]);
    const replaced = filled.map((c, i) => (i === i1 && c !== "FREE" ? { ...MUSICS.find((m) => m.id !== s1.id)!, cleared: true } : c));
    expect(planRevert(target, [target], [slot({ kind: "song", card: replaced })], BY_ID)).toEqual([]);
  });

  it("記録の無い曲は何も返さない", () => {
    expect(planRevert(e(s1.id, T0 + MIN), [], [slot(kc)], BY_ID)).toEqual([]);
  });
});

describe("withMarks・singleRef", () => {
  it("指定したマスだけを埋める／戻す", () => {
    const [s1, s2] = songsOnCard;
    const idx = [SONG.indexOf(s1), SONG.indexOf(s2)].sort((a, b) => a - b);
    const on = withMarks({ kind: "song", card: SONG }, idx, true);
    expect(filledOf(on)).toEqual(idx);
    expect(filledOf(withMarks(on, [idx[0]], false))).toEqual([idx[1]]);
  });

  it("1 枚で遊ぶのカードの記録の名前は、種類と足した時刻", () => {
    expect(singleRef("odai", T0)).toBe(`odai@${T0}`);
    expect(singleRef("song", 0)).toBe("song@0");
  });
});
