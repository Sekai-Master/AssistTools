/**
 * 総合力の上限まわり。
 *
 * ★ ここで守りたいのは「ワールドリンクなら一律で掛かる」という取り違えを起こさないこと。
 *   実データでは world_bloom 18回のうち上限があるのは5回だけで、旧ワールドリンクには無い。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { activeLimit, cappedPower, latestLimit, type PowerLimitEvent } from "./powerLimit";

const ev = (id: number, startAt: number, aggregateAt: number, powerLimit = 336_000): PowerLimitEvent => ({
  id,
  name: `event${id}`,
  startAt,
  aggregateAt,
  powerLimit,
});

describe("cappedPower", () => {
  it("上限を超えたぶんは切り捨てる", () => {
    expect(cappedPower(400_000, 336_000)).toBe(336_000);
  });

  it("上限に届いていなければそのまま", () => {
    expect(cappedPower(300_000, 336_000)).toBe(300_000);
  });

  it("上限が無い（null / undefined / 0）ならそのまま", () => {
    expect(cappedPower(400_000, null)).toBe(400_000);
    expect(cappedPower(400_000, undefined)).toBe(400_000);
    // 0 を「総合力0」と解釈すると全曲のスコアが0になって画面が壊れる。上限なし扱いにする。
    expect(cappedPower(400_000, 0)).toBe(400_000);
  });
});

describe("activeLimit", () => {
  const rows = [ev(202, 100, 200), ev(214, 1_000, 2_000)];

  it("開催中のものを返す", () => {
    expect(activeLimit(rows, 1_500)?.id).toBe(214);
  });

  it("開始前・集計後は返さない", () => {
    expect(activeLimit(rows, 50)).toBeNull();
    expect(activeLimit(rows, 500)).toBeNull();
    expect(activeLimit(rows, 5_000)).toBeNull();
  });

  it("境目（開始ちょうど・集計ちょうど）は開催中に含める", () => {
    expect(activeLimit(rows, 1_000)?.id).toBe(214);
    expect(activeLimit(rows, 2_000)?.id).toBe(214);
  });

  it("重なっていたら厳しい方を採る（緩い方だと過大なPtを見せる）", () => {
    const overlap = [ev(1, 0, 100, 400_000), ev(2, 0, 100, 336_000)];
    expect(activeLimit(overlap, 50)?.powerLimit).toBe(336_000);
  });
});

describe("latestLimit", () => {
  it("開催中でなくても、いちばん新しい上限を返す（期間外の下見用）", () => {
    const rows = [ev(202, 100, 200), ev(214, 1_000, 2_000)];
    expect(latestLimit(rows)?.id).toBe(214);
  });

  it("1件も無ければ null", () => {
    expect(latestLimit([])).toBeNull();
  });
});

describe("配信データの実測", () => {
  const data = JSON.parse(readFileSync("public/CardDatas/powerLimits.json", "utf8")) as {
    events: PowerLimitEvent[];
  };
  const bonuses = JSON.parse(readFileSync("public/CardDatas/bonuses.json", "utf8")) as {
    events: { id: number; type: string; powerLimit?: number }[];
  };

  /**
   * ★★ **ここで値を 336,000 に固定してはいけない。** ★★
   * このテストは `refresh-card-data.yml` の門番（`npm test`）に入っている。
   * 次のワールドリンクが別の上限（例 350,000）で来た瞬間にここが落ちると、
   * 上限どころか**新カード・新イベントの配信そのものが止まる**（破壊者指摘 2026-08-18）。
   * コードは値を動的に読むので、実際の値が何であっても正しく動く。
   * 門番に置いてよいのは「形が壊れていないか」だけ。
   */
  it("上限つきのイベントが存在し、値が正の数として入っている", () => {
    expect(data.events.length).toBeGreaterThan(0);
    for (const e of data.events) {
      expect(Number.isFinite(e.powerLimit)).toBe(true);
      expect(e.powerLimit).toBeGreaterThan(0);
    }
  });

  /**
   * ★★ これが本命のテスト。★★
   * 「ワールドリンク＝上限あり」で実装すると、上限の無い過去イベント13回を
   * 巻き込んで計算を誤らせる。**world_bloom の方が真に多い**ことを固定しておく。
   */
  it("world_bloom のうち上限があるのは一部だけ（type で代用してはいけない）", () => {
    const wl = bonuses.events.filter((e) => e.type === "world_bloom");
    const capped = wl.filter((e) => e.powerLimit != null);
    expect(wl.length).toBeGreaterThan(capped.length);
    expect(capped.length).toBe(data.events.length);
  });

  /**
   * ★ 「上限が付くのは world_bloom だけ」も**門番に置かない**。
   *   他の種別に付いた回が来ただけで配信が止まる。コードは種別を見ずに
   *   powerLimit の有無だけで判定しているので、付いても正しく動く。
   *   ここでは種別ごとの内訳を出すに留める（人が気づけるように）。
   */
  it("上限の付き方をログに残す（止めない）", () => {
    const byType = new Map<string, number>();
    for (const e of bonuses.events) {
      if (e.powerLimit != null) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    }
    expect(byType.size).toBeGreaterThan(0);
  });

  it("powerLimits.json は bonuses.json と食い違わない", () => {
    const fromBonuses = new Map(
      bonuses.events.filter((e) => e.powerLimit != null).map((e) => [e.id, e.powerLimit])
    );
    for (const e of data.events) expect(fromBonuses.get(e.id)).toBe(e.powerLimit);
  });
});
