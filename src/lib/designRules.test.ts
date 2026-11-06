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

  // ★ 3 節。部品の寸法（入力欄の py-2.5 など）は例外。間隔だけを止める
  it("間隔は 4px の倍数だけ", () => {
    const off = sources(path.join(__dirname, "..")).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          /(?<![\w.-])(?:gap(?:-[xy])?-(?:1|2)\.5|space-y-(?:1|2)\.5|m[tblr]-(?:1|2)\.5|p-2\.5)(?![\w.-])/.test(line) ? [`${path.basename(file)}:${i + 1}`] : [],
        ),
    );
    expect(off).toEqual([]);
  });

  // ★ 4 節。大きさは 22px（見出しの中）・20px（既定）・16px（札の中）の 3 段。!text-* や別の大きさを足さない
  it("アイコンの大きさは 3 段だけ", () => {
    const off = sources(path.join(__dirname, "..")).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/material-icons[^"]*(?:!text-|text-\[(?!22px))/.test(line) ? [`${path.basename(file)}:${i + 1}`] : [])),
    );
    expect(off).toEqual([]);
  });
});
