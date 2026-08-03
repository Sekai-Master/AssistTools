import { describe, expect, it } from "vitest";
import { formatDataDate } from "./SiteFooter";
import { PAGE_LOADERS, PAGE_TITLES, routeTitle } from "../motion/routes";

describe("formatDataDate", () => {
  it("ISO 文字列を日本時間の日付にする", () => {
    // UTC で 8/3 15:00 = JST で 8/4 0:00。UTC のまま出すと1日ずれる。
    expect(formatDataDate("2026-08-03T15:00:00.000Z")).toBe("2026-08-04");
    expect(formatDataDate("2026-08-03T14:59:00.000Z")).toBe("2026-08-03");
  });

  it("空・不正な値では表示しない（null）", () => {
    expect(formatDataDate("")).toBeNull();
    expect(formatDataDate("いつか")).toBeNull();
  });
});

describe("ツール以外のページ", () => {
  it("読み物ページはすべて読み上げ用の名前を持つ", () => {
    for (const path of Object.keys(PAGE_LOADERS)) {
      expect(PAGE_TITLES, `${path} の名前が無い`).toHaveProperty(path);
      expect(routeTitle(path)).not.toBe("ページ");
    }
  });
});
