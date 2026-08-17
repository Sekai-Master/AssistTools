/**
 * 進み具合の記録。2つの粒度を持つ。
 *
 * - `owned`     … その家具の設計図を**持っている**（家具単位）。模写しに行く候補から外すため
 * - `collected` … その顔ぶれの会話を**見た**（家具×顔ぶれ単位）。会話の回収管理のため
 *
 * 別物なので混ぜない。設計図を持っていても会話を全部見たとは限らないし、
 * 会話を見たからといって自分が設計図を持っているとも限らない（他人のセカイで見た場合）。
 *
 * ★ 端末の localStorage にだけ置く（サーバには送らない）。保存キーは
 *   src/pages/settings/lib/storedItems.ts の STORED_ITEMS にも登録してある。
 */
export const OWNED_STORAGE_KEY = "sekaimaster:mysekai:owned:v1";
const VERSION = 1;

export interface Progress {
  /** 設計図を持っている家具のID。 */
  owned: Set<number>;
  /** 会話を見た顔ぶれ。キーは partyKey() で作る。 */
  collected: Set<string>;
}

/**
 * 家具×顔ぶれのキー。`10:1,2` のような形。
 * 顔ぶれは呼び出し側で並びが揃っている前提だが、念のためここでも整列する
 * （並びが違うだけで別物になると、同じ会話に2つ印が立つ）。
 */
export function partyKey(fixtureId: number, party: readonly number[]): string {
  return `${fixtureId}:${[...party].sort((a, b) => a - b).join(",")}`;
}

const intSet = (v: unknown): Set<number> =>
  new Set(
    Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isInteger(n)) : []
  );

const strSet = (v: unknown): Set<string> =>
  new Set(
    Array.isArray(v)
      ? // 想定外の形（空文字・記号だけ）は捨てる。表示の突き合わせに使うだけなので緩めでよい。
        v.filter((s): s is string => typeof s === "string" && /^\d+:\d+(,\d+)*$/.test(s))
      : []
  );

/** 壊れた内容・別バージョンは空として扱う（誤って「全部持っている」にしない）。 */
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(OWNED_STORAGE_KEY);
    if (!raw) return { owned: new Set(), collected: new Set() };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { owned: new Set(), collected: new Set() };
    }
    const o = parsed as { v?: unknown; ids?: unknown; seen?: unknown };
    if (o.v !== VERSION) return { owned: new Set(), collected: new Set() };
    return { owned: intSet(o.ids), collected: strSet(o.seen) };
  } catch {
    return { owned: new Set(), collected: new Set() };
  }
}

export function saveProgress(p: Progress): void {
  try {
    // 並びを固定しておくと、書き出し・取り込みの差分が読める。
    const ids = [...p.owned].sort((a, b) => a - b);
    const seen = [...p.collected].sort();
    localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify({ v: VERSION, ids, seen }));
  } catch {
    // 保存できなくても操作は続けられる（プライベートモード等）。
  }
}
