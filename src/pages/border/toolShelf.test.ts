import { describe, expect, it } from "vitest";
import { TOOLS } from "../../tools";
import { shelfItems, toolPhaseOf, toolShelf } from "./toolShelf";
import type { Snapshot } from "./borderView";

/** 日本時間の y/mo/d h:mi を UTC のミリ秒に */
const jst = (y: number, mo: number, d: number, h: number, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h - 9, mi, s);

// 本番の日程（public/CardDatas/bonuses.json の値）
const MARATHON_223 = { startAt: jst(2026, 10, 31, 15), aggregateAt: jst(2026, 11, 8, 20, 59, 59) };
const CHEERFUL_132 = { startAt: jst(2024, 5, 31, 15), aggregateAt: jst(2024, 6, 8, 20, 59, 59) };
const CHEERFUL_186 = { startAt: jst(2025, 11, 18, 21), aggregateAt: jst(2025, 11, 19, 20, 59, 59) }; // 24時間
const WL_214 = { startAt: jst(2026, 8, 17, 20), aggregateAt: jst(2026, 8, 27, 19, 59, 59) }; // ワールドリンクは 20:00 開始
const WL_218 = { startAt: jst(2026, 9, 25, 20), aggregateAt: jst(2026, 9, 28, 19, 59, 59) }; // 72時間

describe("toolPhaseOf（いまの時期。日本時間で数える）", () => {
  it("本番の日程と合っている（bonuses.json の 223 の値）", () => {
    expect(MARATHON_223).toEqual({ startAt: 1793426400000, aggregateAt: 1794139199000 });
  });

  it("マラソン（15:00 開始）: 序盤は開始日の翌日いっぱい、終盤は集計日の前日 12:00 から集計まで", () => {
    const e = MARATHON_223;
    expect(toolPhaseOf(e, e.startAt - 1)).toBeNull();
    expect(toolPhaseOf(e, e.startAt)).toBe("early");
    expect(toolPhaseOf(e, jst(2026, 11, 2, 0) - 1)).toBe("early");
    expect(toolPhaseOf(e, jst(2026, 11, 2, 0))).toBe("mid");
    expect(toolPhaseOf(e, jst(2026, 11, 7, 12) - 1)).toBe("mid");
    expect(toolPhaseOf(e, jst(2026, 11, 7, 12))).toBe("late");
    expect(toolPhaseOf(e, e.aggregateAt)).toBe("late");
  });

  // ★ 終わりはページの「開催中」の判定（borderView.ts の phaseOf: 集計＋1分まで）とそろえる。
  //   入口だけ先に消えて、見出しは「開催中のイベント」のまま、のようにずらさない
  it("集計＋1分までは終盤、それを過ぎたら出さない", () => {
    const e = MARATHON_223;
    expect(toolPhaseOf(e, e.aggregateAt + 60_000)).toBe("late");
    expect(toolPhaseOf(e, e.aggregateAt + 60_001)).toBeNull();
    expect(toolPhaseOf(e, jst(2026, 11, 9, 10))).toBeNull();
  });

  it("チアフル（15:00 開始の 198 時間）もマラソンと同じ境目", () => {
    const e = CHEERFUL_132;
    expect(toolPhaseOf(e, jst(2024, 6, 1, 23, 59))).toBe("early");
    expect(toolPhaseOf(e, jst(2024, 6, 2, 0))).toBe("mid");
    expect(toolPhaseOf(e, jst(2024, 6, 7, 11, 59))).toBe("mid");
    expect(toolPhaseOf(e, jst(2024, 6, 7, 12))).toBe("late");
  });

  it("ワールドリンク（20:00 開始・19:59:59 集計）でも日本時間の日付で数える", () => {
    const e = WL_214;
    expect(toolPhaseOf(e, jst(2026, 8, 17, 19, 59))).toBeNull();
    expect(toolPhaseOf(e, jst(2026, 8, 17, 20))).toBe("early");
    expect(toolPhaseOf(e, jst(2026, 8, 18, 23, 59))).toBe("early");
    expect(toolPhaseOf(e, jst(2026, 8, 19, 0))).toBe("mid");
    expect(toolPhaseOf(e, jst(2026, 8, 26, 11, 59))).toBe("mid");
    expect(toolPhaseOf(e, jst(2026, 8, 26, 12))).toBe("late");
    expect(toolPhaseOf(e, e.aggregateAt + 60_000)).toBe("late");
    expect(toolPhaseOf(e, e.aggregateAt + 60_001)).toBeNull();
  });

  it("72 時間のワールドリンク: 序盤と終盤のあいだに中盤が半日ある", () => {
    const e = WL_218;
    expect(toolPhaseOf(e, jst(2026, 9, 26, 23, 59))).toBe("early");
    expect(toolPhaseOf(e, jst(2026, 9, 27, 6))).toBe("mid");
    expect(toolPhaseOf(e, jst(2026, 9, 27, 12))).toBe("late");
  });

  // ★ 短い回では序盤（開始日の翌日いっぱい）と終盤（集計日の前日 12:00〜）が重なる。重なったら終盤（着地の調整が先）
  it("序盤と終盤が重なったら終盤", () => {
    // 24 時間のチアフル: 終盤は前日 12:00 からなので、開始から終わりまで終盤
    expect(toolPhaseOf(CHEERFUL_186, CHEERFUL_186.startAt)).toBe("late");
    expect(toolPhaseOf(CHEERFUL_186, CHEERFUL_186.aggregateAt)).toBe("late");
    // 2 日の作り物の回（12/1 15:00〜12/3 20:59:59）: 12/2 12:00 までは序盤、そこから終盤（12/2 のうちは重なる）
    const twoDays = { startAt: jst(2026, 12, 1, 15), aggregateAt: jst(2026, 12, 3, 20, 59, 59) };
    expect(toolPhaseOf(twoDays, jst(2026, 12, 2, 11, 59))).toBe("early");
    expect(toolPhaseOf(twoDays, jst(2026, 12, 2, 12))).toBe("late");
    expect(toolPhaseOf(twoDays, jst(2026, 12, 2, 23))).toBe("late");
  });

  // ★ 本番の時刻（15:00・20:00 開始、20:59・19:59 集計）は UTC にしても同じ日付なので、UTC の日付で数えても通ってしまう。
  //   日本時間 0:00〜8:59 は UTC では前の日になる。そこに開始・集計を置いた作り物の回で取り違えを見分ける
  it("開始・集計が日本時間の朝（UTC では前の日）でも、日本時間の日付で数える", () => {
    const e = { startAt: jst(2026, 12, 1, 5), aggregateAt: jst(2026, 12, 8, 5, 59, 59) };
    // 序盤は 12/2 いっぱい（UTC で数えると 12/2 9:00 に中盤になってしまう）
    expect(toolPhaseOf(e, jst(2026, 12, 2, 10))).toBe("early");
    expect(toolPhaseOf(e, jst(2026, 12, 3, 0))).toBe("mid");
    // 終盤は 12/7 12:00 から（UTC で数えると 12/6 21:00 に終盤になってしまう）
    expect(toolPhaseOf(e, jst(2026, 12, 7, 6))).toBe("mid");
    expect(toolPhaseOf(e, jst(2026, 12, 7, 12))).toBe("late");
  });

  it("集計が日本時間の 0:00 ちょうどなら、その日が集計日（終盤は前日 12:00 から）", () => {
    const e = { startAt: jst(2026, 12, 1, 15), aggregateAt: jst(2026, 12, 8, 0) };
    expect(toolPhaseOf(e, jst(2026, 12, 7, 11, 59))).toBe("mid");
    expect(toolPhaseOf(e, jst(2026, 12, 7, 12))).toBe("late");
  });

  it("時刻が数でない・集計が開始より前なら出さない（落とさない）", () => {
    const now = jst(2026, 11, 4, 12);
    expect(toolPhaseOf({ startAt: Number.NaN, aggregateAt: MARATHON_223.aggregateAt }, now)).toBeNull();
    expect(toolPhaseOf({ startAt: null, aggregateAt: "x" } as unknown as typeof MARATHON_223, now)).toBeNull();
    expect(toolPhaseOf({ startAt: MARATHON_223.aggregateAt, aggregateAt: MARATHON_223.startAt }, now)).toBeNull();
    expect(toolPhaseOf(MARATHON_223, Number.NaN)).toBeNull();
  });
});

describe("shelfItems（時期ごとの入口）", () => {
  const paths = (phase: Parameters<typeof shelfItems>[0]) => shelfItems(phase).map((i) => i.tool.path);

  it("序盤は編成ビルダー・編成かんたん比較・周回プラン", () => {
    expect(paths("early")).toEqual(["/deck", "/compare", "/plan"]);
  });

  it("中盤は周回プラン・必要稼働時間計算・効率曲ランキング", () => {
    expect(paths("mid")).toEqual(["/plan", "/worktime", "/ranking"]);
  });

  it("終盤はアナライザーを先頭に大きく、あとは周回プラン", () => {
    const items = shelfItems("late");
    expect(items.map((i) => i.tool.path)).toEqual(["/analyzer", "/plan"]);
    expect(items.map((i) => i.lead)).toEqual([true, false]);
  });

  it("序盤・中盤に大きく出すものは無い", () => {
    expect(shelfItems("early").some((i) => i.lead)).toBe(false);
    expect(shelfItems("mid").some((i) => i.lead)).toBe(false);
  });

  // ★ 名前・アイコン・説明の正本は src/tools.ts。ここで二重に持たない
  it("ツールの定義は src/tools.ts のものをそのまま使う", () => {
    for (const phase of ["early", "mid", "late"] as const) {
      for (const { tool } of shelfItems(phase)) {
        expect(TOOLS).toContain(tool);
      }
    }
  });

  it("公開していないツールは出さない", () => {
    const tools = TOOLS.map((t) => (t.id === "compare" ? { ...t, status: "coming_soon" as const } : t));
    expect(shelfItems("early", tools).map((i) => i.tool.id)).toEqual(["deck", "plan"]);
  });

  // ★ 指揮の判断（2026-11-09）: 一覧の説明「ポイント調整の方法を検索できます。」は中身と食い違うので、機能紹介の文に合わせた
  it("アナライザーの説明は、目標ちょうどで止まる走り方を出すこと", () => {
    expect(TOOLS.find((t) => t.id === "analyzer")?.description).toBe("いまのPtと目標のPtを入れると、目標ちょうどで止まる走り方を出します。");
  });
});

describe("toolShelf（ページが読む形）", () => {
  const H = 3_600_000;
  const snap = (event: Partial<Snapshot["event"]>) => ({ event: { id: 223, name: "x", type: "marathon", unit: "none", durationHours: 198, ...MARATHON_223, ...event } }) as Snapshot;

  it("開催中なら時期と入口を返す", () => {
    const s = toolShelf(snap({}), jst(2026, 11, 4, 12));
    expect(s?.phase).toBe("mid");
    expect(s?.items.map((i) => i.tool.id)).toEqual(["plan", "worktime", "ranking"]);
  });

  it("回が無い・終わった後・始まる前は null", () => {
    expect(toolShelf(null, jst(2026, 11, 4, 12))).toBeNull();
    expect(toolShelf(snap({}), MARATHON_223.aggregateAt + 2 * H)).toBeNull();
    expect(toolShelf(snap({}), MARATHON_223.startAt - H)).toBeNull();
  });

  // ★ X から来た人の着地のページ。壊れた snapshot で例外を出すと、予測ごと見えなくなる
  it("壊れた snapshot（event が無い・種別が無い・時刻が数でない）でも例外を出さずに null", () => {
    const now = jst(2026, 11, 4, 12);
    expect(toolShelf({} as Snapshot, now)).toBeNull();
    expect(toolShelf({ event: null } as unknown as Snapshot, now)).toBeNull();
    expect(toolShelf(snap({ type: undefined, startAt: null as unknown as number }), now)).toBeNull();
  });
});
