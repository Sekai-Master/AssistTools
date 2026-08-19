/**
 * 配信しているカードデータ（public/CardDatas）の読み込み。
 *
 * 3ファイルに分かれているのは更新の都合（scripts/refresh-card-data.mjs が6時間おきに
 * まとめて作る）。読む側では計算モジュールが期待する2つのテーブルに詰め替える。
 * 詰め替えの正解は power.real.test.ts 35–43行と同じ。
 *
 * 作法は useRankingMusics.ts に揃えている:
 *   - BASE_URL 起点の fetch（サブパス配信でも壊れない）
 *   - res.ok を先に見る（SPA フォールバックで index.html が 200 で返ると json() が例外になる）
 *   - AbortController で後片付け
 *   - **外部由来のデータは1件ずつ検証**（配信物とはいえ、生成側の事故を黙って通さない）
 */
import { useEffect, useState } from "react";
import type { BonusTables } from "./lib/eventBonus";
import type { PowerTables } from "./lib/power";
import type { CatalogCard, EventRow } from "./lib/deckInputs";
import type { SkillRow } from "./lib/skill";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const numArr3 = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(isNum);

/**
 * カード1枚の検証。
 * ★ power が3パラメータぶん揃っていないカードは落とす。欠けたまま通すと
 *   そのカードだけ基礎値0で計算され、総合力が数万低いのに画面は正常に見える。
 */
function isCard(v: unknown): v is CatalogCard {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<CatalogCard>;
  if (!isNum(c.id) || !isNum(c.ch) || !isStr(c.rarity) || !isStr(c.attr) || !isStr(c.name)) return false;
  if (!numArr3(c.trained)) return false;
  return (
    Array.isArray(c.power) &&
    c.power.length === 3 &&
    c.power.every((p) => Array.isArray(p) && p.length > 0 && p.every(isNum))
  );
}

function isEvent(v: unknown): v is EventRow {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<EventRow>;
  // powerLimit は無いイベントの方が多いので必須にしない。
  // ただし**入っているのに数値でない**ものは落とす（黙って上限なし扱いにすると
  // 上限帯の人に過大なPtを出し続けることになる）。
  if (e.powerLimit != null && !isNum(e.powerLimit)) return false;
  return isNum(e.id) && isStr(e.name) && isNum(e.startAt) && isNum(e.aggregateAt);
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * 表の各行を検証して、条件を満たす行だけ残す。
 *
 * ★ 「配列であること」だけ見て中身をキャストすると、行に null が1つ混ざっただけで
 *   計算中に TypeError になり、**画面全体が落ちる**（計算は render 中の useMemo）。
 *   自前の CI が作っている配信物とはいえ、生成側の事故を黙って通さない。
 */
function rows<T>(v: unknown, ok: (row: Record<string, unknown>) => boolean): T[] {
  return arr(v).filter((r): r is T => !!r && typeof r === "object" && ok(r as Record<string, unknown>));
}

const power3 = (v: unknown) => numArr3(v);

export interface CardData {
  cards: CatalogCard[];
  events: EventRow[];
  /** スキルの原型（21種）。カードは skillId でここを引く。 */
  skills: SkillRow[];
  bonusTables: BonusTables;
  powerTables: PowerTables;
  /** データの生成時刻(ms)。画面に「いつ時点のデータか」を出すため。 */
  generatedAt: number | null;
}

function build(rawCards: unknown, rawBonuses: unknown, rawPower: unknown): CardData {
  const cardsRoot = (rawCards ?? {}) as Record<string, unknown>;
  const bonuses = (rawBonuses ?? {}) as Record<string, unknown>;
  const power = (rawPower ?? {}) as Record<string, unknown>;

  const cards = arr(cardsRoot.cards).filter(isCard);
  const events = arr(bonuses.events).filter(isEvent);
  // キャラ×ユニットの対応表はボーナスと総合力の両方が使う（同じものを2度作らない）。
  const unitCharacters = rows(bonuses.unitCharacters, (r) => isNum(r.id) && isNum(r.ch) && isStr(r.unit));

  return {
    cards,
    // 新しいイベントほど上（既定の選択と、選び直すときの導線が一致する）。
    events: [...events].sort((a, b) => b.startAt - a.startAt),
    // レベルごとの値が無いスキルは使えない（黙って0%として計算しない）。
    skills: rows<SkillRow>(
      cardsRoot.skills,
      (r) => isNum(r.id) && Array.isArray(r.base) && r.base.length > 0 && r.base.every(isNum)
    ),
    bonusTables: {
      deckBonuses: rows(bonuses.deckBonuses, (r) => isNum(r.eventId) && isNum(r.rate)),
      cardBonuses: rows(
        bonuses.cardBonuses,
        (r) => isNum(r.eventId) && isNum(r.cardId) && isNum(r.rate) && isNum(r.leaderRate)
      ),
      rarityBonuses: rows(
        bonuses.rarityBonuses,
        (r) => isStr(r.rarity) && isNum(r.masterRank) && isNum(r.rate)
      ),
      bonusLimits: rows(bonuses.bonusLimits, (r) => isNum(r.eventId) && isNum(r.memberCountLimit)),
      // ★ ワールドリンクの属性ボーナス。全WL共通の表で eventId を持たない。
      attributeBonuses: rows(bonuses.attributeBonuses, (r) => isNum(r.n) && isNum(r.rate)),
      unitCharacters: unitCharacters as BonusTables["unitCharacters"],
    },
    powerTables: {
      cards,
      masterBonuses: rows(
        power.masterBonuses,
        (r) => isStr(r.rarity) && isNum(r.masterRank) && power3(r.power)
      ),
      episodes: rows(power.episodes, (r) => isNum(r.cardId) && isStr(r.part) && power3(r.power)),
      canvasBonuses: rows(power.canvasBonuses, (r) => isStr(r.rarity) && power3(r.power)),
      characterRanks: rows(
        power.characterRanks,
        (r) => isNum(r.ch) && isNum(r.rank) && power3(r.rate)
      ),
      gates: rows(
        power.gates,
        (r) => isNum(r.id) && isStr(r.unit) && Array.isArray(r.rates) && r.rates.every(isNum)
      ),
      unitCharacters: unitCharacters as PowerTables["unitCharacters"],
    },
    generatedAt: isNum(cardsRoot.generatedAt) ? cardsRoot.generatedAt : null,
  };
}

export function useCardData(): { data: CardData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    const get = async (name: string) => {
      const res = await fetch(`${base}CardDatas/${name}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`${name} の取得に失敗しました (HTTP ${res.status})`);
      return res.json();
    };

    (async () => {
      try {
        const [cards, bonuses, power] = await Promise.all([
          get("cards.json"),
          get("bonuses.json"),
          get("power.json"),
        ]);
        if (controller.signal.aborted) return;
        const built = build(cards, bonuses, power);
        // ここまで来てカードが0件なら、配信データの形が変わったということ。
        // 黙って空の画面を出さず、エラーとして見せる。
        if (built.cards.length === 0) throw new Error("カードデータが空です。データ更新が必要かもしれません。");
        setData(built);
        setError(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "カードデータの読み込みに失敗しました。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  return { data, loading, error };
}

/** テスト用に詰め替えだけ切り出しておく（fetch を経由せず形を確かめられる）。 */
export const buildCardData = build;
