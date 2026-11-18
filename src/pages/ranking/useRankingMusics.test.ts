/**
 * @vitest-environment jsdom
 *
 * 楽曲データの読み込みの「読み込み中」（#246 の検分の指摘）。
 *
 * ★ 前は loading を useState(enabled) の初期値だけで決めていた。最初 enabled が false で使う画面
 *   （周回プランのオート・編成ビルダーの「比べる」とカードを選ぶ画面）では loading が false で始まり、
 *   あとで enabled が true になって読み込みが始まっても true に戻らなかった。読み込みの間は
 *   「候補なし・エラーなし・読み込み中でない」に見え、画面が「候補が無い」ときの文を出していた。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRankingMusics } from "./useRankingMusics";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 応答を手で返せる fetch。 */
function deferredFetch() {
  let reject!: (e: unknown) => void;
  const pending = new Promise<Response>((_, rej) => {
    reject = rej;
  });
  const fetchMock = vi.fn(() => pending);
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, fail: () => reject(new Error("offline")) };
}

describe("useRankingMusics の読み込み中", () => {
  it("最初から使う画面（ランキング）は、届くまで読み込み中", () => {
    deferredFetch();
    const { result } = renderHook(() => useRankingMusics());
    expect(result.current.loading).toBe(true);
  });

  it("使っていない間は読み込み中ではなく、読みにも行かない", () => {
    const { fetchMock } = deferredFetch();
    const { result } = renderHook(() => useRankingMusics(false));
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("あとで使い始めたら、届くまで読み込み中になる（前はここが false のままだった）", async () => {
    const { fetchMock, fail } = deferredFetch();
    const { result, rerender } = renderHook(({ on }) => useRankingMusics(on), { initialProps: { on: false } });
    rerender({ on: true });
    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    // 読めなかったら読み込み中を終え、エラーを出す
    await act(async () => fail());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
  });
});
