import { describe, expect, it } from "vitest";
import { parseRankingQuery } from "./rankingQuery";

/**
 * 効率曲ランキングの URL の指定（2026-11-25）。投稿のリンクから一発で並びを開くため。
 * ★ 読むだけ。不正な値は無視する（既定の開き方を変えない）。
 */
describe("parseRankingQuery", () => {
  const q = (s: string) => parseRankingQuery(new URLSearchParams(s));

  it("tab=solo&by=play を読む", () => {
    expect(q("?tab=solo&by=play")).toEqual({ tab: "solo", by: "play" });
  });

  it("tab は4つのタブの値（manual / solo / auto / challenge）を受ける", () => {
    for (const tab of ["manual", "solo", "auto", "challenge"]) expect(q(`tab=${tab}`)).toEqual({ tab });
  });

  it("by は hour / play を受ける", () => {
    expect(q("by=hour")).toEqual({ by: "hour" });
    expect(q("by=play")).toEqual({ by: "play" });
  });

  it("クエリが無ければ何も指定しない", () => {
    expect(q("")).toEqual({});
  });

  it("不正な値・大文字・空は無視する（ほかの正しい指定は生かす）", () => {
    expect(q("tab=hitori&by=time")).toEqual({});
    expect(q("tab=SOLO&by=PLAY")).toEqual({});
    expect(q("tab=&by=")).toEqual({});
    expect(q("tab=__proto__&by=play")).toEqual({ by: "play" });
    expect(q("tab=auto&by=1")).toEqual({ tab: "auto" });
  });
});
