/**
 * プレイヤー固有の育成状況（エリアアイテム・キャラランク・ゲート・家具・称号）の保存と、
 * 計算モジュール（power.ts）が受け取る形への変換。
 *
 * ★ **保存する形は「ゲーム画面から写した生の値」に寄せる。** 計算に都合のいい形
 *   （AreaRate[] や fixtureRates）で保存すると、あとから式が変わったときに
 *   保存済みデータが意味を失う。変換は毎回 toPlayerState() でやる。
 *
 * ★ 家具は**個数**で持つ。ぬいぐるみ/オブジェのサイズごとの率（S=0.1% / M=0.3% / L=0.6%）は
 *   マスタ由来の定数（FIXTURE_RATE_BY_SIZE）なので、率で保存すると
 *   「S を何個置いたか」が復元できなくなる。
 */
import {
  FIXTURE_RATE_BY_SIZE,
  areaRatesFromEffects,
  type AreaEffects,
  type PlayerState,
} from "./power";

/** キャラごとの家具の個数（ボーナスを持つのは「ぬいぐるみ」と「ダイヤモンドオブジェ」だけ）。 */
export interface FixtureCounts {
  S: number;
  M: number;
  L: number;
}

export interface PlayerSettings {
  /** ゲーム内「エリアアイテム効果一覧」の数字をそのまま。 */
  areaEffects: AreaEffects;
  /** キャラ → キャラクターランク。CR50 で上限5%。 */
  characterRanks: Record<number, number>;
  /** ユニット内部名 → マイセカイのゲートのレベル（1〜40。0 は未設置）。 */
  gateLevels: Record<string, number>;
  /** キャラ → 置いた家具の個数。 */
  fixtures: Record<number, FixtureCounts>;
  /** 称号ボーナス。マスタから導出できないので手入力（Nori の環境では 210）。 */
  honorBonus: number;
  /**
   * ゲーム内に表示されている実際の総合力。
   * ★ 計算値との差を常に画面に出すための参照値。家具などを進めて誤差が開いたら
   *   「入力が古い」ことに気付ける（docs/deck-builder.md「次の一手」2）。
   */
  actualPower?: number;
}

export const EMPTY_PLAYER: PlayerSettings = {
  areaEffects: { units: {}, attrs: {}, chars: {} },
  characterRanks: {},
  gateLevels: {},
  fixtures: {},
  honorBonus: 0,
};

const KEY = "sekaimaster:deck:player:v1";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 率・レベルの表（外部由来）。数値でない値・負の値は捨てる。 */
function numRecord(v: unknown, opts: { numericKey: boolean; max: number }): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (opts.numericKey && !Number.isInteger(Number(k))) continue;
    if (!isNum(val) || val < 0 || val > opts.max) continue;
    out[k] = val;
  }
  return out;
}

function toNumberKeys(r: Record<string, number>): Record<number, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v]));
}

export function parsePlayerSettings(raw: unknown): PlayerSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_PLAYER;
  const p = raw as Partial<PlayerSettings>;
  const area = (p.areaEffects ?? {}) as AreaEffects;

  const fixtures: Record<number, FixtureCounts> = {};
  if (p.fixtures && typeof p.fixtures === "object" && !Array.isArray(p.fixtures)) {
    for (const [k, v] of Object.entries(p.fixtures as Record<string, unknown>)) {
      const ch = Number(k);
      if (!Number.isInteger(ch) || !v || typeof v !== "object") continue;
      const c = v as Partial<FixtureCounts>;
      const n = (x: unknown) => (isNum(x) && x >= 0 && x <= 999 ? Math.trunc(x) : 0);
      fixtures[ch] = { S: n(c.S), M: n(c.M), L: n(c.L) };
    }
  }

  return {
    areaEffects: {
      // 率は % なので上限を 100 に置く（ありえない値は捨てる）。
      units: numRecord(area.units, { numericKey: false, max: 100 }),
      attrs: numRecord(area.attrs, { numericKey: false, max: 100 }),
      chars: toNumberKeys(numRecord(area.chars, { numericKey: true, max: 100 })),
    },
    characterRanks: toNumberKeys(numRecord(p.characterRanks, { numericKey: true, max: 200 })),
    gateLevels: numRecord(p.gateLevels, { numericKey: false, max: 40 }),
    fixtures,
    honorBonus: isNum(p.honorBonus) && p.honorBonus >= 0 ? p.honorBonus : 0,
    ...(isNum(p.actualPower) && p.actualPower > 0 ? { actualPower: p.actualPower } : {}),
  };
}

export function readPlayerSettings(): PlayerSettings {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    return parsePlayerSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY_PLAYER;
  }
}

export function writePlayerSettings(settings: PlayerSettings): void {
  try {
    localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 容量超過・ストレージ不可は無視（保存は best-effort）。
  }
}

/** 家具の個数 → キャラごとの率(%)。S=0.1 / M=0.3 / L=0.6（マスタの 1/3/6 は 0.1% 単位）。 */
export function fixtureRatesOf(fixtures: Record<number, FixtureCounts>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [ch, c] of Object.entries(fixtures)) {
    const rate =
      c.S * FIXTURE_RATE_BY_SIZE.S + c.M * FIXTURE_RATE_BY_SIZE.M + c.L * FIXTURE_RATE_BY_SIZE.L;
    // ★ 浮動小数の誤差で 0.30000000000000004 のような値にしない。
    //   power.ts 側は float32 で計算するので、ここでの微差が floor を1つ動かしうる。
    if (rate > 0) out[Number(ch)] = Math.round(rate * 1000) / 1000;
  }
  return out;
}

/** 保存している設定を power.ts の PlayerState へ。**式はここで足さない**（変換だけ）。 */
export function toPlayerState(settings: PlayerSettings): PlayerState {
  return {
    areaRates: areaRatesFromEffects(settings.areaEffects),
    characterRanks: settings.characterRanks,
    gateLevels: settings.gateLevels,
    fixtureRates: fixtureRatesOf(settings.fixtures),
    honorBonus: settings.honorBonus,
  };
}

export const PLAYER_STORAGE_KEY = KEY;
