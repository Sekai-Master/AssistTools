/**
 * まとめ画像（/guide/cards）。共有しやすい 6 枚の PNG（2400×2000、6:5）と、まとめて保存する zip。
 *
 * - 画像は public/guide/cards/card-1.png〜card-6.png、zip は sekaimaster-guide-cards.zip（指揮が作る）
 * - alt は各枚の文言（docs/guide/cards.md）から。`## 題` ごとに 1 枚（上から 1〜6）で、
 *   alt は「題。本文」（記法と確かさの印は外す）。cards.md に無い枚は「まとめ画像 N」
 */
export interface GuideCard {
  n: number;
  file: string;
  title: string;
  alt: string;
  width: number;
  height: number;
}

export const CARD_COUNT = 6;
export const CARD_WIDTH = 2400;
export const CARD_HEIGHT = 2000;
export const CARDS_ZIP = "sekaimaster-guide-cards.zip";

/** 記法と印を外して地の文にする。 */
function plain(s: string): string {
  return s
    .replace(/〔[^〕]*〕/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|`/g, "")
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "")
    .replace(/^［[^］]*］$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 行ごとに地の文にし、句点が無ければ足してつなぐ（箇条の 1 項目＝1 文として読み上げられるように）。 */
function sentences(lines: string[]): string {
  return lines
    .map(plain)
    .filter(Boolean)
    .map((l) => (/[。！？!?]$/.test(l) ? l : `${l}。`))
    .join("");
}

/**
 * cards.md を枚ごとに読む。番号 → 題・本文。
 * `## 題` が 1 枚で、番号は上からの順（`## 3. 題` のように番号があればそれを使う）。
 */
export function parseCardTexts(src: string): Map<number, { title: string; body: string }> {
  const out = new Map<number, { title: string; body: string }>();
  let cur: { n: number; title: string; lines: string[] } | null = null;
  const flush = () => {
    if (cur) out.set(cur.n, { title: cur.title, body: sentences(cur.lines) });
  };
  for (const line of src.replace(/\r\n?/g, "\n").split("\n")) {
    const h = /^#{2,3}\s+(.+)$/.exec(line.trim());
    if (h) {
      flush();
      const num = /^(?:まとめ画像\s*)?(\d+)[.．:：]\s*(.*)$/.exec(h[1].trim());
      const prev: number = cur ? cur.n : 0;
      const n = num ? Number(num[1]) : prev + 1;
      cur = { n, title: plain(num ? num[2] : h[1]), lines: [] };
      continue;
    }
    if (/^#\s/.test(line.trim())) continue;
    cur?.lines.push(line);
  }
  flush();
  return out;
}

export function buildCards(src: string | undefined): GuideCard[] {
  const texts = src ? parseCardTexts(src) : new Map<number, { title: string; body: string }>();
  return Array.from({ length: CARD_COUNT }, (_, i) => {
    const n = i + 1;
    const t = texts.get(n);
    const title = t?.title || `まとめ画像 ${n}`;
    const alt = t ? [t.title, t.body].filter(Boolean).join("。").replace(/。。/g, "。") : `まとめ画像 ${n}`;
    return { n, file: `card-${n}.png`, title, alt, width: CARD_WIDTH, height: CARD_HEIGHT };
  });
}

export const cardSrc = (base: string, file: string) => `${base}guide/cards/${file}`;
