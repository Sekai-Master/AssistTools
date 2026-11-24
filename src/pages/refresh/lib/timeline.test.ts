import { describe, expect, it } from "vitest";
import {
  type Segment,
  minutesToTarget,
  playTargetOf,
  restMinutesToTarget,
  simulateTimeline,
  targetPercentOf,
} from "./timeline";

const OH = 54; // オーバーヘッド既定
const SEC_PER_PLAY = 74.8 + OH; // エビ1周の実所要秒

const play = (minutes: number): Segment => ({
  id: "p",
  kind: "play",
  songId: "074",
  title: "独りんぼエンヴィー",
  jacketLink: "jacket_s_074.webp",
  refreshConstant: 84,
  songLengthSec: 74.8,
  minutes,
});
const rest = (minutes: number): Segment => ({ id: "r", kind: "rest", minutes });

describe("simulateTimeline（時間指定）", () => {
  it("60分プレイ: 分×ペースで周回数を逆算しゲージ増加", () => {
    const r = simulateTimeline([play(60)], 0, OH);
    expect(r.totalMinutes).toBe(60);
    const plays = (60 * 60) / SEC_PER_PLAY; // ≈27.95
    expect(r.points[0].plays).toBeCloseTo(plays, 3);
    expect(r.finalPercent).toBeCloseTo((plays * 84 * 157) / 66000, 3);
    expect(r.totalWasted).toBe(0);
  });

  it("休憩でゲージ減少（30分ごと8.33%）", () => {
    // 120分プレイで約11%まで上げてから休憩（0%クランプに当たらない量）
    const r = simulateTimeline([play(120), rest(30)], 0, OH);
    const afterPlay = r.points[0].endPercent;
    const afterRest = r.points[1].endPercent;
    expect(afterPlay - afterRest).toBeCloseTo((550000 / 6600000) * 100, 3);
  });

  it("単発の30分未満休憩は減らない", () => {
    const r = simulateTimeline([play(60), rest(29)], 0, OH);
    expect(r.points[1].endPercent).toBeCloseTo(r.points[0].endPercent, 6);
  });

  it("繰り越し: 分割した休憩でも累計30分で減少する", () => {
    // 20分休憩→20分休憩 = 計40分 → 1回減少（独立floorなら0回だった）
    const split = simulateTimeline([play(120), rest(20), rest(20)], 0, OH);
    const once = simulateTimeline([play(120), rest(30)], 0, OH);
    const drop = (550000 / 6600000) * 100;
    // 40分ぶんの繰り越しで1回減少している
    expect(split.points[0].endPercent - split.finalPercent).toBeCloseTo(drop, 6);
    expect(once.points[0].endPercent - once.finalPercent).toBeCloseTo(drop, 6);
    // 余り10分が次に繰り越されている
    expect(split.points[2].decayProgressMin).toBeCloseTo(10, 6);
  });

  it("繰り越し: プレイを挟んでも休憩進捗は引き継がれる（ユーザー要望の核）", () => {
    // 20分休憩→プレイ→20分休憩 = 計40分の休憩 → 1回減少
    const r = simulateTimeline([play(120), rest(20), play(30), rest(20)], 0, OH);
    const beforeRests = r.points[0].endPercent; // 最初のプレイ後
    // プレイ分の増加を差し引いて、休憩で1回ぶん減っていること
    const drop = (550000 / 6600000) * 100;
    // 2回目プレイ後→最終(最後の休憩後)で減少が1回入る
    expect(r.points[2].endPercent - r.finalPercent).toBeCloseTo(drop, 6);
    expect(beforeRests).toBeGreaterThan(0);
  });

  it("長時間プレイで100%超過分をムダ（周回・時間）として検出", () => {
    // 0%から1200分エビ = 約559周だが501周で100%、残りはムダ
    const r = simulateTimeline([play(1200)], 0, OH);
    expect(r.finalPercent).toBe(100);
    const plays = (1200 * 60) / SEC_PER_PLAY;
    const effective = 6_600_000 / (84 * 157);
    expect(r.totalWasted).toBeCloseTo(plays - effective, 2);
    expect(r.points[0].wastedMinutes).toBeCloseTo(((plays - effective) * SEC_PER_PLAY) / 60, 2);
  });

  it("恒等式: 各ブロックの endPercent が次の startPercent と一致", () => {
    const r = simulateTimeline([play(60), rest(30), play(30)], 5, OH);
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].startPercent).toBeCloseTo(r.points[i - 1].endPercent, 9);
    }
    expect(r.points[0].startPercent).toBeCloseTo(5, 9);
  });

  it("空プランは0", () => {
    const r = simulateTimeline([], 12, OH);
    expect(r.totalMinutes).toBe(0);
    expect(r.finalPercent).toBeCloseTo(12, 9);
  });
});

describe("simulateTimeline — 途中参加（開始時のタイマー進捗）", () => {
  it("進捗20分から10分休むと減少が1回起きる", () => {
    const withProgress = simulateTimeline([play(120), rest(10)], 0, OH, 20);
    const afterPlay = withProgress.points[0].endPercent;
    expect(afterPlay - withProgress.points[1].endPercent).toBeCloseTo(
      (550000 / 6600000) * 100,
      3,
    );
  });

  it("既定（進捗0）では同じ10分休憩で減らない＝従来の挙動", () => {
    const plain = simulateTimeline([play(120), rest(10)], 0, OH);
    expect(plain.points[1].endPercent).toBeCloseTo(plain.points[0].endPercent, 9);
  });

  it("プレイを挟んでも進捗は繰り越す（タイマーは止まるだけ）", () => {
    const r = simulateTimeline([rest(10), play(30), rest(5)], 20, OH, 15);
    // 15分進んだ状態 + 10分 + 5分 = 30分ちょうどで1回減る
    expect(r.points[2].decayProgressMin).toBeCloseTo(0, 9);
    expect(r.points[0].endPercent).toBeCloseTo(r.points[0].startPercent, 9);
    expect(r.points[2].endPercent).toBeLessThan(r.points[2].startPercent);
  });
});

/**
 * 稼働をゲージ%で決める（2026-11-24、使い手の要望「切り替えながら積んでいけるといいね」）。
 * ★ % は「そのブロックの終わりのゲージ」。開始のゲージから目標まで上げる時間を、時間で決めるときの式の逆で出す。
 */
describe("ゲージ%で決める稼働（時間の逆算）", () => {
  const PER = 84 * 157; // エビ1回の内部増加
  const MAX = 6_600_000;
  const target = (targetPercent: number, minutes = 60): Segment => ({
    ...(play(minutes) as Extract<Segment, { kind: "play" }>),
    id: `t${targetPercent}`,
    targetPercent,
  });

  it("式: 分 = (目標の内部値 − 開始の内部値) ÷ 1回の増加 × 1周の秒 ÷ 60", () => {
    expect(minutesToTarget(0, 100, 84, 74.8, OH)).toBeCloseTo(((MAX / PER) * SEC_PER_PLAY) / 60, 9);
    expect(minutesToTarget(0.25 * MAX, 50, 84, 74.8, OH)).toBeCloseTo(
      ((0.25 * MAX) / PER) * (SEC_PER_PLAY / 60),
      9,
    );
  });

  it("0%から100%: ちょうど100%で終わり、ムダは出ない", () => {
    const r = simulateTimeline([target(100)], 0, OH);
    expect(r.finalPercent).toBe(100);
    expect(r.totalWasted).toBe(0);
    expect(r.totalWastedMinutes).toBe(0);
    expect(r.points[0].plays).toBeCloseTo(MAX / PER, 6);
    expect(r.totalMinutes).toBeCloseTo(((MAX / PER) * SEC_PER_PLAY) / 60, 6);
  });

  it("時間で決めたときと往復が合う（逆算した分を時間で積むと同じ%になる）", () => {
    const byTarget = simulateTimeline([target(37.5)], 12, OH);
    const byTime = simulateTimeline([play(byTarget.points[0].minutes)], 12, OH);
    expect(byTarget.finalPercent).toBe(37.5);
    expect(byTime.finalPercent).toBeCloseTo(37.5, 9);
  });

  it("境界: 目標0%・今と同じ%・今より小さい%は 0 分（稼働ではゲージは下がらない）", () => {
    for (const [start, t] of [
      [0, 0],
      [40, 40],
      [50, 30],
      [100, 100],
    ]) {
      const r = simulateTimeline([target(t)], start, OH);
      expect(r.points[0].minutes).toBe(0);
      expect(r.points[0].plays).toBe(0);
      expect(r.totalMinutes).toBe(0);
      expect(r.finalPercent).toBeCloseTo(start, 9);
    }
  });

  it("境界: 100%を超える目標は100%、負の目標は0%として扱う", () => {
    expect(simulateTimeline([target(130)], 0, OH).finalPercent).toBe(100);
    expect(simulateTimeline([target(130)], 0, OH).points[0].minutes).toBeCloseTo(
      simulateTimeline([target(100)], 0, OH).points[0].minutes,
      9,
    );
    expect(simulateTimeline([target(-5)], 20, OH).points[0].minutes).toBe(0);
  });

  it("壊れた値（NaN・文字列）は時間で決める扱いに戻す（保存プラン対策）", () => {
    const nan = { ...play(60), targetPercent: Number.NaN } as Segment;
    const str = { ...play(60), targetPercent: "100" as unknown as number } as Segment;
    for (const seg of [nan, str]) {
      expect(playTargetOf(seg as Extract<Segment, { kind: "play" }>)).toBeNull();
      expect(simulateTimeline([seg], 0, OH).points[0].minutes).toBe(60);
    }
  });

  it("曲の長さが無い・定数0のときは 0 分（割り算で無限にしない）", () => {
    expect(minutesToTarget(0, 100, 84, 0, 0)).toBe(0);
    expect(minutesToTarget(0, 100, 0, 74.8, OH)).toBe(0);
  });

  it("前のブロックの結果から逆算する: 休憩を挟んでも最後のブロックは100%ぎりぎりで終わる", () => {
    const segs = [play(120), rest(30), target(100)];
    const r = simulateTimeline(segs, 0, OH);
    expect(r.finalPercent).toBe(100);
    expect(r.totalWasted).toBe(0);
    const need = MAX - (r.points[2].startPercent / 100) * MAX;
    expect(r.points[2].minutes).toBeCloseTo(((need / PER) * SEC_PER_PLAY) / 60, 6);
    // 前の稼働を延ばすと、目標のブロックはそのぶん短くなる（終わりの%は変わらない）
    const longer = simulateTimeline([play(180), rest(30), target(100)], 0, OH);
    expect(longer.finalPercent).toBe(100);
    expect(longer.points[2].minutes).toBeLessThan(r.points[2].minutes);
  });

  it("時間と%を混ぜて積める。各ブロックの長さ（minutes）は開始と終わりの差", () => {
    const r = simulateTimeline([target(30), rest(45), play(30), target(80), rest(20)], 5, OH, 10);
    for (const pt of r.points) expect(pt.minutes).toBeCloseTo(pt.endMinute - pt.startMinute, 9);
    expect(r.points[0].endPercent).toBe(30);
    expect(r.points[3].endPercent).toBe(80);
    // ゲージ%のブロックの間も、休憩の30分タイマーは繰り越す（10 + 45 = 55 → 1回減って25、+20 → 45 → もう1回減って15）
    expect(r.points[1].decayProgressMin).toBeCloseTo(25, 9);
    expect(r.points[4].decayProgressMin).toBeCloseTo(15, 9);
  });
});

/**
 * 休憩をゲージ%で決める（2026-11-25、持ち主「休憩もゲージで合わせたい。45%まで回復したら、残り55%でイベント終了まで走る」）。
 * ★ 休憩中のゲージは、ライブ・採取をしない時間が累計30分たまるごとに 550,000（8.33%）ずつ下がる（離散）。
 *   入れた%「以下」になる段まで休む。最初の段は、前から繰り越した30分タイマーの残り（30 − 進捗）で来る。
 */
describe("ゲージ%で決める休憩（休む時間の逆算）", () => {
  const MAX = 6_600_000;
  const D = 550_000;
  const pct = (p: number) => (p / 100) * MAX;
  const restTo = (targetPercent: number, minutes = 30): Segment => ({
    id: `r${targetPercent}`,
    kind: "rest",
    minutes,
    targetPercent,
  });

  it("式: 段の数 = ⌈(開始 − 目標) ÷ 550,000⌉、分 = (30 − 繰り越しの進捗) + (段の数 − 1) × 30", () => {
    expect(restMinutesToTarget(pct(70), 44.9, 0)).toEqual({ minutes: 120, ticks: 4 });
    expect(restMinutesToTarget(pct(76.7), 45, 0)).toEqual({ minutes: 120, ticks: 4 });
    expect(restMinutesToTarget(pct(76.7), 45, 20)).toEqual({ minutes: 100, ticks: 4 });
    expect(restMinutesToTarget(pct(60), 55, 12)).toEqual({ minutes: 18, ticks: 1 });
  });

  it("境界: ちょうど段の値（70% → 45% は 3 段でちょうど 45%）は、その段で止まる（以下なので次の段まで休まない）", () => {
    expect(restMinutesToTarget(pct(70), 45, 0)).toEqual({ minutes: 90, ticks: 3 });
    expect(restMinutesToTarget(MAX, 50, 0)).toEqual({ minutes: 180, ticks: 6 });
    const r = simulateTimeline([restTo(45)], 70, OH);
    expect(r.finalPercent).toBeCloseTo(45, 9);
    expect(r.points[0].minutes).toBe(90);
  });

  it("境界: 目標が今以上なら 0 分（段も下がらない）", () => {
    for (const t of [70, 80, 100]) expect(restMinutesToTarget(pct(70), t, 0)).toEqual({ minutes: 0, ticks: 0 });
    expect(restMinutesToTarget(0, 0, 0)).toEqual({ minutes: 0, ticks: 0 });
    const r = simulateTimeline([restTo(80)], 70, OH, 20);
    expect(r.points[0].minutes).toBe(0);
    expect(r.finalPercent).toBeCloseTo(70, 9);
    expect(r.points[0].decayProgressMin).toBe(20); // 0 分なのでタイマーもそのまま
  });

  it("境界: 0% まで（0 未満は 0 として扱う）。0% で下げ止まる", () => {
    expect(restMinutesToTarget(pct(50), 0, 0)).toEqual({ minutes: 180, ticks: 6 });
    expect(restMinutesToTarget(pct(50), -5, 0)).toEqual({ minutes: 180, ticks: 6 });
    expect(restMinutesToTarget(pct(5), 0, 0)).toEqual({ minutes: 30, ticks: 1 });
    expect(simulateTimeline([restTo(0)], 50, OH).finalPercent).toBe(0);
    expect(simulateTimeline([restTo(-5)], 5, OH).finalPercent).toBe(0);
  });

  it("繰り越しタイマーなし／あり: 開始時の進捗 20 分（次の回復まで 10 分）なら最初の段は 10 分で来る", () => {
    const fresh = simulateTimeline([restTo(55)], 60, OH);
    const carried = simulateTimeline([restTo(55)], 60, OH, 20);
    expect(fresh.points[0].minutes).toBe(30);
    expect(carried.points[0].minutes).toBe(10);
    expect(fresh.finalPercent).toBeCloseTo(60 - (D / MAX) * 100, 9);
    expect(carried.finalPercent).toBeCloseTo(fresh.finalPercent, 9);
  });

  it("繰り越し: 前の休憩（時間）の進捗は、稼働を挟んでもゲージの休憩に効く", () => {
    const r = simulateTimeline([play(120), rest(20), play(30), restTo(0)], 0, OH);
    const startOfRest = (r.points[3].startPercent / 100) * MAX;
    const ticks = Math.ceil(startOfRest / D);
    expect(r.points[3].minutes).toBe(10 + (ticks - 1) * 30);
    expect(r.finalPercent).toBe(0);
  });

  it("休んだ後のタイマーは 0 から（段が下がった瞬間に止める）。次の時間の休憩はまた 30 分で 1 段", () => {
    const r = simulateTimeline([restTo(55), rest(29), rest(1)], 60, OH, 20);
    expect(r.points[0].decayProgressMin).toBe(0);
    expect(r.points[1].endPercent).toBeCloseTo(r.points[0].endPercent, 9);
    expect(r.points[2].endPercent).toBeCloseTo(r.points[0].endPercent - (D / MAX) * 100, 9);
  });

  it("次の回復まで 0 分（進捗 30）: 目標が今以上なら 0 分で段も下がらず、1 段下なら 0 分でその段が来る", () => {
    expect(simulateTimeline([restTo(70)], 70, OH, 30).finalPercent).toBeCloseTo(70, 9);
    const one = simulateTimeline([restTo(65)], 70, OH, 30);
    expect(one.points[0].minutes).toBe(0);
    expect(one.finalPercent).toBeCloseTo(70 - (D / MAX) * 100, 9);
  });

  it("時間で休んだときと合う（逆算した分を時間で休むと、同じ%と同じタイマー）", () => {
    for (const progress of [0, 7, 20]) {
      const byTarget = simulateTimeline([play(200), restTo(20)], 0, OH, progress);
      const byTime = simulateTimeline([play(200), rest(byTarget.points[1].minutes)], 0, OH, progress);
      expect(byTarget.finalPercent).toBeCloseTo(byTime.finalPercent, 9);
      expect(byTarget.points[1].decayProgressMin).toBeCloseTo(byTime.points[1].decayProgressMin, 9);
      expect(byTarget.finalPercent).toBeLessThanOrEqual(20);
    }
  });

  it("壊れた値（NaN・文字列）は時間で決める扱いに戻す（保存プラン対策）", () => {
    const nan = { id: "r", kind: "rest", minutes: 45, targetPercent: Number.NaN } as Segment;
    const str = { id: "r", kind: "rest", minutes: 45, targetPercent: "45" as unknown as number } as Segment;
    for (const seg of [nan, str]) {
      expect(targetPercentOf(seg as Extract<Segment, { kind: "rest" }>)).toBeNull();
      expect(simulateTimeline([seg], 70, OH).points[0].minutes).toBe(45);
    }
  });

  /**
   * 持ち主の組み方: 現在70% → 稼働1時間 → 休憩をゲージ45 → 最後の稼働をゲージ100。
   * みんなでライブ（ロス54秒）とひとりでライブ（ロス32秒）の両方で、終了ゲージ100%・ムダ0。
   */
  it.each([
    ["みんなでライブ", 54],
    ["ひとりでライブ", 32],
  ])("例（%s）: 70% → 稼働1時間 → 休憩ゲージ45 → 稼働ゲージ100 で 100%・ムダ0", (_, oh) => {
    const segs: Segment[] = [
      play(60),
      restTo(45),
      { ...(play(0) as Extract<Segment, { kind: "play" }>), id: "last", targetPercent: 100 },
    ];
    const r = simulateTimeline(segs, 70, oh);
    const afterPlay = 70 + (((60 * 60) / (74.8 + oh)) * 84 * 157 * 100) / MAX;
    expect(r.points[0].endPercent).toBeCloseTo(afterPlay, 9);
    const ticks = Math.ceil(((afterPlay - 45) / 100) * (MAX / D));
    expect(r.points[1].minutes).toBe(30 + (ticks - 1) * 30);
    expect(r.points[1].endPercent).toBeCloseTo(afterPlay - ticks * (D / MAX) * 100, 9);
    expect(r.points[1].endPercent).toBeLessThanOrEqual(45);
    expect(r.finalPercent).toBe(100);
    expect(r.totalWasted).toBe(0);
    expect(r.totalWastedMinutes).toBe(0);
  });
});
