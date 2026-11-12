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

/** 語の切れ目を見る文字の種類。英数字とカタカナは、同じ種類が続くと 1 つの語とみなす。 */
const kindOf = (c: string | undefined): "ascii" | "kana" | null => {
  if (c == null) return null;
  if (/[A-Za-z0-9_]/.test(c)) return "ascii";
  if (/[ァ-ヺー]/.test(c)) return "kana";
  return null;
};

/**
 * 語の出る位置（from 以降）。語の端が英数字かカタカナで、その外側も同じ種類の字なら、
 * 別の語の一部として飛ばす（「SF」を「SFC」の中で、「エビ」を「エビデンス」の中で拾わない）。
 * ★ 前後の字は、切り分ける前の元の文字列の位置で見る（切ったあとの先頭では直前の字が見えない）。
 */
function indexOfTerm(text: string, term: string, from: number): number {
  const head = kindOf(term[0]);
  const tail = kindOf(term[term.length - 1]);
  for (let at = text.indexOf(term, from); at >= 0; at = text.indexOf(term, at + 1)) {
    const okStart = head == null || kindOf(text[at - 1]) !== head;
    const okEnd = tail == null || kindOf(text[at + term.length]) !== tail;
    if (okStart && okEnd) return at;
  }
  return -1;
}

/** from 以降で、まだ使っていない項目の語のうち、いちばん前（同じ位置なら長いほう）に出るもの。 */
function firstHit(text: string, from: number, entries: readonly GlossaryEntry[], used: Set<GlossaryEntry>): Hit | null {
  let best: Hit | null = null;
  for (const entry of entries) {
    if (used.has(entry)) continue;
    for (const term of entry.terms) {
      const at = indexOfTerm(text, term, from);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && term.length > best.term.length)) best = { at, term, entry };
    }
  }
  return best;
}

function annotateInline(xs: GuideInline[], entries: readonly GlossaryEntry[], used: Set<GlossaryEntry>): GuideInline[] {
  return xs.flatMap((x): GuideInline[] => {
    if (x.kind !== "text") return [x];
    const text = x.text;
    const out: GuideInline[] = [];
    let pos = 0;
    for (let hit = firstHit(text, pos, entries, used); hit; hit = firstHit(text, pos, entries, used)) {
      if (hit.at > pos) out.push({ kind: "text", text: text.slice(pos, hit.at) });
      out.push({ kind: "term", text: hit.term, entry: hit.entry });
      used.add(hit.entry);
      pos = hit.at + hit.term.length;
    }
    if (pos < text.length) out.push({ kind: "text", text: text.slice(pos) });
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
