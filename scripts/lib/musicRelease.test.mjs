import { describe, expect, it } from "vitest";
import { auditUnreleased, splitByRelease } from "./musicRelease.mjs";

const NOW = Date.UTC(2026, 8, 30, 11, 0);

describe("公開日で分ける", () => {
  it("公開日を過ぎた曲だけを残し、ちょうどの時刻は公開済みに入れる", () => {
    const musics = [
      { id: 1, publishedAt: NOW - 1 },
      { id: 2, publishedAt: NOW },
      { id: 3, publishedAt: NOW + 1 },
    ];
    const { released, upcoming } = splitByRelease(musics, NOW);
    expect(released.map((m) => m.id)).toEqual([1, 2]);
    expect(upcoming.map((m) => m.id)).toEqual([3]);
  });

  // ★ 公開日が読めない曲は、出してよいと言い切れないので出さない側に倒す
  it("公開日が無い・数でない曲は公開前として扱う", () => {
    const { released, upcoming } = splitByRelease([{ id: 1 }, { id: 2, publishedAt: "x" }, null], NOW);
    expect(released).toEqual([]);
    expect(upcoming.map((m) => m.id)).toEqual([1, 2]);
  });

  it("配列でなければ両方空", () => {
    expect(splitByRelease(undefined, NOW)).toEqual({ released: [], upcoming: [] });
  });
});

describe("出力の検算", () => {
  it("公開前の曲が混ざっていれば挙げる", () => {
    const out = [
      { id: "001", title: "公開済み", publishedAt: NOW - 1 },
      { id: "729", title: "公開前", publishedAt: NOW + 1 },
    ];
    expect(auditUnreleased(out, NOW)).toEqual(["729 公開前"]);
  });

  it("混ざっていなければ空", () => {
    expect(auditUnreleased([{ id: "001", title: "a", publishedAt: NOW }], NOW)).toEqual([]);
  });
});
