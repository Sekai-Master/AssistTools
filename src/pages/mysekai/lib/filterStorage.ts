/**
 * 絞り込み条件の保存。
 *
 * ★ 保存キーを新設したので src/pages/settings/lib/storedItems.ts の STORED_ITEMS にも
 *   登録してある（設定画面の一覧・削除・書き出しと、プライバシーポリシーの表がそこから出る）。
 *
 * localStorage は旧バージョンの自分や手書きに汚染されうるので、
 * バージョンと型を見てから使う（EfficiencyRanking の loadStored と同じ流儀）。
 */
import {
  DEFAULT_FILTER,
  type FilterState,
  type OwnedFilter,
  type PartyFilter,
  type SortKey,
} from "./filter";
import type { ReactionKind } from "./types";

export const FILTER_STORAGE_KEY = "sekaimaster:mysekai:filters:v1";
const VERSION = 1;

const KINDS: ReactionKind[] = ["talk", "like"];
const SORTS: SortKey[] = ["talks", "name", "cost", "size"];
const PARTIES: PartyFilter[] = ["any", "solo", "group"];
const OWNEDS: OwnedFilter[] = ["any", "owned", "unowned", "wish"];

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

export function loadFilter(): FilterState {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTER;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_FILTER;
    const s = parsed as Record<string, unknown>;
    if (s.v !== VERSION) return DEFAULT_FILTER;

    const kinds = Array.isArray(s.kinds)
      ? KINDS.filter((k) => (s.kinds as unknown[]).includes(k))
      : DEFAULT_FILTER.kinds;
    const sort = SORTS.includes(s.sort as SortKey) ? (s.sort as SortKey) : DEFAULT_FILTER.sort;

    return {
      charId: numOrNull(s.charId),
      kinds,
      reactiveOnly: bool(s.reactiveOnly, DEFAULT_FILTER.reactiveOnly),
      actionOnly: bool(s.actionOnly, DEFAULT_FILTER.actionOnly),
      sketchableOnly: bool(s.sketchableOnly, DEFAULT_FILTER.sketchableOnly),
      owned: OWNEDS.includes(s.owned as OwnedFilter)
        ? (s.owned as OwnedFilter)
        : DEFAULT_FILTER.owned,
      party: PARTIES.includes(s.party as PartyFilter)
        ? (s.party as PartyFilter)
        : DEFAULT_FILTER.party,
      mainGenreId: numOrNull(s.mainGenreId),
      // 検索語は保存しない（前回の入力が残っていると「0件」の理由が分からなくなる）。
      query: "",
      sort,
      desc: bool(s.desc, DEFAULT_FILTER.desc),
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

export function saveFilter(state: FilterState): void {
  try {
    const { query: _query, ...rest } = state;
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ v: VERSION, ...rest }));
  } catch {
    // 保存できなくても操作は続けられる（プライベートモード等）。
  }
}
