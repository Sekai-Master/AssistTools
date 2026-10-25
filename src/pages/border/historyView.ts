/**
 * 歴代ボーダー（終値の表）の読み取りと並べ替え。純粋関数。
 *
 * 表は /api/border/finals（Worker の kv `finals`。解析ジョブが終わった回を書き足す。行の作り方は
 * scripts/border/history.ts）。並べ方は Bot の歴代ボーダーの画像（sekaimaster-bot の src/border/historyCard.ts）と
 * 同じにする。画像とページで順位が食い違わないように（画像はワールドリンクを除いた 50・100・1000位）。
 */

/** 順位。200・500・2000位は 87〜123回の一部で記録が無い（missingOf で明記する） */
export const HISTORY_RANKS = ["50", "100", "200", "500", "1000", "2000"] as const;
export type HistoryRank = (typeof HISTORY_RANKS)[number];

/** 種別。表の type の値と、出し入れのボタンの名前 */
export const HISTORY_TYPES = [
  { value: "marathon", label: "マラソン" },
  { value: "cheerful_carnival", label: "チアフル" },
  { value: "memories", label: "Memories" },
  { value: "world_bloom", label: "ワールドリンク" },
] as const;
/** 最初に入れておく種別。ワールドリンクは外しておく（Bot の画像と同じ数え方） */
export const DEFAULT_TYPES: readonly string[] = ["marathon", "cheerful_carnival", "memories"];

/** 並べ方: 終値の大きい順・日速（終値÷時間×24）の大きい順・同じ長さの回だけで終値の大きい順 */
export type HistoryMode = "final" | "daily" | "same";

export interface HistoryEvent {
  id: number;
  name: string;
  /** ロゴの素材名（サイトの /CardDatas/logo/<asset>.webp） */
  asset: string | null;
  type: string;
  /** 種別の表示名（マラソン・チアフル・Memories・ワールドリンク） */
  typeLabel: string;
  unit: string;
  /** 開始日（YYYY-MM-DD・日本時間） */
  start: string;
  days: number;
  hours: number;
  /** 順位（"50" など）→ 終値。記録の無い順位は入っていない */
  finals: Record<string, number>;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 表を読む。形の合わない行は捨てる */
export function parseFinals(raw: unknown): HistoryEvent[] {
  const list = (raw as { events?: unknown } | null)?.events;
  if (!Array.isArray(list)) return [];
  const out: HistoryEvent[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    if (
      !finite(e.id) ||
      typeof e.name !== "string" ||
      e.name === "" ||
      typeof e.type !== "string" ||
      typeof e.typeLabel !== "string" ||
      typeof e.unit !== "string" ||
      typeof e.start !== "string" ||
      !finite(e.days) ||
      !(e.days > 0) ||
      !finite(e.hours) ||
      !(e.hours > 0) ||
      !e.finals ||
      typeof e.finals !== "object" ||
      Array.isArray(e.finals)
    ) {
      continue;
    }
    const finals: Record<string, number> = {};
    for (const [k, v] of Object.entries(e.finals as Record<string, unknown>)) {
      if (finite(v) && v > 0) finals[k] = v;
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

/**
 * 比べる回の集まり。選んだ種別の回に、選んでいる回を必ず加える
 *（「マラソンだけと比べたら何位か」を見られるように。選んだ回の種別を外しても位置づけは消さない）
 */
export function poolOf(all: HistoryEvent[], types: readonly string[], target: HistoryEvent | null): HistoryEvent[] {
  return all.filter((e) => types.includes(e.type) || e.id === target?.id);
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
export function rankRows(pool: HistoryEvent[], rank: HistoryRank, mode: HistoryMode, hours?: number): HistoryRow[] {
  const has = pool.filter((e) => finite(e.finals[rank]) && (mode !== "same" || e.hours === hours));
  const key = (e: HistoryEvent) => (mode === "daily" ? perDay(e, rank) : e.finals[rank]);
  return [...has]
    // 同じ値なら古い回が先（Bot の画像も id 順で比べる）
    .sort((a, b) => key(b) - key(a) || a.id - b.id)
    .map((event, i) => ({ pos: i + 1, event, final: event.finals[rank], perDay: perDay(event, rank) }));
}

/** その順位の記録が無い回（古い順）。same は hours の回だけ */
export function missingOf(pool: HistoryEvent[], rank: HistoryRank, mode: HistoryMode, hours?: number): HistoryEvent[] {
  return pool.filter((e) => !finite(e.finals[rank]) && (mode !== "same" || e.hours === hours)).sort((a, b) => a.id - b.id);
}

/** 長さ（時間）ごとの回数。多い順（同じ数なら長い順） */
export function hourGroups(pool: HistoryEvent[]): { hours: number; count: number }[] {
  const m = new Map<number, number>();
  for (const e of pool) m.set(e.hours, (m.get(e.hours) ?? 0) + 1);
  return [...m].map(([hours, count]) => ({ hours, count })).sort((a, b) => b.count - a.count || b.hours - a.hours);
}

export interface Place {
  pos: number;
  of: number;
}

export interface Standing {
  rank: HistoryRank;
  /** その回のその順位の記録が無ければ null（位置づけは出さない） */
  final: number | null;
  total: Place;
  same: Place;
  daily: Place;
  perDay: number | null;
}

function placeOf(rows: HistoryRow[], id: number): Place {
  return { pos: rows.find((r) => r.event.id === id)?.pos ?? 0, of: rows.length };
}

/** その回の位置づけ（3つの並べ方での順位）。6順位とも返し、記録の無い順位は final を null にする */
export function standings(pool: HistoryEvent[], target: HistoryEvent): Standing[] {
  return HISTORY_RANKS.map((rank) => {
    const has = finite(target.finals[rank]);
    return {
      rank,
      final: has ? target.finals[rank] : null,
      total: placeOf(rankRows(pool, rank, "final"), target.id),
      same: placeOf(rankRows(pool, rank, "same", target.hours), target.id),
      daily: placeOf(rankRows(pool, rank, "daily"), target.id),
      perDay: has ? perDay(target, rank) : null,
    };
  });
}

/** URL の ?event= を読む。無い・表に無い回なら最新の回 */
export function pickEvent(all: HistoryEvent[], param: string | null): HistoryEvent | null {
  const id = param != null && /^\d+$/.test(param) ? Number(param) : null;
  const hit = id != null ? all.find((e) => e.id === id) : undefined;
  if (hit) return hit;
  return all.reduce<HistoryEvent | null>((best, e) => (best == null || e.id > best.id ? e : best), null);
}

/** URL の ?types= を読む（カンマ区切り）。無い・知らない種別だけなら既定 */
export function pickTypes(param: string | null): string[] {
  const known: readonly string[] = HISTORY_TYPES.map((t) => t.value);
  const got = (param ?? "").split(",").filter((t) => known.includes(t));
  return got.length > 0 ? got : [...DEFAULT_TYPES];
}

/** 回の番号を「87・90・93…ほか11回」のように縮めて書く */
export function idList(events: HistoryEvent[], max = 6): string {
  const ids = events.map((e) => e.id);
  return ids.length <= max ? ids.join("・") : `${ids.slice(0, max).join("・")}…ほか${ids.length - max}回`;
}
