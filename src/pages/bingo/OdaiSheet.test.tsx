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
import { decodeOdaiSeed, listOdaiSongs } from "./odaiLogic";
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

/** 「MASTER Lv.33」「MASTER 650ノーツ」などから数を取り出す。形が違えば NaN。 */
const numberIn = (hint: string, pattern: RegExp) => Number(pattern.exec(hint)?.[1] ?? NaN);

describe("お題の小窓の、曲名の下の値", () => {
  it.each([
    ["dm32", (h: string) => numberIn(h, /^MASTER Lv\.(\d+)$/) >= 32],
    ["de28", (h: string) => numberIn(h, /^EXPERT Lv\.(\d+)$/) >= 28],
    ["da", (h: string) => numberIn(h, /^APPEND Lv\.(\d+)$/) > 0],
    ["dn7", (h: string) => numberIn(h, /^MASTER (\d+)ノーツ$/) < 700],
    ["a2021", (h: string) => /^2021\/\d{2}\/\d{2}$/.test(h)],
    ["a0", (h: string) => h === "2020/09/30"],
  ])("%s: 判定に使う値を出す", (key, ok) => {
    const items = open(key);
    expect(items.length).toBe(MUSICS.filter((m) => odaiOf(key).test(m)).length);
    for (const li of items) {
      const hint = li.querySelector(".text-xs")?.textContent ?? "";
      expect(ok(hint), hint).toBe(true);
    }
  });

  it("読みのお題は、曲の読みをそのまま出す", () => {
    const expected = listOdaiSongs(odaiOf("yi"), MUSICS).map((m) => m.pronunciation);
    expect(open("yi").map((li) => li.querySelector(".text-xs")?.textContent)).toEqual(expected);
  });

  it.each(["s1", "kl", "gn", "m3", "va"])("%s: 曲名で判定できる・値を持たないお題は出さない", (key) => {
    for (const li of open(key)) expect(li.querySelector(".text-xs")).toBeNull();
  });
});
