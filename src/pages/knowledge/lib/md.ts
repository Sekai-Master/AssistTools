/**
 * 知見ノート用の Markdown 読み取り。
 *
 * ★★ **HTML 文字列を作らない。** ★★
 * 構造（Block[）だけ返して、描画は React 側でやる。`dangerouslySetInnerHTML` を使わないので、
 * 記事に何を書いても DOM に生の HTML が入る余地が無い。
 *
 * ★ ライブラリを足していない理由。**読むのは自分たちが書いた文書だけ**で、書式は
 *   docs/knowledge/README.md で固定してある。汎用パーサを1つ抱えるより、
 *   使う書式だけを扱って**取りこぼしをテストで落とす**ほうが確実（md.test.ts が
 *   全記事を実際に流して、記法が生のまま残っていないことを見ている）。
 *
 * 対応する記法: 見出し(##/###) / 段落 / 箇条書き(-) / 番号付き(1.) / 表 / 引用(>) /
 *               コードブロック(```) / 水平線(---) と、行内の **太字**・`コード`・[リンク](url)。
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 2 | 3; text: Inline[] }
  | { kind: "para"; text: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
  | { kind: "quote"; text: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

/**
 * 行内の記法を分解する。**太字** / `コード` / [文字](url) / <url> の4つ。
 *
 * ★ `<url>` を落とすと、**出典の URL が山括弧つきの生文字で出る**。
 *   出典はこのノートの背骨なので、そこがリンクにならないのは致命的（実際に一度そうなった）。
 */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  // 3種をまとめて1回で走査する。順に試すと入れ子の解釈が食い違う。
  const re =
    /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last)
      out.push({ kind: "text", text: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "strong", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
    else if (m[3] !== undefined)
      out.push({ kind: "link", text: m[3], href: m[4] });
    // <url> はそのまま見せる（引用するときに URL が読めることが大事）。
    else out.push({ kind: "link", text: m[5], href: m[5] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: "text", text: src.slice(last) });
  return out;
}

/** 表の1行 `| a | b |` をセルに割る。 */
function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // コードブロック。中身は素通し（記法として解釈しない）。
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```"))
        buf.push(lines[i++]);
      i++; // 閉じ
      out.push({ kind: "code", text: buf.join("\n") });
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      out.push({ kind: "rule" });
      i++;
      continue;
    }

    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      out.push({
        kind: "heading",
        level: h[1].length === 2 ? 2 : 3,
        text: parseInline(h[2].trim()),
      });
      i++;
      continue;
    }

    // 表。2行目が区切り行のときだけ表として扱う。
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]).map(parseInline));
        i++;
      }
      out.push({ kind: "table", head, rows });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]))
        buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push({ kind: "quote", text: parseInline(buf.join(" ").trim()) });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = ordered
          ? /^\d+\.\s+(.*)$/.exec(lines[i])
          : /^[-*]\s+(.*)$/.exec(lines[i]);
        if (!m) {
          // ぶら下げの継続行（インデントされた続き）は直前の項目に足す。
          if (/^\s{2,}\S/.test(lines[i]) && items.length) {
            const extra = parseInline(" " + lines[i].trim());
            items[items.length - 1] = [...items[items.length - 1], ...extra];
            i++;
            continue;
          }
          break;
        }
        items.push(parseInline(m[1]));
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }

    // 段落。空行か、他の記法が始まるまでを1つにまとめる。
    // ★ **必ず今の行を1つ食べる。** 「どれにも当てはまらない行を捨てる」書き方にすると、
    //   表になり損ねた `| a | b |` のような行が**黙って消える**。落とすくらいなら
    //   そのまま段落として出したほうがよい（書いた側が気付ける）。
    const buf: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{2,3}\s|[-*]\s|\d+\.\s|>|```|\|)/.test(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    out.push({ kind: "para", text: parseInline(buf.join("")) });
  }

  return out;
}

/** 描画された文字列を集める（テストで「記法が生のまま残っていないか」を見るのに使う）。 */
export function plainText(blocks: Block[]): string {
  const inline = (xs: Inline[]) => xs.map((x) => x.text).join("");
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "heading":
        case "para":
        case "quote":
          return inline(b.text);
        case "list":
          return b.items.map(inline).join("\n");
        case "table":
          return [b.head, ...b.rows]
            .map((r) => r.map(inline).join(" "))
            .join("\n");
        case "code":
          return b.text;
        case "rule":
          return "";
      }
    })
    .join("\n");
}
