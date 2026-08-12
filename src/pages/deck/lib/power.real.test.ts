/**
 * 配信データ＋実機の数字で総合力を検算する。
 *
 * power.test.ts は式そのもの（丸めの単位・float32）を固定するための合成テスト。
 * こちらは**実際に配信している JSON と、Nori が実機で読んだ数字**を突き合わせる。
 * カードの基礎値が変わることは無いので、データ更新で壊れることは無い。
 *
 * ★ エリアアイテムはプレイヤーの効果一覧を入れないと出せないので、
 *   measurements.json に areaRates が無いあいだは**エリアを除いた成分だけ**照合する。
 *   その代わり「実測の合計 − 実測のエリア」を必ず突き合わせて、逃げ場を残さない。
 */
// アプリ側の tsconfig は types を vite/client に絞っている（ブラウザのコードから
// うっかり node の API を触らないため）。このテストだけ node の型を明示的に足す。
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  areaRatesFromEffects,
  deckPower,
  type AreaEffects,
  type DeckPowerCard,
  type PlayerState,
  type PowerTables,
} from "./power";
import measurements from "./measurements.json";

const DATA = path.join(process.cwd(), "public/CardDatas");
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));

const cards = read("cards.json");
const power = read("power.json");
const bonuses = read("bonuses.json");

const tables: PowerTables = {
  cards: cards.cards,
  masterBonuses: power.masterBonuses,
  episodes: power.episodes,
  canvasBonuses: power.canvasBonuses,
  characterRanks: power.characterRanks,
  gates: power.gates,
  unitCharacters: bonuses.unitCharacters,
};

/** JSON の Record<string, number> を数値キーで引ける形に直す。 */
const numKeys = (o: Record<string, number> | undefined) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [Number(k), v]));

const effects = measurements.player.areaEffects as AreaEffects | undefined;
const player: PlayerState = {
  areaRates: effects ? areaRatesFromEffects(effects) : undefined,
  characterRanks: numKeys(measurements.player.characterRanks),
  gateLevels: measurements.player.gateLevels,
  fixtureRates: numKeys(measurements.player.fixtureRates),
  honorBonus: measurements.player.honorBonus,
};

describe("配信データの前提", () => {
  it("総合力に要る表が全部入っている", () => {
    expect(tables.cards.length).toBeGreaterThan(1000);
    expect(tables.gates).toHaveLength(5);
    expect(tables.gates.every((g) => g.rates.length === 40)).toBe(true);
    // ★ 一度落とした欄。キャラ別のエリア効果26種がここに乗る。
    expect(power.areaItems.some((a: { ch?: number }) => a.ch != null)).toBe(true);
  });

  // ★ 0.1 に丸め直すと float32 の計算が変わって実機と1ずれる。
  it("ゲートの率が生の float32 値のまま入っている", () => {
    expect(tables.gates[0].rates[0]).toBe(0.10000000149011612);
  });

  // ★ areaRatesFromEffects() が「全一致なら2倍」と決め打ちしている根拠。
  //   ここが崩れたら、効果一覧の数字だけからは全一致ぶんを出せなくなる。
  it("ユニット・タイプのエリアアイテムは全一致で必ず2倍、キャラのアイテムは増えない", () => {
    type Row = { unit?: string; attr?: string; ch?: number; rate: number[]; allMatch: number[] };
    const rows: Row[] = power.areaItems;
    const 対象あり = (v?: string) => !!v && v !== "any";
    const ユニットかタイプ = rows.filter((a) => 対象あり(a.unit) || 対象あり(a.attr));
    const キャラ = rows.filter((a) => a.ch != null);
    expect(ユニットかタイプ.length).toBeGreaterThan(0);
    expect(キャラ.length).toBeGreaterThan(0);
    expect(ユニットかタイプ.filter((a) => a.rate.some((v, i) => a.allMatch[i] !== v * 2))).toEqual([]);
    expect(キャラ.filter((a) => a.rate.some((v, i) => a.allMatch[i] !== v))).toEqual([]);
  });
});

/** 日付ごとのプレイヤー像。育成は進むので、実測の時点ごとに切り替える。 */
type Snapshot = {
  areaEffects?: AreaEffects;
  characterRanks?: Record<string, number>;
  gateLevels?: Record<string, number>;
  fixtureRates?: Record<string, number>;
  honorBonus?: number;
};
const players = (measurements as unknown as { players?: Record<string, Snapshot> }).players ?? {};

function build(s: Snapshot): PlayerState {
  return {
    areaRates: s.areaEffects ? areaRatesFromEffects(s.areaEffects) : undefined,
    characterRanks: numKeys(s.characterRanks),
    gateLevels: s.gateLevels,
    fixtureRates: numKeys(s.fixtureRates),
    honorBonus: s.honorBonus,
  };
}

describe.each(measurements.cases)("実測 $label", (c) => {
  const deck = c.deck as DeckPowerCard[];
  const ref = (c as { playerRef?: string }).playerRef;
  // 育成状況が変わった時点の実測は、その差分だけをケース側に書く（家具を作った等）。
  const 差分 = (c as { player?: { fixtureRates?: Record<string, number> } }).player;
  const 使うプレイヤー = ref
    ? build(players[ref])
    : 差分
      ? { ...player, fixtureRates: numKeys(差分.fixtureRates) }
      : player;
  const r = deckPower(deck, 使うプレイヤー, tables);
  // ★ 実機で読んだ欄だけを照合する。書いていない欄は「測っていない」であって
  //   「0 だった」ではない。推測値を実測のふりで置くと、次に見た人が信じてしまう。
  const 実測 = c.expected as Partial<Record<
    "total" | "performance" | "areaItem" | "characterRank" | "gate" | "fixture" | "honor",
    number
  >>;
  const 測った = (k: keyof typeof 実測) => 実測[k] != null;

  it("計算できなかったものが無い", () => {
    expect(r.missing).toEqual([]);
  });

  it.runIf(測った("performance"))(`パフォーマンスが ${実測.performance}`, () => {
    expect(r.performance).toBe(実測.performance);
  });

  it.runIf(測った("characterRank"))(`キャラクターランクが ${実測.characterRank}`, () => {
    expect(r.characterRank).toBe(実測.characterRank);
  });

  it.runIf(測った("gate"))(`ゲートが ${実測.gate}`, () => {
    expect(r.gate).toBe(実測.gate);
  });

  it.runIf(測った("fixture") && 測った("honor"))(
    `家具が ${実測.fixture}・称号が ${実測.honor}`,
    () => {
      expect(r.fixture).toBe(実測.fixture);
      expect(r.honor).toBe(実測.honor);
    }
  );

  // エリアを入れていないうちは、エリアを除いた合計で突き合わせる。
  const エリア入力済み = !!使うプレイヤー.areaRates?.length;
  it(
    エリア入力済み ? `合計が ${実測.total}` : `エリアを除いた合計が ${(実測.total ?? 0) - (実測.areaItem ?? 0)}`,
    () => {
      if (エリア入力済み) {
        if (測った("areaItem")) expect(r.areaItem).toBe(実測.areaItem);
        expect(r.total).toBe(実測.total);
      } else {
        expect(r.areaItem).toBe(0);
        expect(r.total).toBe((実測.total ?? 0) - (実測.areaItem ?? 0));
      }
    }
  );
});
