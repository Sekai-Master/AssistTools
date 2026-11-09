/**
 * @vitest-environment jsdom
 *
 * 共通の曲の検索（ビンゴ以外の 12 か所が使う）。検索の処理を関数に切り出したあとも、見え方と動きが変わらないこと。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SongSearchModal } from "./SongSearchModal";

afterEach(cleanup);

const SONGS = Array.from({ length: 100 }, (_, i) => ({
  id: String(i + 1).padStart(3, "0"),
  title: i === 5 ? "ロキ" : `曲${i + 1}`,
  jacketLink: `jacket_s_${i + 1}.webp`,
  pronunciation: i === 5 ? "ろき" : undefined,
  artistName: i === 5 ? "みきとP" : "作者",
}));

const rows = () => within(screen.getByRole("dialog")).getAllByRole("button").filter((b) => b.querySelector("img"));

describe("SongSearchModal", () => {
  it("検索していないときは先頭の 80 曲だけを出し、入力欄にフォーカスがある", () => {
    render(<SongSearchModal musics={SONGS} aliases={[]} jacketBase="/j/" onSelect={() => {}} onClose={() => {}} />);
    expect(rows()).toHaveLength(80);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
    expect(screen.getByRole("heading", { name: "楽曲を選択" })).toBeTruthy();
  });

  it("曲名・読み・作者・別名で絞り、押した曲を返す", () => {
    const onSelect = vi.fn();
    render(
      <SongSearchModal
        musics={SONGS}
        aliases={[{ alias: "LOKI", songIds: ["006"] }]}
        jacketBase="/j/"
        onSelect={onSelect}
        onClose={() => {}}
      />
    );
    for (const q of ["ロキ", "ろき", "みきと", "loki"]) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: q } });
      expect(rows().map((b) => b.textContent)).toEqual(["ロキみきとP"]);
    }
    fireEvent.click(rows()[0]);
    expect(onSelect).toHaveBeenCalledWith(SONGS[5]);
  });

  it("見つからなければそう出す", () => {
    render(<SongSearchModal musics={SONGS} aliases={[]} jacketBase="/j/" onSelect={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "存在しない" } });
    expect(screen.getByText("見つかりませんでした")).toBeTruthy();
  });
});
