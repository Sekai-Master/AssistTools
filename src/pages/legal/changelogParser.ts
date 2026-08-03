/**
 * CHANGELOG.md を更新履歴ページ用の構造に変換する。
 *
 * ★ 正本はリポジトリ直下の CHANGELOG.md 一本（docs/versioning.md）。
 *   ページ用にデータを二重管理すると必ずどちらかが古くなるので、
 *   Markdown をそのまま読み込んで、ここで解析する。
 *   Markdown ライブラリは入れない ── 書式はこちらが決めた固定の形しか
 *   使わないので、汎用パーサを積む理由が無い。
 *
 * 受け付ける形:
 *
 *   ## [1.9.0] - 2026-08-04
 *   （任意）版そのものの説明。箇条書きの前に置いた地の文。
 *   ### 追加
 *   - 項目
 *
 * この形から外れた行は黙って捨てる。捨てた結果ページから版が消えるのは困るので、
 * 「package.json の version と最新版が一致すること」をテストで固定してある。
 */

export interface ChangeGroup {
  /** 「追加」「変更」「修正」など。CHANGELOG 側の見出しをそのまま使う。 */
  label: string;
  items: string[];
}

export interface Release {
  version: string;
  /** YYYY-MM-DD。 */
  date: string;
  /** 版全体の説明（無ければ空文字）。 */
  summary: string;
  groups: ChangeGroup[];
}

const VERSION_HEADING = /^##\s+\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/;
const GROUP_HEADING = /^###\s+(.+?)\s*$/;
const ITEM = /^[-*]\s+(.+?)\s*$/;

/**
 * Markdown 中の強調記法だけ落として素のテキストにする。
 * 見た目の強調はページ側の書体で付けるので、記号は残さない。
 */
function stripEmphasis(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
}

export function parseChangelog(markdown: string): Release[] {
  // HTML コメント（書式についての注意書き）は本文ではないので先に落とす。
  const body = markdown.replace(/<!--[\s\S]*?-->/g, "");

  const releases: Release[] = [];
  let current: Release | null = null;
  let group: ChangeGroup | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();

    const version = VERSION_HEADING.exec(line);
    if (version) {
      current = { version: version[1], date: version[2], summary: "", groups: [] };
      group = null;
      releases.push(current);
      continue;
    }

    // 最初の版見出しより前（タイトル・前書き）は読み飛ばす。
    if (!current) continue;

    const heading = GROUP_HEADING.exec(line);
    if (heading) {
      group = { label: heading[1], items: [] };
      current.groups.push(group);
      continue;
    }

    const item = ITEM.exec(line);
    if (item) {
      // 見出しの無い箇条書きは、行き場が無いので「その他」にまとめる。
      if (!group) {
        group = { label: "その他", items: [] };
        current.groups.push(group);
      }
      group.items.push(stripEmphasis(item[1]));
      continue;
    }

    // 箇条書きに入る前の地の文だけを版の説明として拾う。
    if (line && !group) {
      current.summary = current.summary ? `${current.summary} ${stripEmphasis(line)}` : stripEmphasis(line);
    }
  }

  return releases;
}
