/**
 * @vitest-environment jsdom
 *
 * ゲージ系の共通の入力（useGaugeInputs）の「ライブの想定」（2026-11-18、みんなでライブの停止期間）。
 *
 * ★ この hook はリフレッシュゲージ・周回プラン・必要稼働時間の 3 ページで共有している。
 *   想定を選べるのは**リフレッシュゲージだけ**（liveChoice を渡したときだけ）。渡さないページ
 *   （周回プランは inputs.rate を保存する・必要稼働時間は担当外）は、足す前と 1 つも変わらないこと。
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGaugeInputs } from "./useGaugeInputs";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { MULTI_LIVE_SUSPENDED } from "../../lib/liveSuspension";
import { overheadFromRate } from "./lib/sessionPlanner";
import { SOLO_DEFAULT_RATE } from "./lib/liveAssumption";

const ENVY_LEN = 74.8;

describe("想定を選ばないページ（周回プラン・必要稼働時間）は足す前と同じ", () => {
  it("ペース 28・ロスは 28 回/時からの逆算・みんなでライブ", () => {
    const { result } = renderHook(() => useGaugeInputs([]));
    expect(result.current.rate).toBe("28");
    expect(result.current.overhead).toBe(overheadFromRate(28, ENVY_LEN));
    expect(result.current.ratePerHour).toBe(28);
    expect(result.current.live).toBe("multi");
    expect(result.current.liveChoice).toBe(false);
    expect(result.current.defaultRate).toBe(28);
  });

  it("setLive を呼んでも想定は動かない（選べないページ）", () => {
    const { result } = renderHook(() => useGaugeInputs([]));
    act(() => result.current.setLive("solo"));
    expect(result.current.live).toBe("multi");
    expect(result.current.rate).toBe("28");
  });

  it("ペースを入れると、その値で逆算する（呼び出しの setRate も今までどおり）", () => {
    const { result } = renderHook(() => useGaugeInputs([]));
    act(() => result.current.setRate("32"));
    expect(result.current.rate).toBe("32");
    expect(result.current.overhead).toBe(overheadFromRate(32, ENVY_LEN));
  });
});

describe("リフレッシュゲージ（liveChoice）", () => {
  const draw = () => renderHook(() => useGaugeInputs([], { liveChoice: true }));

  it("止まっている間はひとりでライブで開き、ロスは OVERHEAD_SEC.solo", () => {
    const { result } = draw();
    expect(result.current.live).toBe(MULTI_LIVE_SUSPENDED ? "solo" : "multi");
    if (!MULTI_LIVE_SUSPENDED) return;
    expect(result.current.rate).toBe(String(SOLO_DEFAULT_RATE));
    expect(result.current.defaultRate).toBe(SOLO_DEFAULT_RATE);
    expect(result.current.overhead).toBe(OVERHEAD_SEC.solo);
    expect(result.current.ratePerHour).toBe(SOLO_DEFAULT_RATE);
  });

  it("みんなでライブに切り替えると、足す前と同じペース 28・同じロス", () => {
    const { result } = draw();
    act(() => result.current.setLive("multi"));
    expect(result.current.live).toBe("multi");
    expect(result.current.rate).toBe("28");
    expect(result.current.overhead).toBe(overheadFromRate(28, ENVY_LEN));
    expect(result.current.ratePerHour).toBe(28);
  });

  it("ペースは想定ごとに別々に持つ（切り替えても入れた値が消えない）", () => {
    // ★ ひとりでライブ側は既定と違う値を使う（OVERHEAD_SEC.solo を直すと既定のペースも動くので、数字を決め打ちしない）
    const custom = SOLO_DEFAULT_RATE - 3;
    const { result } = draw();
    act(() => result.current.setLive("solo"));
    act(() => result.current.setRate(String(custom)));
    act(() => result.current.setLive("multi"));
    expect(result.current.rate).toBe("28");
    act(() => result.current.setRate("25"));
    act(() => result.current.setLive("solo"));
    expect(result.current.rate).toBe(String(custom));
    expect(result.current.overhead).toBe(overheadFromRate(custom, ENVY_LEN));
    act(() => result.current.setLive("multi"));
    expect(result.current.rate).toBe("25");
  });
});
