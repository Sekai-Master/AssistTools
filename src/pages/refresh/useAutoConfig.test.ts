/**
 * @vitest-environment jsdom
 *
 * オートの設定が、楽曲データの読み込みの状態（読み込み中・読めなかった）と、オートを使っているか（enabled）を
 * そのまま画面に渡すこと（UX 監査 2026-11-12、PR-5）。
 *
 * ★ 読み込み中の判定そのものは useRankingMusics の側（#251）で直し、そちらのテストが縛っている。
 *   ここでは本物の hook を通し、fetch だけを作り物にする。前の版はこの穴を模したモック（使うのに loading が false）で
 *   useAutoConfig 側の回避を縛っていたが、回避を外したので、本物の動きに合わせて書き直した。
 * ★ このファイルは #251 が入った上で緑になる（「あとで使い始めたら読み込み中」は hook の直しが要る）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAutoConfig } from "./useAutoConfig";

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

const useConfig = (enabled: boolean) => useAutoConfig({ enabled, power: 0, bonus: 0 });

describe("読み込みの状態とオートの有無を渡す", () => {
  it("オートを使っていないときは読み込み中ではなく、読みにも行かない。enabled は false", () => {
    const { fetchMock } = deferredFetch();
    const { result } = renderHook(() => useConfig(false));
    expect(result.current.loading).toBe(false);
    expect(result.current.enabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("休憩にオートを付けた（あとで使い始めた）ら、届くまで読み込み中。読めなかったらエラーを渡す", async () => {
    const { fetchMock, fail } = deferredFetch();
    const { result, rerender } = renderHook(({ on }) => useConfig(on), { initialProps: { on: false } });
    rerender({ on: true });
    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.enabled).toBe(true);
    expect(result.current.loading).toBe(true);
    expect(result.current.options).toEqual([]);
    await act(async () => fail());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
  });
});
