/**
 * @vitest-environment jsdom
 *
 * お題の小窓: 判定しにくいお題は、判定に使う値（読み・追加された日・レベル・ノーツ数）を曲名の下に出す。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { parseMusics } from "./useBingoMusics";
import { decodeOdaiSeed, groupOdaiSongs, listOdaiSongs } from "./odaiLogic";
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

describe("コラボのお題の小窓（コラボごとに区切る）", () => {
  const collab = decodeOdaiSeed(`OD1:${["oc", ...filler.slice(0, 11), "F", ...KEYS].join(".")}`, MUSICS)[0];
  const odai = collab !== "FREE" ? collab.odai : null;
  const renderSheet = () =>
    render(<OdaiSheet odai={odai!} cleared={false} musics={MUSICS} jacketBase="/j/" onSetCleared={() => {}} onClose={() => {}} />);
  const sections = () => within(screen.getByRole("dialog")).getAllByRole("region");

  it("コラボごとの見出し（名前と曲数）の下に曲が並び、曲名の下にコラボの名前は出さない", () => {
    renderSheet();
    const groups = groupOdaiSongs(odai!, MUSICS);
    const shown = sections();
    expect(shown.map((s) => within(s).getByRole("heading").textContent)).toEqual(groups.map((g) => `${g.label}${g.total}曲`));
    shown.forEach((s, i) => {
      expect(within(s).getAllByRole("listitem").map((li) => li.textContent)).toEqual(groups[i].songs.map((m) => m.title));
    });
    // 一覧の曲の数は、お題に当てはまる曲の数
    expect(within(screen.getByRole("dialog")).getAllByRole("listitem")).toHaveLength(listOdaiSongs(odai!, MUSICS).length);
  });

  it("絞り込むと、当てはまる曲のあるコラボだけが残る（見出しの曲数は変わらない）", () => {
    renderSheet();
    const groups = groupOdaiSongs(odai!, MUSICS);
    // 曲の多いコラボの 1 曲で絞る
    const target = groups[0];
    expect(target.total).toBeGreaterThanOrEqual(2);
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("searchbox"), { target: { value: target.songs[0].title } });
    const shown = sections();
    expect(shown.length).toBeLessThan(groups.length);
    const heading = shown.map((s) => within(s).getByRole("heading").textContent);
    expect(heading).toContain(`${target.label}${target.total}曲`);
  });
});
