import { describe, expect, it } from "vitest";
import { OVERHEAD_SEC } from "../../../lib/overhead";
import {
  clearRecords,
  defaultLiveKind,
  DOUBLE_TAP_MS,
  exportObj,
  initialState,
  isProvisionalOverhead,
  liveKindOf,
  modelOverheadSec,
  normalize,
  pause,
  resume,
  segments,
  setLapCount,
  setLiveKind,
  stats,
  suspects,
  tap,
  toRun,
  runToExport,
  toggleExclude,
  undo,
  type LapState,
} from "./lap";

const T0 = 1_700_000_000_000;

/** t 秒後にタップする、を並べて状態を作る。 */
function run(secs: number[], base: LapState = initialState()): LapState {
  let s = base;
  let t = T0;
  s = tap(s, t);
  for (const sec of secs) {
    t += sec * 1000;
    s = tap(s, t);
  }
  return s;
}

describe("区間と集計", () => {
  it("タップの間隔がそのままラップになる", () => {
    const s = run([100, 110, 120]);
    expect(segments(s).map((g) => g.per)).toEqual([100, 110, 120]);
    expect(stats(s).laps).toBe(3);
    expect(stats(s).avg).toBeCloseTo(110);
  });

  it("計測開始しただけではラップが出ない（最初のタップは1周目の開始）", () => {
    const s = tap(initialState(), T0);
    expect(segments(s)).toHaveLength(0);
    expect(stats(s).avg).toBeNull();
  });

  /** ★ 押し忘れの後始末。時刻を書き換えずに周回数だけ直せること。 */
  it("区間の周回数を増やすと、その区間は割り算されて平均に入る", () => {
    let s = run([100, 300]);
    s = setLapCount(s, 1, 3);
    expect(segments(s)[1].per).toBe(100);
    expect(stats(s).laps).toBe(4);
    expect(stats(s).avg).toBeCloseTo(100);
    // 時刻の列は動かない
    expect(s.marks).toHaveLength(3);
  });

  it("周回数は1未満にならない", () => {
    let s = run([100]);
    s = setLapCount(s, 0, 0);
    expect(segments(s)[0].n).toBe(1);
  });

  it("除外した区間は平均にも周回数にも入らない", () => {
    let s = run([100, 900, 100]);
    s = toggleExclude(s, 1);
    expect(stats(s).laps).toBe(2);
    expect(stats(s).avg).toBeCloseTo(100);
    // もう一度押すと戻る
    expect(stats(toggleExclude(s, 1)).laps).toBe(3);
  });

  it("直近平均は「区間」でなく「周」で数える", () => {
    let s = run([50, 50, 50, 600]);
    s = setLapCount(s, 3, 6); // 最後の区間に6周ぶん入っていた
    const r = stats(s).recent;
    expect(r?.n).toBe(5);
    expect(r?.avg).toBeCloseTo(100); // 直近5周ぶんは全部この区間から取る
  });

  it("1周だけでは直近平均を出さない（2周ぶん揃うまで）", () => {
    expect(stats(run([100])).recent).toBeNull();
  });

  it("オーバーヘッドは平均ラップ − 曲長", () => {
    const s = run([120, 120]); // 曲長 74.8 の既定
    expect(stats(s).overhead).toBeCloseTo(120 - 74.8);
  });

  it("時速Ptは1周の単価が入っているときだけ出る", () => {
    const s = run([120, 120]);
    expect(stats(s).ptPerHour).toBeNull();
    expect(stats({ ...s, ptPerRun: 100_000 }).ptPerHour).toBeCloseTo(3_000_000);
  });
});

describe("二度押し", () => {
  it("既定の間隔より短い連打は無視する", () => {
    let s = tap(initialState(), T0);
    s = tap(s, T0 + DOUBLE_TAP_MS - 1);
    expect(s.marks).toHaveLength(1);
    s = tap(s, T0 + DOUBLE_TAP_MS + 1);
    expect(s.marks).toHaveLength(2);
  });
});

/**
 * ★★ このツールで一番壊れやすいところ ★★
 * 休憩・部屋落ちを混ぜたまま平均を出すと、数分の空白が1周として入って
 * 平均が数倍に化ける。しかも「それらしい数字」なので気付けない。
 */
describe("中断と再開", () => {
  it("中断をまたいだ区間は自動で除外される", () => {
    let s = run([100, 100]);
    s = pause(s, T0 + 200_000 + 5_000);
    s = resume(s, T0 + 200_000 + 1_800_000); // 30分休憩
    expect(stats(s).laps).toBe(2);
    expect(stats(s).avg).toBeCloseTo(100);
    expect(segments(s)[2].reason).toBe("break");
  });

  it("中断中はタップを受け付けない（休憩中の誤爆で1周増えない）", () => {
    let s = run([100]);
    s = pause(s, T0 + 100_000 + 1000);
    const before = s.marks.length;
    s = tap(s, T0 + 100_000 + 60_000);
    expect(s.marks).toHaveLength(before);
  });

  it("再開後は続きから測れる", () => {
    let s = run([100]);
    s = pause(s, T0 + 101_000);
    const resumedAt = T0 + 900_000;
    s = resume(s, resumedAt);
    s = tap(s, resumedAt + 110_000);
    expect(stats(s).laps).toBe(2);
    expect(stats(s).avg).toBeCloseTo(105);
  });

  it("計測前は中断できない", () => {
    expect(pause(initialState(), T0).pausedAt).toBeNull();
  });
});

describe("1つ戻す", () => {
  it("最後のマークと、それにぶら下がる除外情報を捨てる", () => {
    let s = run([100, 900]);
    s = toggleExclude(s, 1);
    s = undo(s);
    expect(s.marks).toHaveLength(2);
    expect(s.laps).toHaveLength(1);
    expect(s.excluded).toEqual([]);
    expect(stats(s).laps).toBe(1);
  });

  it("空でも壊れない", () => {
    expect(undo(initialState()).marks).toEqual([]);
  });
});

describe("長すぎる区間の検出", () => {
  it("曲長の3倍を超える区間を挙げる。除外済みは挙げない", () => {
    let s = run([100, 400, 100]);
    expect(suspects(s).map((g) => g.i)).toEqual([1]);
    s = toggleExclude(s, 1);
    expect(suspects(s)).toEqual([]);
  });

  /** ★ 平均を基準にすると、汚れた平均が閾値ごと上がって検出できなくなる。 */
  it("汚染された平均に閾値が引きずられない", () => {
    const s = run([2000, 2000, 2000]);
    expect(suspects(s)).toHaveLength(3);
  });
});

describe("記録の消去", () => {
  it("記録は消えるが、曲や単価の設定は残る", () => {
    const s = clearRecords({ ...run([100]), ptPerRun: 96_285, taki: 10 });
    expect(s.marks).toEqual([]);
    expect(s.ptPerRun).toBe(96_285);
    expect(s.taki).toBe(10);
  });
});

describe("保存データの検証", () => {
  it("往復して元に戻る", () => {
    const s = { ...run([100, 200]), ptPerRun: 1234, taki: 8 };
    expect(normalize(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("何を渡しても LapState が返る", () => {
    for (const junk of [null, undefined, 0, "x", [], { marks: "no" }]) {
      expect(() => normalize(junk)).not.toThrow();
      expect(Array.isArray(normalize(junk).marks)).toBe(true);
    }
  });

  it("数値でないマークは落とす", () => {
    expect(normalize({ marks: [1, "a", null, 5] }).marks).toEqual([1, 5]);
  });

  /** ★ 時刻が逆行していると区間が負になる。数字は出るのに全部間違う。 */
  it("時刻が昇順でない記録は丸ごと捨てる", () => {
    expect(normalize({ marks: [100, 50, 200] }).marks).toEqual([]);
  });

  it("区間の外を指す除外は捨てる", () => {
    const s = normalize({
      marks: [1000, 2000, 3000],
      excluded: [0, 5, -1],
      breaks: [0, 1],
    });
    expect(s.excluded).toEqual([0]);
    // breaks は excluded の部分集合でなければならない
    expect(s.breaks).toEqual([0]);
  });

  it("ありえない曲長・焚き数は既定へ戻す", () => {
    expect(normalize({ songSec: 99999 }).songSec).toBe(initialState().songSec);
    expect(normalize({ songSec: 0 }).songSec).toBe(initialState().songSec);
    expect(normalize({ taki: 99 }).taki).toBe(0);
  });

  it("最後のマークより前の中断時刻は無効", () => {
    expect(
      normalize({ marks: [1000, 2000], pausedAt: 1500 }).pausedAt,
    ).toBeNull();
    expect(normalize({ marks: [1000, 2000], pausedAt: 2500 }).pausedAt).toBe(
      2500,
    );
  });

  it("記録が無ければ中断中にはならない", () => {
    expect(normalize({ marks: [], pausedAt: 123 }).pausedAt).toBeNull();
  });
});

describe("書き出し", () => {
  it("集計値と生の記録の両方を持つ", () => {
    const o = exportObj({ ...run([100, 100]), ptPerRun: 1000 });
    expect(o.totalLaps).toBe(2);
    expect(o.avgLapSec).toBe(100);
    expect(o.overheadSec).toBe(25.2);
    expect(o.ptPerHour).toBe(36_000);
    expect((o.marks as string[]).length).toBe(3);
  });

  it("記録が無くても落ちない", () => {
    const o = exportObj(initialState());
    expect(o.totalLaps).toBe(0);
    expect(o.avgLapSec).toBeNull();
    expect(o.startedAt).toBeNull();
  });
});

/**
 * ★ 「終了」で1回ぶんを閉じる。開始・終了の時刻が記録の主役なので、
 *   どこから取るかを固定しておく（押した時刻ではなく、測った範囲）。
 */
describe("記録として閉じる", () => {
  it("開始は最初のタップ、終了は最後のタップ", () => {
    const s = run([100, 100]);
    const r = toRun(s, "id", T0 + 9_999_999)!;
    expect(r.startedAt).toBe(T0);
    expect(r.endedAt).toBe(T0 + 200_000);
    // 保存した時刻は別に持つ（終了を押すまでの空白を測定に混ぜない）
    expect(r.savedAt).toBe(T0 + 9_999_999);
  });

  it("集計と生の記録の両方を持つ", () => {
    const r = toRun({ ...run([100, 100]), ptPerRun: 1000, taki: 10 }, "id", T0)!;
    expect(r.laps).toBe(2);
    expect(r.avgSec).toBe(100);
    expect(r.overheadSec).toBe(25.2);
    expect(r.ptPerHour).toBe(36_000);
    expect(r.marks).toHaveLength(3);
    expect(r.lapsPerSegment).toEqual([1, 1]);
  });

  it("除外した区間は集計から外れるが、記録には残る", () => {
    let s = run([100, 900]);
    s = toggleExclude(s, 1);
    const r = toRun(s, "id", T0)!;
    expect(r.laps).toBe(1);
    expect(r.excluded).toEqual([1]);
    expect(r.marks).toHaveLength(3);
  });

  it("1周も無ければ記録にしない", () => {
    expect(toRun(initialState(), "id", T0)).toBeNull();
    expect(toRun(tap(initialState(), T0), "id", T0)).toBeNull();
  });

  it("書き出しは時刻を ISO で持つ", () => {
    const o = runToExport(toRun(run([100]), "id", T0)!);
    expect(o.startedAt).toBe(new Date(T0).toISOString());
    expect(o.totalLaps).toBe(1);
  });
});

/**
 * ★ ライブの種類（みんなでライブ／ひとりでライブ、2026-11-18）。
 *   「利用者が選んだ種類」（liveKind、未選択は null）と「いま測っている計測の種類」（runKind、計測開始で固める）を分けて持つ。
 *   未選択の人は MULTI_LIVE_SUSPENDED に従うので、再開して false に戻せば既定もみんなでライブへ戻る。
 *   期待する秒数は OVERHEAD_SEC から読む（Nori が実測して overhead.ts を直しても、このテストは書き換えなくてよい）。
 */
describe("ライブの種類", () => {
  it("既定は、みんなでライブが止まっている間はひとりでライブ、再開したらみんなでライブ", () => {
    expect(defaultLiveKind(true)).toBe("solo");
    expect(defaultLiveKind(false)).toBe("multi");
  });

  it("選んでいなければ既定に従い、選んだ種類は既定より優先する", () => {
    const s = initialState();
    expect(s.liveKind).toBeNull();
    expect(liveKindOf(s, true)).toBe("solo");
    expect(liveKindOf(s, false)).toBe("multi");
    expect(liveKindOf({ ...s, liveKind: "multi" }, true)).toBe("multi");
    expect(liveKindOf({ ...s, liveKind: "solo" }, false)).toBe("solo");
  });

  it("計測していない間は選び直せる", () => {
    const s = setLiveKind(initialState(), "multi");
    expect(s.liveKind).toBe("multi");
    expect(setLiveKind(s, "solo").liveKind).toBe("solo");
  });

  it("計測中・中断中は種類を変えられない（同じ状態を返す）", () => {
    const running = run([100], { ...initialState(), liveKind: "solo" });
    expect(setLiveKind(running, "multi")).toBe(running);
    const paused = pause(running, T0 + 101_000);
    expect(setLiveKind(paused, "multi")).toBe(paused);
  });

  it("計測開始で種類を固める。既定が変わっても、測っている計測の種類は変わらない", () => {
    const s = tap({ ...initialState(), liveKind: "solo" }, T0);
    expect(s.runKind).toBe("solo");
    expect(liveKindOf(s, false)).toBe("solo");
    // 選んでいない人は、開始した時点の既定で固まる
    const d = tap(initialState(), T0);
    expect(d.runKind).toBe(liveKindOf(initialState()));
    expect(liveKindOf(d, true)).toBe(d.runKind);
    expect(liveKindOf(d, false)).toBe(d.runKind);
  });

  it("計測を始めても、選んだ種類（liveKind）には書き込まない（未選択は未選択のまま）", () => {
    expect(tap(initialState(), T0).liveKind).toBeNull();
  });

  it("記録を消すと計測の種類は外れ、選んだ種類は残る", () => {
    const s = clearRecords(run([100], { ...initialState(), liveKind: "multi" }));
    expect(s.runKind).toBeNull();
    expect(s.liveKind).toBe("multi");
  });

  it("1つ戻して記録が空になったら計測の種類も外す。残っていれば外さない", () => {
    const one = run([100], { ...initialState(), liveKind: "solo" });
    expect(undo(one).runKind).toBe("solo");
    expect(undo(undo(one)).runKind).toBeNull();
  });

  it("種類は集計（平均・オーバーヘッド・時速）を変えない", () => {
    const solo = run([120, 120], { ...initialState(), liveKind: "solo" });
    const multi = run([120, 120], { ...initialState(), liveKind: "multi" });
    expect(stats(solo)).toEqual(stats(multi));
    expect(suspects(solo)).toEqual(suspects(multi));
  });

  it("比べる既定のロスは overhead.ts の値（みんなでライブは今まで通り）", () => {
    expect(modelOverheadSec("multi")).toBe(OVERHEAD_SEC.multi);
    expect(modelOverheadSec("solo")).toBe(OVERHEAD_SEC.solo);
  });

  /** ★ 仮かどうかは overhead.ts の SOLO_OVERHEAD_PROVISIONAL だけで決める（値が 33 かどうかでは見ない）。 */
  it("ひとりでライブのロスは、仮の印が立っている間だけ「仮」。みんなでライブは印によらず仮ではない", () => {
    expect(isProvisionalOverhead("solo", true)).toBe(true);
    expect(isProvisionalOverhead("solo", false)).toBe(false);
    expect(isProvisionalOverhead("multi", true)).toBe(false);
    expect(isProvisionalOverhead("multi", false)).toBe(false);
  });

  it("記録には計測の種類を残し、書き出しにも出す", () => {
    const s = run([100, 100], { ...initialState(), liveKind: "solo" });
    const r = toRun(s, "id", T0)!;
    expect(r.liveKind).toBe("solo");
    expect(runToExport(r).liveKind).toBe("solo");
    expect(exportObj(s).liveKind).toBe("solo");
    const m = toRun(run([100], { ...initialState(), liveKind: "multi" }), "m", T0)!;
    expect(m.liveKind).toBe("multi");
  });
});

describe("ライブの種類の保存データ", () => {
  it("往復して元に戻る（選んだ種類・計測の種類とも）", () => {
    const s = run([100, 200], { ...initialState(), liveKind: "multi" });
    expect(normalize(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("種類を持たない古い保存は「未選択」として読む（保存値に既定を書き込まない）", () => {
    expect(normalize({ songSec: 120 }).liveKind).toBeNull();
    expect(normalize({ liveKind: "auto" }).liveKind).toBeNull();
    expect(normalize({ liveKind: "solo" }).liveKind).toBe("solo");
  });

  /** ★ 種類を持たないのに計測中の保存は、この機能より前に始めた計測。前はみんなでライブ決め打ちだった。 */
  it("種類を持たない計測中の古い保存は、みんなでライブの計測として読む", () => {
    const s = normalize({ marks: [1000, 2000] });
    expect(s.runKind).toBe("multi");
    expect(liveKindOf(s, true)).toBe("multi");
  });

  it("計測していなければ計測の種類は持たない", () => {
    expect(normalize({ marks: [], runKind: "solo" }).runKind).toBeNull();
    expect(normalize({ marks: [1000, 2000], runKind: "solo" }).runKind).toBe("solo");
    expect(normalize({ marks: [1000, 2000], runKind: "x" }).runKind).toBe("multi");
  });
});
