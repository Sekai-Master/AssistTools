/**
 * 「もう持っている家具」の記録。
 *
 * このツールの目的は**まだ持っていない家具を見つけること**なので、持っているものに
 * 印を付けて畳めると残りが実際の「取りに行くリスト」になる。
 *
 * ★ 端末の localStorage にだけ置く（サーバには送らない）。
 *   保存キーは src/pages/settings/lib/storedItems.ts の STORED_ITEMS にも登録してある。
 *
 * ★ 家具IDの配列で持つ。1,518件すべてに印を付けても 1万文字程度で収まるので、
 *   ビットマップ等に凝る必要はない。
 */
export const OWNED_STORAGE_KEY = "sekaimaster:mysekai:owned:v1";
const VERSION = 1;

/** 壊れた内容・別バージョンは空として扱う（誤って「全部持っている」にしない）。 */
export function loadOwned(): Set<number> {
  try {
    const raw = localStorage.getItem(OWNED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return new Set();
    const o = parsed as { v?: unknown; ids?: unknown };
    if (o.v !== VERSION || !Array.isArray(o.ids)) return new Set();
    return new Set(o.ids.filter((n): n is number => typeof n === "number" && Number.isInteger(n)));
  } catch {
    return new Set();
  }
}

export function saveOwned(owned: ReadonlySet<number>): void {
  try {
    // 並びを固定しておくと、書き出し・取り込みの差分が読める。
    const ids = [...owned].sort((a, b) => a - b);
    localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify({ v: VERSION, ids }));
  } catch {
    // 保存できなくても操作は続けられる（プライベートモード等）。
  }
}
