/**
 * 「→ 3.2・4.5」「くわしく → 2.4」の節の番号を、ページの中のリンクにする。
 * - 「3.2」→ /guide/3#s3-2（節のアンカーは guide.ts の sectionId と同じ形）
 * - 「4」「第4章」→ /guide/4
 * - 第 0 章は /guide に載せているので、「0」→ /guide、「0.1」→ /guide#s0-1
 */
export interface Ref {
  label: string;
  to: string;
}

const chapterPath = (n: number) => (n === 0 ? "/guide" : `/guide/${n}`);

export function refTo(token: string): Ref | null {
  const t = token.trim().replace(/^第\s*(\d)\s*章$/, "$1");
  const sec = /^(\d)\.(\d+)$/.exec(t);
  if (sec) return { label: t, to: `${chapterPath(Number(sec[1]))}#s${sec[1]}-${sec[2]}` };
  if (/^\d$/.test(t)) return { label: `第${t}章`, to: chapterPath(Number(t)) };
  return null;
}

/** 区切り（・、, ／ / と空白）で割って、読めたものだけを返す。1 つでも読めなければ空（書き損じを見逃さない）。 */
export function parseRefs(src: string): Ref[] {
  const tokens = src.split(/[・、,，／/\s]+/).filter(Boolean);
  const refs = tokens.map(refTo);
  return refs.every((r): r is Ref => r != null) ? refs : [];
}
