/**
 * 表のすぐ上に出す前提の 1 行（2026-11-19 表の直し）。
 *
 * ★ 既定（自分の条件を入れていない）でも Pt/時 などの絶対値を出すので、何を前提にした数字かを表の上で言う。
 * ★ 数字は計算に実際に使っている params から作る（文字に数字を書かない）。既定なら DEFAULT_PARAMS と
 *   DEFAULT_OVERHEAD_SEC の値になる。
 * ★ 「（仮）」は印（provisionalLoss）だけで決める（値が 33 かどうかでは決めない）。
 */
import { describe, expect, it } from "vitest";
import { premiseParts } from "./premise";
import { DEFAULT_OVERHEAD_SEC, DEFAULT_PARAMS } from "./efficiency";

describe("premiseParts — 前提の 1 行の部品", () => {
  const solo = { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.solo };

  it("既定の数字は DEFAULT_PARAMS と DEFAULT_OVERHEAD_SEC から作る", () => {
    expect(premiseParts(solo, "solo", { showLoss: true, provisionalLoss: false })).toEqual([
      `総合力${(DEFAULT_PARAMS.power / 10000).toFixed(1)}万`,
      `ボーナス${DEFAULT_PARAMS.bonus}%`,
      `${DEFAULT_PARAMS.taki}焚き`,
      `スキル${DEFAULT_PARAMS.skillLeader}/${DEFAULT_PARAMS.skillTotal}`,
      `ロス${DEFAULT_OVERHEAD_SEC.solo}秒`,
    ]);
  });

  it("ロスが仮の値の印が立っていれば「（仮）」を添える（値は見ない）", () => {
    const parts = premiseParts({ ...solo, overheadSec: 40 }, "solo", { showLoss: true, provisionalLoss: true });
    expect(parts.at(-1)).toBe("ロス40秒（仮）");
  });

  it("ロスが表の数字を動かさないとき（showLoss が false）は書かない", () => {
    const parts = premiseParts(solo, "auto", { showLoss: false, provisionalLoss: false });
    expect(parts.some((p) => p.startsWith("ロス"))).toBe(false);
    expect(parts).toContain(`ボーナス${DEFAULT_PARAMS.bonus}%`);
  });

  it("チャレライはイベントの外なので、ボーナス・焚き数・ロスを書かない", () => {
    const parts = premiseParts(
      { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.challenge },
      "challenge",
      { showLoss: false, provisionalLoss: false },
    );
    expect(parts).toEqual([
      `総合力${(DEFAULT_PARAMS.power / 10000).toFixed(1)}万`,
      `スキル${DEFAULT_PARAMS.skillLeader}/${DEFAULT_PARAMS.skillTotal}`,
    ]);
  });

  it("焚き数・総合力は渡した params のもの（保存した焚き数や、上限で頭打ちにした総合力をそのまま出す）", () => {
    const parts = premiseParts({ ...solo, taki: 10, power: 312_345 }, "solo", { showLoss: true, provisionalLoss: false });
    expect(parts).toContain("10焚き");
    expect(parts[0]).toBe("総合力31.2万");
  });

  it("ボーナスの 0.5% 刻みはそのまま出す", () => {
    const parts = premiseParts({ ...solo, bonus: 412.5 }, "solo", { showLoss: false, provisionalLoss: false });
    expect(parts).toContain("ボーナス412.5%");
  });
});
