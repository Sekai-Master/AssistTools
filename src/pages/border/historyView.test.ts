import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPES,
  hourGroups,
  idList,
  missingOf,
  parseFinals,
  perDay,
  pickEvent,
  pickTypes,
  poolOf,
  rankRows,
  standings,
  type HistoryEvent,
} from "./historyView";

const ev = (id: number, hours: number, f50: number, extra: Partial<HistoryEvent> = {}): HistoryEvent => ({
  id,
  name: `event ${id}`,
  asset: null,
  type: "marathon",
  typeLabel: "マラソン",
  unit: "none",
  start: "2026-01-01",
  days: Math.round(hours / 24),
  hours,
  finals: { "50": f50, "100": f50 / 2, "200": f50 / 3, "500": f50 / 4, "1000": f50 / 10, "2000": f50 / 20 },
  ...extra,
});

describe("歴代ボーダーの表の読み取り", () => {
  it("形の合わない行は捨て、終値は正の有限の数だけ残す。素材名は URL に使える文字だけ", () => {
    const rows = parseFinals({
      events: [
        null,
        { id: "x" },
        { ...ev(1, 198, 100), finals: { "50": 100, "100": "9", "1000": Infinity, "200": 0 } },
        { ...ev(2, 198, 100), asset: "../evil" },
        { ...ev(3, 198, 100), finals: [1, 2] },
        { ...ev(4, 198, 100), days: Number.NaN },
        { ...ev(5, Number.POSITIVE_INFINITY, 100) },
        { ...ev(6, 198, 100), name: "" },
      ],
    });
    expect(rows.map((e) => e.id)).toEqual([1, 2]);
    expect(rows[0].finals).toEqual({ "50": 100 });
    expect(rows[1].asset).toBeNull();
    expect(parseFinals(null)).toEqual([]);
  });

  it("種の表（scripts/border/data/finals-seed.json）が全行読める", () => {
    const raw = JSON.parse(fs.readFileSync(new URL("../../../scripts/border/data/finals-seed.json", import.meta.url), "utf8")) as { events: unknown[] };
    expect(parseFinals(raw)).toHaveLength(raw.events.length);
  });
});

describe("並べ方", () => {
  // 102時間の回は短いので終値は小さいが、日速では上に来る
  const all = [ev(1, 198, 300), ev(2, 222, 400), ev(3, 102, 250), ev(4, 198, 350)];

  it("終値・日速・同じ長さで並べ、順位を振る", () => {
    expect(rankRows(all, "50", "final").map((r) => r.event.id)).toEqual([2, 4, 1, 3]);
    // 日速: 3=58.8・2=43.2・4=42.4・1=36.4
    expect(rankRows(all, "50", "daily").map((r) => r.event.id)).toEqual([3, 2, 4, 1]);
    expect(rankRows(all, "50", "same", 198).map((r) => [r.pos, r.event.id])).toEqual([
      [1, 4],
      [2, 1],
    ]);
    expect(rankRows(all, "50", "same")).toEqual([]);
    expect(perDay(all[2], "50")).toBeCloseTo((250 / 102) * 24);
  });

  it("同じ値なら古い回が先（Bot の画像と同じ）。日速が同じときも", () => {
    const tie = [ev(5, 198, 300), ev(1, 198, 300), { ...ev(9, 198, 999), finals: { "100": 1 } }];
    expect(rankRows(tie, "50", "final").map((r) => r.event.id)).toEqual([1, 5]);
    expect(rankRows([ev(7, 96, 100), ev(3, 192, 200)], "50", "daily").map((r) => r.event.id)).toEqual([3, 7]);
  });

  it("記録の無い回は並べず、無い回として古い順に返す", () => {
    const pool = [ev(90, 198, 300, { finals: { "50": 300 } }), ev(87, 198, 200, { finals: { "50": 200 } }), ev(1, 198, 100)];
    expect(rankRows(pool, "200", "final").map((r) => r.event.id)).toEqual([1]);
    expect(missingOf(pool, "200", "final").map((e) => e.id)).toEqual([87, 90]);
    expect(missingOf(pool, "200", "same", 102)).toEqual([]);
  });

  it("位置づけは6順位とも返し、記録の無い順位は final を null に", () => {
    const s = standings(all, all[2]);
    expect(s.map((x) => x.rank)).toEqual(["50", "100", "200", "500", "1000", "2000"]);
    expect(s[0]).toMatchObject({ final: 250, total: { pos: 4, of: 4 }, same: { pos: 1, of: 1 }, daily: { pos: 1, of: 4 } });
    const partial = { ...all[2], finals: { "50": 250 } };
    expect(standings([...all.slice(0, 2), partial], partial)[2]).toMatchObject({ rank: "200", final: null, perDay: null });
  });

  it("長さごとの回数は多い順", () => {
    expect(hourGroups(all)).toEqual([
      { hours: 198, count: 2 },
      { hours: 222, count: 1 },
      { hours: 102, count: 1 },
    ]);
  });
});

describe("比べる回と URL", () => {
  const all = [ev(1, 198, 1), ev(2, 198, 1, { type: "cheerful_carnival" }), ev(3, 198, 1, { type: "world_bloom" }), ev(4, 198, 1, { type: "memories" })];

  it("選んだ種別の回に、選んでいる回を必ず加える", () => {
    expect(poolOf(all, ["marathon"], all[3]).map((e) => e.id)).toEqual([1, 4]);
    expect(poolOf(all, DEFAULT_TYPES, null).map((e) => e.id)).toEqual([1, 2, 4]);
  });

  it("?types= は知っている種別だけ。無い・全部知らなければ既定（ワールドリンク抜き）", () => {
    expect(pickTypes("world_bloom,marathon,xxx")).toEqual(["world_bloom", "marathon"]);
    expect(pickTypes(null)).toEqual([...DEFAULT_TYPES]);
    expect(pickTypes("constructor")).toEqual([...DEFAULT_TYPES]);
  });

  it("?event= の回を選ぶ。無い・壊れていれば最新の回", () => {
    expect(pickEvent(all, "3")?.id).toBe(3);
    expect(pickEvent(all, "99")?.id).toBe(4);
    expect(pickEvent(all, "3x")?.id).toBe(4);
    expect(pickEvent(all, null)?.id).toBe(4);
    expect(pickEvent([], null)).toBeNull();
  });

  it("回の番号は多ければ縮めて書く", () => {
    expect(idList(all)).toBe("1・2・3・4");
    expect(idList([...all, ...all], 3)).toBe("1・2・3…ほか5回");
  });
});
