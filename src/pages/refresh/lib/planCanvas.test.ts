import { describe, expect, it } from "vitest";
import { planCanvasHeight, type PlanCanvasRow } from "./planCanvas";

/**
 * R6: PlanCanvasRow に scoreBand/lb/bonusLabel（強調表示用）を追加したことによる
 * refresh/worktime への非破壊回帰。これらのフィールドを持たない行（refresh 本来の
 * 周回行）は従来通り54px/行のまま1pxも変わらないことを固定する。
 */
describe("planCanvasHeight — 新フィールド未指定行は高さ不変（refresh/worktime 非破壊）", () => {
  const NORMAL_ROW: PlanCanvasRow = {
    time: "21:00 → 22:00",
    label: "独りんぼエンヴィー",
    percent: "23.5%",
    warn: false,
  };
  const EMPHASIS_ROW: PlanCanvasRow = {
    time: "1回 × 3炊き",
    label: "独りんぼエンヴィー",
    percent: "+1,000 Pt",
    warn: false,
    scoreBand: { min: 0, max: 19_999 },
  };

  it("新フィールド無し3行は 128 + 54*3 + 96", () => {
    const rows = [NORMAL_ROW, NORMAL_ROW, NORMAL_ROW];
    expect(planCanvasHeight(rows)).toBe(128 + 54 * 3 + 96);
  });

  it("scoreBand を持つ行は84pxに広がり、無い行は54pxのまま混在できる", () => {
    const rows = [NORMAL_ROW, EMPHASIS_ROW];
    expect(planCanvasHeight(rows)).toBe(128 + 54 + 84 + 96);
  });

  it("0行なら HEADER_H + FOOTER_H のみ", () => {
    expect(planCanvasHeight([])).toBe(128 + 96);
  });
});
