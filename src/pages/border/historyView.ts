/**
 * 歴代ボーダー（終値の表）の読み取りと並べ替え。純粋関数。
 *
 * 表は /api/border/finals（Worker の kv `finals`。解析ジョブが終わった回を書き足す。行の作り方は
 * scripts/border/history.ts）。並べ方は Bot の歴代ボーダーの画像（sekaimaster-bot の src/border/historyCard.ts）と
 * 同じにする。画像とページで順位が食い違わないように。
 */

export const HISTORY_RANKS = ["50", "100", "1000"] as const;
export type HistoryRank = (typeof HISTORY_RANKS)[number];

/** 並べ方: 終値の大きい順・日速（終値÷時間×24）の大きい順・同じ長さの回だけで終値の大きい順 */
export type HistoryMode = "final" | "daily" | "same";

export interface HistoryEvent {
  id: number;
  name: string;
  /** ロゴの素材名（サイトの /CardDatas/logo/<asset>.webp） */
  asset: string | null;
  type: string;
  /** 種別の表示名（マラソン・チアフル・Memories） */
  typeLabel: string;
  unit: string;
  /** 開始日（YYYY-MM-DD・日本時間） */
  start: string;
  days: number;
  hours: number;
  /** 順位（"50" など）→ 終値 */
  finals: Record<string, number>;
}

/** 表を読む。形の合わない行は捨てる */
export function parseFinals(raw: unknown): HistoryEvent[] {
  const list = (raw as { events?: unknown } | null)?.events;
  if (!Array.isArray(list)) return [];
  const out: HistoryEvent[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    if (
      typeof e.id !== "number" ||
      typeof e.name !== "string" ||
      typeof e.type !== "string" ||
      typeof e.typeLabel !== "string" ||
      typeof e.unit !== "string" ||
      typeof e.start !== "string" ||
      typeof e.days !== "number" ||
      typeof e.hours !== "number" ||
      !(e.hours > 0) ||
      !e.finals ||
      typeof e.finals !== "object" ||
      Array.isArray(e.finals)
    ) {
      continue;
    }
    const finals: Record<string, number> = {};
    for (const [k, v] of Object.entries(e.finals as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) finals[k] = v;
    }
    out.push({
      id: e.id,
      name: e.name,
      asset: typeof e.asset === "string" && /^[a-z0-9_]+$/.test(e.asset) ? e.asset : null,
      type: e.type,
      typeLabel: e.typeLabel,
      unit: e.unit,
      start: e.start,
      days: e.days,
      hours: e.hours,
      finals,
    });
  }
  return out;
}

export const perDay = (e: HistoryEvent, rank: HistoryRank): number => (e.finals[rank] / e.hours) * 24;

export interface HistoryRow {
  /** 並べた中での順位（1 から） */
  pos: number;
  event: HistoryEvent;
  final: number;
  perDay: number;
}

/** その順位の終値がある回を、並べ方に沿って大きい順に。same は hours の回だけ */
export function rankRows(all: HistoryEvent[], rank: HistoryRank, mode: HistoryMode, hours?: number): HistoryRow[] {
  const has = all.filter((e) => typeof e.finals[rank] === "number" && (mode !== "same" || e.hours === hours));
  const key = (e: HistoryEvent) => (mode === "daily" ? perDay(e, rank) : e.finals[rank]);
  return [...has]
    // 同じ値なら古い回が先（Bot の画像は id 順の表を安定ソートしているので、それに合わせる）
    .sort((a, b) => key(b) - key(a) || a.id - b.id)
    .map((event, i) => ({ pos: i + 1, event, final: event.finals[rank], perDay: perDay(event, rank) }));
}

/** 長さ（時間）ごとの回数。多い順（同じ数なら長い順） */
export function hourGroups(all: HistoryEvent[]): { hours: number; count: number }[] {
  const m = new Map<number, number>();
  for (const e of all) m.set(e.hours, (m.get(e.hours) ?? 0) + 1);
  return [...m].map(([hours, count]) => ({ hours, count })).sort((a, b) => b.count - a.count || b.hours - a.hours);
}

export interface Place {
  pos: number;
  of: number;
}

export interface Standing {
  rank: HistoryRank;
  final: number;
  total: Place;
  same: Place;
  daily: Place;
  perDay: number;
}

function placeOf(rows: HistoryRow[], id: number): Place {
  return { pos: rows.find((r) => r.event.id === id)?.pos ?? 0, of: rows.length };
}

/** その回の位置づけ（3つの並べ方での順位）。その順位の終値が無ければ、その順位は出さない */
export function standings(all: HistoryEvent[], target: HistoryEvent): Standing[] {
  return HISTORY_RANKS.filter((r) => typeof target.finals[r] === "number").map((rank) => ({
    rank,
    final: target.finals[rank],
    total: placeOf(rankRows(all, rank, "final"), target.id),
    same: placeOf(rankRows(all, rank, "same", target.hours), target.id),
    daily: placeOf(rankRows(all, rank, "daily"), target.id),
    perDay: perDay(target, rank),
  }));
}

/** URL の ?event= を読む。無い・表に無い回なら最新の回 */
export function pickEvent(all: HistoryEvent[], param: string | null): HistoryEvent | null {
  const id = param != null && /^\d+$/.test(param) ? Number(param) : null;
  const hit = id != null ? all.find((e) => e.id === id) : undefined;
  if (hit) return hit;
  return all.reduce<HistoryEvent | null>((best, e) => (best == null || e.id > best.id ? e : best), null);
}
