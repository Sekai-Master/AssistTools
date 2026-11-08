/**
 * @vitest-environment jsdom
 *
 * お題の小窓: 判定しにくいお題は、判定に使う値（読み・追加された日・レベル・ノーツ数）を曲名の下に出す。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { parseMusics } from "./useBingoMusics";
import { decodeOdaiSeed } from "./odaiLogic";
import { OdaiSheet } from "./OdaiSheet";

afterEach(cleanup);

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const KEYS = ["dm32", "de28", "da", "dn7", "a2021", "a0", "yi", "s1", "kl", "gn", "m3", "va"];
const filler = ["u1", "u2", "u3", "u4", "u5", "ra", "rk", "rs", "rt", "rh", "rm", "rr"];
const CARD = decodeOdaiSeed(`OD1:${[...KEYS, "F", ...filler].join(".")}`, MUSICS);
const odaiOf = (key: string) => {
  const cell = CARD.find((c) => c !== "FREE" && c.odai.key === key);
  if (!cell || cell === "FREE") throw new Error(key);
  return cell.odai;
};

function open(key: string) {
  render(
    <OdaiSheet odai={odaiOf(key)} cleared={false} musics={MUSICS} jacketBase="/j/" onSetCleared={() => {}} onClose={() => {}} />
  );
  return within(screen.getByRole("dialog")).getAllByRole("listitem");
}

describe("お題の小窓の、曲名の下の値", () => {
  it.each([
    ["dm32", /^MASTER Lv\.3[2-9]$/],
    ["de28", /^EXPERT Lv\.(2[89]|3\d)$/],
    ["da", /^APPEND Lv\.\d+$/],
    ["dn7", /^MASTER [1-6]\d{2}ノーツ$/],
    ["a2021", /^2021\/\d{2}\/\d{2}$/],
    ["a0", /^2020\/09\/30$/],
    // 読みの後ろの「！」などは数えない（odaiDefs.ts の readingKana）
    ["yi", /い[^ぁ-ゖァ-ヺー]*$/],
  ])("%s: 判定に使う値を出す", (key, pattern) => {
    const items = open(key);
    expect(items.length).toBe(MUSICS.filter((m) => odaiOf(key).test(m)).length);
    for (const li of items) {
      const hint = li.querySelector(".text-xs")?.textContent ?? "";
      expect(hint).toMatch(pattern);
    }
  });

  it.each(["s1", "kl", "gn", "m3", "va"])("%s: 曲名で判定できる・値を持たないお題は出さない", (key) => {
    for (const li of open(key)) expect(li.querySelector(".text-xs")).toBeNull();
  });
});
