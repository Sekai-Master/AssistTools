import { describe, expect, it } from "vitest";
import { TOOLS } from "../../tools";
import { elapsedRatio, formatCountdown, logoSrc, rankBar, searchTools, shortDate, summaryOf, tickMs } from "./hubView";

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe("残り時間の書き方", () => {
  // 大きな数字が毎秒変わると目障りなので、1日以上あるあいだは秒を出さない
  it("1日以上は「日」と時:分（秒は出さない）", () => {
    expect(formatCountdown(3 * D + 4 * H + 5 * M + 6 * S)).toBe("3日 04:05");
  });

  // ★ 最終日は秒が要る（集計直前の最後の1曲の判断に使う）
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
  it("秒を出す最終日は1秒、それより前は15秒", () => {
    expect(tickMs(23 * H)).toBe(1000);
    expect(tickMs(2 * D)).toBe(15_000);
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
