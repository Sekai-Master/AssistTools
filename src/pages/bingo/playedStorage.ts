/**
 * 遊んだ曲の一覧をこの端末に残す。1 枚で遊ぶ・まとめて遊ぶで同じ一覧を 1 つ使う。
 *
 * 1 件は { id: 曲の番号, at: 入れた時刻（ミリ秒）, cells?: その曲で埋めたマス }。並びは遊んだ順。
 * 入れるのは「埋める」「遊んだ曲に入れる」と決めたときだけ（× や背景のタップで閉じたら入れない。持ち主の決定 2）。
 * cells は一覧から 1 曲消すときに、その曲で埋めたマスを見せて戻すかを選ばせるための記録（持ち主の決定 2 の C）。
 * card はカードの名前: まとめて遊ぶはカードの id、1 枚で遊ぶは「種類@足した時刻」（playedLogic.ts の singleRef）。
 *
 * ★ 保存キーを足したので src/pages/settings/lib/storedItems.ts の台帳にも登録してある
 *   （設定画面の一覧・削除・書き出しと、プライバシーポリシーの表に出る）。
 * ★ 設定画面は最初の読み込みに入るので、ここでは楽曲データを読み込まない。楽曲データに無い曲は読む側が落とす。
 * ★ 足していく記録なので、配列まるごとを後勝ちで書くと、ほかのタブが足した曲を消す（計画のレビュー G-08）。
 *   書く側（usePlayedList）は、足す・消す直前に保存を読み直し、そこへ当ててから書く。
 */

export const PLAYED_STORAGE_KEY = "sekaimaster:bingo:played:v1";

/** 一覧の上限。1 週間ちょっとの開催で 1 日 100 曲遊んでも収まる（計画 4 節。前提）。超えたら古いほうから落とす。 */
export const MAX_PLAYED = 1000;

export interface PlayedCells {
  /** どのカードか（まとめて遊ぶのカードの id か、1 枚で遊ぶの「種類@足した時刻」）。 */
  card: string;
  /** その曲で埋めたマスの番号（0〜24、昇順）。 */
  filled: number[];
}

export interface PlayedEntry {
  /** 曲の番号（楽曲データの id）。 */
  id: string;
  /** 入れた時刻（ミリ秒）。 */
  at: number;
  /** その曲で埋めたマス。埋めたマスが無ければ持たない。 */
  cells?: PlayedCells[];
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MUSIC_ID = /^\d{1,4}$/;
/** まとめて遊ぶのカードの id（multiStorage の ID_PATTERN）か、1 枚で遊ぶの「種類@足した時刻」。 */
const CARD_REF = /^(?:[a-z0-9]{1,16}|(?:odai|song)@\d{1,15})$/i;
/** 1 曲で埋めるカードは、1 枚で遊ぶ 2 枚（お題・曲名）とまとめて遊ぶ 5 枚まで。壊れた保存でタブを固めない上限。 */
const MAX_CELL_GROUPS = 8;

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

function parseCells(v: unknown): PlayedCells[] {
  if (!Array.isArray(v)) return [];
  const out: PlayedCells[] = [];
  for (const g of v.slice(0, MAX_CELL_GROUPS)) {
    if (!g || typeof g !== "object" || Array.isArray(g)) continue;
    const r = g as Record<string, unknown>;
    if (typeof r.card !== "string" || !CARD_REF.test(r.card) || !Array.isArray(r.filled)) continue;
    const filled = [...new Set(r.filled.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < 25))].sort((a, b) => a - b);
    if (filled.length > 0) out.push({ card: r.card, filled });
  }
  return out;
}

/** 1 件を読む。形が合わなければ null。埋めたマスの記録だけが壊れていれば、記録を外して残す。 */
function parseEntry(v: unknown): PlayedEntry | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || !MUSIC_ID.test(r.id) || !isTime(r.at)) return null;
  const cells = parseCells(r.cells);
  return { id: r.id, at: r.at, ...(cells.length > 0 ? { cells } : {}) };
}

/**
 * 解釈済みの値から一覧を作る（保存の読み込みと、中断用の書き出しの読み込みで共通）。
 * 配列でなければ空。1 件ずつ見て形の合わない件を落とし、新しい MAX_PLAYED 件だけ残す。dropped は落とした件数。
 */
export function parsePlayedArray(v: unknown): { entries: PlayedEntry[]; dropped: number } {
  if (!Array.isArray(v)) return { entries: [], dropped: 0 };
  const entries = v.flatMap((item) => parseEntry(item) ?? []);
  const dropped = v.length - entries.length;
  return { entries: entries.slice(-MAX_PLAYED), dropped };
}

/** 保存された文字列を読む。読めなければ空の一覧。 */
export function parseSavedPlayed(raw: string | null): PlayedEntry[] {
  if (raw === null) return [];
  try {
    return parsePlayedArray(JSON.parse(raw)).entries;
  } catch {
    return [];
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 保存を読む。localStorage が使えない（プライベートブラウズ・権限なし）ときは null。
 * ★ 空の一覧（[]）と分けて返す。使えないときに「読み直したら空だった」として画面の一覧を消さないため。
 */
export function loadPlayed(storage: StorageLike | null = defaultStorage()): PlayedEntry[] | null {
  if (!storage) return null;
  try {
    return parseSavedPlayed(storage.getItem(PLAYED_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** 一覧を書く。空なら保存から消す（設定画面の一覧に 0 件で残さない）。 */
export function savePlayed(list: readonly PlayedEntry[], storage: StorageLike | null = defaultStorage()) {
  try {
    if (list.length === 0) storage?.removeItem(PLAYED_STORAGE_KEY);
    else storage?.setItem(PLAYED_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 容量切れ・プライベートブラウズなど。残せないだけで遊ぶのには困らない
  }
}

/** 設定画面とプライバシーポリシーの台帳用の要約。0 件なら null、読めなければ broken。 */
export function summarizeSavedPlayed(raw: string, broken: string): string | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return broken;
  }
  if (!Array.isArray(v)) return broken;
  const n = parsePlayedArray(v).entries.length;
  return n === 0 ? null : `${n} 曲`;
}

/** 同じ 1 件か（同じ曲を 2 回遊べば 2 件あるので、時刻まで見る）。 */
export const sameEntry = (a: Pick<PlayedEntry, "id" | "at">, b: Pick<PlayedEntry, "id" | "at">) => a.id === b.id && a.at === b.at;

/** 最後に足す。上限を超えたら古いほうから落とす。 */
export function withAppended(list: readonly PlayedEntry[], entry: PlayedEntry): PlayedEntry[] {
  return [...list, entry].slice(-MAX_PLAYED);
}

/** id と時刻が同じ 1 件目だけを消す。 */
export function withoutEntry(list: readonly PlayedEntry[], target: Pick<PlayedEntry, "id" | "at">): PlayedEntry[] {
  const i = list.findIndex((x) => sameEntry(x, target));
  return i < 0 ? [...list] : [...list.slice(0, i), ...list.slice(i + 1)];
}

/** その曲の記録に、カード card で埋めたマスを足す（一覧からカードを埋めたとき）。同じカードの記録はまとめる。 */
export function withCellsAdded(
  list: readonly PlayedEntry[],
  target: Pick<PlayedEntry, "id" | "at">,
  card: string,
  cells: readonly number[]
): PlayedEntry[] {
  if (cells.length === 0) return [...list];
  let done = false;
  return list.map((x) => {
    if (done || !sameEntry(x, target)) return x;
    done = true;
    const groups = x.cells ?? [];
    const prev = groups.find((g) => g.card === card)?.filled ?? [];
    const filled = [...new Set([...prev, ...cells])].sort((a, b) => a - b);
    return { ...x, cells: [...groups.filter((g) => g.card !== card), { card, filled }] };
  });
}
