/**
 * ひとりでライブのロスの出どころ（2026-11-18、Nori 決定）。
 *
 * ★ 効率曲ランキングの「ひとりで周回」の既定（DEFAULT_OVERHEAD_SEC.solo）と、
 *   編成ビルダー・楽曲比較のソロ（OVERHEAD_BY_LIVE.solo）は、どちらも src/lib/overhead.ts の
 *   OVERHEAD_SEC.solo を読む。チャレンジライブ（OVERHEAD_SEC.challenge）とは別の値。
 * ★ 仮の値のころは solo も challenge も 33 秒で同じだったので、値を比べるだけではどちらを読んでいるか
 *   見分けられない。overhead.ts を差し替えて solo だけ別の数字にし、追随するかを見る。
 *   （Nori が測って solo だけ直したとき、1 か所の修正でサイト全体のソロのロスが変わること）
 */
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OVERHEAD_SEC, OVERHEAD_BY_LIVE } from "./efficiency";

// vi.mock は import より先に効く（巻き上げられる）。solo だけ challenge と違う数字にする。
vi.mock("../../../lib/overhead", () => ({
  OVERHEAD_SEC: { multi: 54, auto: 42.6, challenge: 33, solo: 47 },
  MULTI_OVERHEAD_THEORETICAL: 38,
}));

describe("ひとりでライブのロスは OVERHEAD_SEC.solo を読む", () => {
  it("効率曲ランキングの「ひとりで周回」の既定が OVERHEAD_SEC.solo に追随する", () => {
    expect(DEFAULT_OVERHEAD_SEC.solo).toBe(47);
  });

  it("編成ビルダー・楽曲比較のソロも OVERHEAD_SEC.solo に追随する（サイトの中でソロのロスを 1 つの数字にする）", () => {
    expect(OVERHEAD_BY_LIVE.solo).toBe(47);
  });

  it("ほかのモードの既定は動かない（チャレライは challenge のまま）", () => {
    expect(DEFAULT_OVERHEAD_SEC.manual).toBe(54);
    expect(DEFAULT_OVERHEAD_SEC.auto).toBe(42.6);
    expect(DEFAULT_OVERHEAD_SEC.challenge).toBe(33);
    expect(OVERHEAD_BY_LIVE.multi).toBe(54);
    expect(OVERHEAD_BY_LIVE.auto).toBe(42.6);
  });
});
