import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { hourGroups, parseFinals, perDay, pickEvent, rankRows, standings, type HistoryEvent } from "./historyView";

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
  finals: { "50": f50, "100": f50 / 2, "1000": f50 / 10 },
  ...extra,
});

describe("歴代ボーダーの表の読み取り", () => {
  it("形の合わない行は捨て、終値は有限の数だけ残す。素材名は URL に使える文字だけ", () => {
    const rows = parseFinals({
      events: [
        null,
        { id: "x" },
        { ...ev(1, 198, 100), finals: { "50": 100, "100": "9", "1000": Infinity } },
        { ...ev(2, 198, 100), asset: "../evil" },
        { ...ev(3, 198, 100), finals: [1, 2] },
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
    expect(perDay(all[2], "50")).toBeCloseTo((250 / 102) * 24);
  });

  it("同じ値なら古い回が先（Bot の画像と同じ）。その順位の終値が無い回は並べない", () => {
    const tie = [ev(5, 198, 300), ev(1, 198, 300), { ...ev(9, 198, 999), finals: { "100": 1 } }];
    expect(rankRows(tie, "50", "final").map((r) => r.event.id)).toEqual([1, 5]);
  });

  it("位置づけは3つの並べ方の順位と日速", () => {
    const s = standings(all, all[2]);
    expect(s.map((x) => x.rank)).toEqual(["50", "100", "1000"]);
    expect(s[0]).toMatchObject({ final: 250, total: { pos: 4, of: 4 }, same: { pos: 1, of: 1 }, daily: { pos: 1, of: 4 } });
  });

  it("長さごとの回数は多い順", () => {
    expect(hourGroups(all)).toEqual([
      { hours: 198, count: 2 },
      { hours: 222, count: 1 },
      { hours: 102, count: 1 },
    ]);
  });

  it("?event= の回を選ぶ。無い・壊れていれば最新の回", () => {
    expect(pickEvent(all, "3")?.id).toBe(3);
    expect(pickEvent(all, "99")?.id).toBe(4);
    expect(pickEvent(all, "3x")?.id).toBe(4);
    expect(pickEvent(all, null)?.id).toBe(4);
    expect(pickEvent([], null)).toBeNull();
  });
});
