import { describe, expect, it } from "vitest";
import transformedMusics from "../../../../public/MusicDatas/transformedMusics.json";

/**
 * 楽曲データ（transformedMusics.json）のメドレー除外の回帰（R6 §5）。
 *
 * scripts/refresh-music-data.js が limitedTimeMusics.json の
 * 「collaborationModeId を持たないエントリ」を published=false に焼き込む。
 * ランタイム（useAnalyzerMusics）は published===false を continue で弾くので、
 * ここでは静的JSONの published フラグだけを検証する（判定ロジックの最終成果物）。
 */

interface RawMusic {
  id: string;
  title: string;
  event_rate: number | null;
  published: boolean;
}

// public の静的JSONをそのまま読む（ランタイム useAnalyzerMusics と同じ最終成果物）。
const MUSICS = transformedMusics as unknown as RawMusic[];

function byId(id: string): RawMusic {
  const m = MUSICS.find((x) => x.id === id);
  if (!m) throw new Error(`music ${id} not found in snapshot`);
  return m;
}

describe("transformedMusics — メドレー等の除外", () => {
  it("イベント限定メドレー 674/675/676 は published=false（調整候補から外れる）", () => {
    for (const id of ["674", "675", "676"]) {
      expect(byId(id).published).toBe(false);
    }
  });

  it("スターダストメドレー(380) は published のまま（タイトル誤爆防止）", () => {
    // 380 は limitedTimeMusics に無い常設曲。タイトルの「メドレー」で弾いてはいけない。
    expect(byId("380").published).toBe(true);
  });

  it("コラボ曲 707/708/709 は published のまま（collaborationModeId ありは常設扱い）", () => {
    for (const id of ["707", "708", "709"]) {
      expect(byId(id).published).toBe(true);
    }
  });
});

describe("transformedMusics — 基礎点130の母集合ガード", () => {
  it("除外後も published 曲に event_rate=130 が残る（distinctBasePoints の母集合不変）", () => {
    // メルト(047)・初音天地開闢神話(186) が 130 で常設なので最大基礎点は動かない。
    const rate130 = MUSICS.filter((m) => m.published && m.event_rate === 130).map((m) => m.id);
    expect(rate130).toContain("047");
    expect(rate130.length).toBeGreaterThan(0);
    // 除外した3メドレーは 130 集合から消えている
    expect(rate130).not.toContain("674");
  });
});
