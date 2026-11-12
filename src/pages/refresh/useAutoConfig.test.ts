/**
 * @vitest-environment jsdom
 *
 * オートの設定の「読み込み中」の判定（UX 監査 2026-11-12、PR-5）。
 *
 * ★ useRankingMusics の loading は useState(enabled) の初期値だけで決まる。周回プランでは最初 enabled が false
 *   （休憩にオートが無い）なので loading は false で始まり、オートを付けて読み込みが始まっても true に戻らない。
 *   そのため読み込みの間は「候補なし・エラーなし・読み込み中でない」に見え、赤字の警告と
 *   「休憩に『オート』を付けると候補が出ます」（もう付けているのに）が出ていた。
 *   ランキングのページと共有の useRankingMusics は変えず、こちらで「使うのに、まだ何も届いていない」を読み込み中とみなす。
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoConfig } from "./useAutoConfig";

const musics = vi.hoisted(() => ({
  value: { entries: [] as unknown[], loading: false, error: null as string | null },
}));

vi.mock("../ranking/useRankingMusics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ranking/useRankingMusics")>()),
  useRankingMusics: () => musics.value,
}));

const hook = (enabled: boolean) => renderHook(() => useAutoConfig({ enabled, power: 0, bonus: 0 })).result.current;

describe("読み込み中の判定", () => {
  it("オートを使うのに、まだ何も届いていない（エラーも無い）間は読み込み中", () => {
    musics.value = { entries: [], loading: false, error: null };
    expect(hook(true).loading).toBe(true);
  });

  it("オートを使っていないときは読み込み中ではない（読みにも行かない）", () => {
    musics.value = { entries: [], loading: false, error: null };
    const c = hook(false);
    expect(c.loading).toBe(false);
    expect(c.enabled).toBe(false);
  });

  it("読めなかったときは読み込み中ではない（エラーを出す）", () => {
    musics.value = { entries: [], loading: false, error: "楽曲データの取得に失敗しました" };
    const c = hook(true);
    expect(c.loading).toBe(false);
    expect(c.error).toBe("楽曲データの取得に失敗しました");
  });
});
