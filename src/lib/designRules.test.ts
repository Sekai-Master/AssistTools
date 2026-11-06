/**
 * デザインの規約（docs/design-system.md）のうち、コードを読めば判定できるもの。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("デザインの規約", () => {
  // ★ 2 節。10〜11px の字が 75 か所あり、グラフの目盛りや注記が読みにくかった（2026-11-06 に 12px へ上げた）
  it("字を 12px より小さくしない", () => {
    const small = sources(path.join(__dirname, "..")).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/text-\[(?:\d|1[01])(?:\.\d+)?px\]/.test(line) ? [`${path.basename(file)}:${i + 1}`] : [])),
    );
    expect(small).toEqual([]);
  });
});
