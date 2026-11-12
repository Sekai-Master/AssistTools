/**
 * 用語をタップすると意味が出る仕組み。語と説明は第 8 章（用語集）から読む。
 *
 * - 第 8 章の項目 `- **語**: 説明 … → N.M` から、語・説明・「→ N.M」の行き先を取る
 * - 「支援・支援鯖」のように「・」でつながった語は、それぞれの語で拾う（1 字の語は拾わない。誤って当たりやすい）
 * - **各節で最初に出た 1 回だけ**をボタンにする（同じ項目の別の語も 1 回と数える）
 * - 段落・箇条・引用の地の文だけが対象。見出し・表・印・リンク・太字・コードの中は対象にしない
 * - 同じ位置で複数の語が当たるときは長い語を取る（「支援鯖」と「支援」なら「支援鯖」）
 */
import { parseInline } from "../../knowledge/lib/md";
import { toGuideInline, type GlossaryEntry, type GuideBlock, type GuideInline } from "./guide";
import { parseRefs } from "./refs";

const ITEM_RE = /^[-*]\s+\*\*(.+?)\*\*\s*[:：]\s*(.+)$/;
const REFS_RE = /\s*→\s*([0-9０-９.・、\s第章]+)$/;

export function parseGlossary(src: string): GlossaryEntry[] {
  return src
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line): GlossaryEntry[] => {
      const m = ITEM_RE.exec(line.trim());
      if (!m) return [];
      const label = m[1].trim();
      let body = m[2].trim();
      const r = REFS_RE.exec(body);
      const refs = r ? parseRefs(r[1]) : [];
      if (r) body = body.slice(0, r.index).trim();
      const terms = label
        .split("・")
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
      return terms.length ? [{ label, terms, def: toGuideInline(parseInline(body)), refs }] : [];
    });
}

interface Hit {
  at: number;
  term: string;
  entry: GlossaryEntry;
}

const isAsciiWord = (c: string | undefined) => c != null && /[A-Za-z0-9_]/.test(c);

/**
 * 語の出る位置。英数字の語は、前後が英数字なら別の語の一部として飛ばす
 * （「SF」を「SFC」の中で拾わない）。
 */
function indexOfTerm(text: string, term: string): number {
  for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + 1)) {
    const before = text[at - 1];
    const after = text[at + term.length];
    const okStart = !isAsciiWord(term[0]) || !isAsciiWord(before);
    const okEnd = !isAsciiWord(term[term.length - 1]) || !isAsciiWord(after);
    if (okStart && okEnd) return at;
  }
  return -1;
}

/** 文字の中で、まだ使っていない項目の語のうち、いちばん前（同じ位置なら長いほう）に出るもの。 */
function firstHit(text: string, entries: readonly GlossaryEntry[], used: Set<GlossaryEntry>): Hit | null {
  let best: Hit | null = null;
  for (const entry of entries) {
    if (used.has(entry)) continue;
    for (const term of entry.terms) {
      const at = indexOfTerm(text, term);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && term.length > best.term.length)) best = { at, term, entry };
    }
  }
  return best;
}

function annotateInline(xs: GuideInline[], entries: readonly GlossaryEntry[], used: Set<GlossaryEntry>): GuideInline[] {
  return xs.flatMap((x): GuideInline[] => {
    if (x.kind !== "text") return [x];
    const out: GuideInline[] = [];
    let rest = x.text;
    for (let hit = firstHit(rest, entries, used); hit; hit = firstHit(rest, entries, used)) {
      if (hit.at > 0) out.push({ kind: "text", text: rest.slice(0, hit.at) });
      out.push({ kind: "term", text: hit.term, entry: hit.entry });
      used.add(hit.entry);
      rest = rest.slice(hit.at + hit.term.length);
    }
    if (rest) out.push({ kind: "text", text: rest });
    return out;
  });
}

/** 節（見出しから次の見出しまで）ごとに、最初に出た語をボタンにする。 */
export function annotateTerms(blocks: GuideBlock[], entries: readonly GlossaryEntry[]): GuideBlock[] {
  if (entries.length === 0) return blocks;
  let used = new Set<GlossaryEntry>();
  return blocks.map((b): GuideBlock => {
    switch (b.kind) {
      case "heading":
        used = new Set();
        return b;
      case "para":
        return { ...b, text: annotateInline(b.text, entries, used) };
      case "quote":
        return { ...b, text: annotateInline(b.text, entries, used) };
      case "list":
        return { ...b, items: b.items.map((it) => annotateInline(it, entries, used)) };
      default:
        return b;
    }
  });
}
