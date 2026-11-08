import { describe, expect, it } from "vitest";
import { TOOLS } from "../../tools";
import {
  captionKind,
  elapsedRatio,
  endAt,
  formatCountdown,
  logoSrc,
  nameParts,
  rankBar,
  sanitizeSnapshot,
  searchTools,
  shortDate,
  summaryOf,
  tickMs,
} from "./hubView";

// ★ 「ついぼジェネレータ／ー」「ポイント調整アナラ／イザー」と語の途中で折れた（2026-11-05 の撮影）
describe("ツールの名前の折り目", () => {
  it("決まった語の前で切る", () => {
    expect(nameParts("ついぼジェネレーター")).toEqual(["ついぼ", "ジェネレーター"]);
    expect(nameParts("ポイント調整アナライザー")).toEqual(["ポイント調整", "アナライザー"]);
    // ★ 分類の枠に入れると幅が減り「リフレッシュゲー／ジ計算機」と折れた（2026-11-06 の撮影）
    expect(nameParts("リフレッシュゲージ計算機")).toEqual(["リフレッシュ", "ゲージ", "計算機"]);
    expect(nameParts("BINGOカードジェネレーター")).toEqual(["BINGOカード", "ジェネレーター"]);
    expect(nameParts("編成かんたん比較")).toEqual(["編成かんたん", "比較"]);
    expect(nameParts("周回ラップ計測")).toEqual(["周回ラップ", "計測"]);
    expect(nameParts("必要稼働時間計算")).toEqual(["必要稼働時間", "計算"]);
  });

  it("語尾だけの名前・語尾の無い名前は切らない", () => {
    expect(nameParts("計算機")).toEqual(["計算機"]);
    expect(nameParts("周回プラン")).toEqual(["周回プラン"]);
  });

  it("全部の名前で、つなぐと元の名前に戻る", () => {
    for (const t of TOOLS) expect(nameParts(t.name).join("")).toBe(t.name);
  });
});

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe("残り時間の書き方", () => {
  // ★ 以前は1日以上あるあいだ秒を隠していた。Nori「残り時間秒単位で出ないの」（2026-11-06）
  it("1日以上は「日」と時:分:秒", () => {
    expect(formatCountdown(3 * D + 4 * H + 5 * M + 6 * S)).toBe("3日 04:05:06");
  });

  it("1日未満は時:分:秒", () => {
    expect(formatCountdown(23 * H + 59 * M + 59 * S)).toBe("23:59:59");
  });

  it("秒未満は切り捨てる（0秒になる前に「0秒」を見せない）", () => {
    expect(formatCountdown(1500)).toBe("00:00:01");
  });

  it("終わった・負の値は空", () => {
    expect(formatCountdown(0)).toBe("");
    expect(formatCountdown(-5 * S)).toBe("");
  });
});

describe("経過の割合", () => {
  const ev = { startAt: 1000, aggregateAt: 2000 };

  it("始まりから集計までのどこにいるか", () => {
    expect(elapsedRatio(ev, 1250)).toBe(0.25);
  });

  it("0〜1に収める", () => {
    expect(elapsedRatio(ev, 0)).toBe(0);
    expect(elapsedRatio(ev, 5000)).toBe(1);
  });
});

describe("ロゴの URL", () => {
  it("素材名から組む", () => {
    expect(logoSrc("event_someday_2026")).toBe("/CardDatas/logo/event_someday_2026.webp");
  });

  // ★ API は D1 の値を検査せずに返す。URL に組む前にここで弾く（歴代ボーダーと同じ規則）
  it("英小文字・数字・下線以外を含む名前は使わない", () => {
    expect(logoSrc("../../x")).toBeNull();
    expect(logoSrc("event someday")).toBeNull();
    expect(logoSrc("Event_A")).toBeNull();
  });

  it("無い・空・文字列でないなら null", () => {
    expect(logoSrc(null)).toBeNull();
    expect(logoSrc(undefined)).toBeNull();
    expect(logoSrc("")).toBeNull();
    expect(logoSrc(42)).toBeNull();
  });
});

describe("順位のバー", () => {
  const r = { current: 50, predicted: 100, low: 90, high: 120 };

  it("いま・幅・予測の位置を、幅の上端より少し上を右端として割合で出す", () => {
    const top = 120 * 1.08;
    const bar = rankBar(r)!;
    expect(bar.current).toBeCloseTo((50 / top) * 100, 5);
    expect(bar.low).toBeCloseTo((90 / top) * 100, 5);
    expect(bar.band).toBeCloseTo((30 / top) * 100, 5);
    expect(bar.predicted).toBeCloseTo((100 / top) * 100, 5);
  });

  it("いまが右端を超えても 100 で止める", () => {
    expect(rankBar({ ...r, current: 500 })!.current).toBe(100);
  });

  it("予測か幅が無ければ出さない", () => {
    expect(rankBar({ ...r, predicted: null })).toBeNull();
    expect(rankBar({ ...r, low: null })).toBeNull();
    expect(rankBar({ ...r, high: null })).toBeNull();
    expect(rankBar({ ...r, high: 0 })).toBeNull();
  });
});

describe("描き直しの間隔", () => {
  it("秒を出すので、集計の前は残りが何日でも1秒", () => {
    expect(tickMs(23 * H)).toBe(1000);
    expect(tickMs(2 * D)).toBe(1000);
  });
});

describe("ツールの検索", () => {
  const ids = (q: string) => searchTools(q)?.map((t) => t.id);

  it("空・空白だけなら null（分類ごとの一覧に戻す）", () => {
    expect(searchTools("")).toBeNull();
    expect(searchTools("   ")).toBeNull();
  });

  it("名前で見つかる", () => {
    expect(ids("ボーダー")).toEqual(expect.arrayContaining(["border", "border-history"]));
  });

  // ★ 一覧から説明文を外したぶん、名前に無い語でも辿り着けるようにする
  it("名前に無い語でも、説明か分類の説明に入っていれば見つかる", () => {
    expect(ids("家具")).toEqual(["mysekai"]);
    expect(ids("ライボ")).toEqual(expect.arrayContaining(["worktime"]));
  });

  it("空白で区切った語はすべて含むものだけ", () => {
    const both = ids("編成 比べ")!;
    expect(both.length).toBeGreaterThan(0);
    for (const id of both) {
      const t = TOOLS.find((x) => x.id === id)!;
      expect(`${t.name}${t.description}`).toMatch(/編成/);
    }
  });

  it("全角・半角と大文字・小文字の違いを無視する", () => {
    expect(ids("ｂｉｎｇｏ")).toEqual(["bingo"]);
  });

  it("どれにも当たらなければ空の配列", () => {
    expect(searchTools("存在しない語XYZ")).toEqual([]);
  });
});

describe("更新履歴のカード", () => {
  it("日付は 月/日", () => {
    expect(shortDate("2026-10-31")).toBe("10/31");
    expect(shortDate("2026-01-05")).toBe("1/5");
  });

  it("説明の無い版は最初の項目で代える", () => {
    expect(summaryOf({ version: "1.0.0", date: "", summary: "", groups: [{ label: "追加", items: ["最初の項目"] }] })).toBe("最初の項目");
    expect(summaryOf({ version: "1.0.0", date: "", summary: "版の説明", groups: [] })).toBe("版の説明");
  });
});

describe("応答を整える", () => {
  const ev = { id: 223, name: "x", type: "marathon", unit: "school_refusal", startAt: 0, aggregateAt: 10, durationHours: 1 };
  const rank = { rank: 50, current: 1, predicted: 2, low: 1, high: 3, confidence: "mid", visible: true };

  it("形の崩れた順位だけ捨てる", () => {
    const s = sanitizeSnapshot({ event: ev, sampleAt: 5, ranks: [null, 3, { rank: "x", current: 1 }, rank] })!;
    expect(s.ranks).toHaveLength(1);
    expect(s.ranks[0].rank).toBe(50);
  });

  it("予測・幅が数でなければ null にする", () => {
    const s = sanitizeSnapshot({ event: ev, sampleAt: 5, ranks: [{ ...rank, predicted: "2", low: undefined }] })!;
    expect(s.ranks[0].predicted).toBeNull();
    expect(s.ranks[0].low).toBeNull();
  });

  it("イベントが無い・順位が1つも残らないなら null", () => {
    expect(sanitizeSnapshot(null)).toBeNull();
    expect(sanitizeSnapshot({ event: null, ranks: [rank] })).toBeNull();
    expect(sanitizeSnapshot({ event: ev, ranks: [null] })).toBeNull();
    expect(sanitizeSnapshot({ event: { ...ev, startAt: "0" }, ranks: [rank] })).toBeNull();
  });

  it("時刻が無ければ NaN（呼ぶ側が出さない）", () => {
    expect(Number.isNaN(sanitizeSnapshot({ event: ev, ranks: [rank] })!.sampleAt)).toBe(true);
  });
});

describe("下の行の書き方", () => {
  const base = sanitizeSnapshot({
    event: { id: 1, name: "x", type: "marathon", unit: "", startAt: 0, aggregateAt: 10, durationHours: 1 },
    sampleAt: 1,
    ranks: [{ rank: 50, current: 1, predicted: 2, low: 1, high: 3, confidence: "mid", visible: true }],
  })!;

  it("開催中で予測があれば「予測」", () => {
    expect(captionKind(base, true)).toBe("predicted");
  });

  it("開催中で予測が無い（隠している順位だけ）なら「いまの値」", () => {
    expect(captionKind({ ...base, ranks: base.ranks.map((r) => ({ ...r, visible: false })) }, true)).toBe("current");
  });

  it("終わった回は「最後に集めた値」", () => {
    expect(captionKind(base, false)).toBe("final");
  });

  it("終わりの時刻は集計の1分後（ボーダー予測のページと同じ）", () => {
    expect(endAt({ aggregateAt: 1000 })).toBe(61_000);
  });

  it("終わった後の描き直しは1分ごと", () => {
    expect(tickMs(-2 * M)).toBe(60_000);
  });
});
