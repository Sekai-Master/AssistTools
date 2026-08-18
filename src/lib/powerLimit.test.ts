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

  it("上限つきのイベントが存在し、値はすべて 336,000", () => {
    expect(data.events.length).toBeGreaterThan(0);
    for (const e of data.events) expect(e.powerLimit).toBe(336_000);
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

  it("上限が付くのは world_bloom だけ", () => {
    for (const e of bonuses.events) {
      if (e.powerLimit != null) expect(e.type).toBe("world_bloom");
    }
  });

  it("powerLimits.json は bonuses.json と食い違わない", () => {
    const fromBonuses = new Map(
      bonuses.events.filter((e) => e.powerLimit != null).map((e) => [e.id, e.powerLimit])
    );
    for (const e of data.events) expect(fromBonuses.get(e.id)).toBe(e.powerLimit);
  });
});
