/**
 * 保存データの書き出しと取り込み。
 *
 * ── なぜ要るか ────────────────────────────────────────────────
 * データは全部この端末の localStorage にあり、サーバには無い。端末を変える・
 * ブラウザの履歴を消す・別のブラウザで開く、のどれでも消える。育成状態や
 * プレイヤー設定のように**入れ直すのが苦痛な量**が溜まってきたので、持ち出せるようにする。
 *
 * ── 生の文字列のまま持つ ──────────────────────────────────────
 * 値は **localStorage の生の文字列そのまま**でファイルに入れる。JSON として
 * 解釈してから書き戻すと、`"dark"` のような「JSONとしても読める文字列」で
 * 引用符の有無が変わって壊れる。読みやすさより往復の正確さを取る。
 *
 * ── 取り込みは外部入力 ────────────────────────────────────────
 * ファイルは人が編集できるし、まったく別のファイルを掴んで渡すこともできる。
 * **知っているキーだけ・文字列だけ・上限つき**で受け、各項目は台帳の
 * `summarize` に通して読めることを確かめてから書き戻す。
 * 読めない項目は黙って捨てず、画面に「壊れている」と出す。
 */
import { BROKEN, STORED_ITEMS, STORED_ITEM_BY_KEY } from "./storedItems";

export const BACKUP_APP = "sekai-master-tools";
export const BACKUP_VERSION = 1;

/** 1項目・全体それぞれの上限。壊れたファイルや巨大なファイルでタブを固めない。 */
const MAX_VALUE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 8_000_000;

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: number;
  /** キー → localStorage の生の文字列。 */
  data: Record<string, string>;
  /** 人がファイルを開いたときのための要約。**取り込みでは使わない。** */
  summary?: Record<string, string>;
}

/** 書き出す中身を組み立てる。空の項目は入れない。 */
export function buildBackup(read: (key: string) => string | null, now: number): BackupFile {
  const data: Record<string, string> = {};
  const summary: Record<string, string> = {};
  for (const item of STORED_ITEMS) {
    const raw = read(item.key);
    if (raw === null) continue;
    const s = item.summarize(raw);
    if (s === null) continue; // 実質空。持ち出しても意味が無い。
    data[item.key] = raw;
    summary[item.label] = s;
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, data, summary };
}

export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `sekai-master-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.json`;
}

export interface ImportEntry {
  key: string;
  label: string;
  note: string;
  raw: string;
  /** 取り込んだあとの中身（例: 「12 件」）。読めなければ null。 */
  summary: string | null;
  /** いまこの端末にある同じ項目の要約。上書きになるかどうかを見せるため。 */
  current: string | null;
}

export interface ParsedBackup {
  exportedAt: number | null;
  entries: ImportEntry[];
  /** 取り込めなかったもの・怪しかったものの説明。**黙って捨てない。** */
  problems: string[];
}

/**
 * 取り込むファイルを読む。**この関数は localStorage を書き換えない**
 *（何が入るかを見せてから、押されたときだけ applyBackup で書く）。
 */
export function parseBackup(text: string, read: (key: string) => string | null): ParsedBackup {
  const problems: string[] = [];
  const fail = (msg: string): ParsedBackup => ({ exportedAt: null, entries: [], problems: [msg] });

  if (text.length > MAX_TOTAL_BYTES) return fail("ファイルが大きすぎます。");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("JSON として読めませんでした。ファイルを間違えていないか確認してください。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("このツールが書き出したファイルではないようです。");
  }

  const file = parsed as Partial<BackupFile>;
  if (file.app !== BACKUP_APP) {
    return fail("このツールが書き出したファイルではないようです。");
  }
  // 将来のバージョンは形が変わっている可能性がある。読めるふりをしない。
  if (typeof file.version !== "number" || file.version > BACKUP_VERSION) {
    return fail("このファイルは新しいバージョンで書き出されています。サイトを更新してください。");
  }
  if (!file.data || typeof file.data !== "object" || Array.isArray(file.data)) {
    return fail("中身が入っていません。");
  }

  const entries: ImportEntry[] = [];
  for (const [key, value] of Object.entries(file.data as Record<string, unknown>)) {
    const item = STORED_ITEM_BY_KEY.get(key);
    if (!item) {
      // 知らないキーは書き戻さない（別バージョン・別サイトのデータを紛れ込ませない）。
      problems.push(`「${key}」は知らない項目なので取り込みません。`);
      continue;
    }
    if (typeof value !== "string") {
      problems.push(`「${item.label}」の中身が文字列ではないので取り込みません。`);
      continue;
    }
    if (value.length > MAX_VALUE_BYTES) {
      problems.push(`「${item.label}」が大きすぎるので取り込みません。`);
      continue;
    }
    const summary = item.summarize(value);
    if (summary === BROKEN) {
      problems.push(`「${item.label}」は内容を読み取れませんでした。取り込みません。`);
      continue;
    }
    entries.push({
      key,
      label: item.label,
      note: item.note,
      raw: value,
      summary,
      current: (() => {
        const cur = read(key);
        return cur === null ? null : item.summarize(cur);
      })(),
    });
  }

  if (entries.length === 0 && problems.length === 0) {
    problems.push("取り込めるものがありませんでした。");
  }
  return {
    exportedAt: typeof file.exportedAt === "number" ? file.exportedAt : null,
    entries,
    problems,
  };
}

/**
 * 選ばれた項目だけ書き戻す。**ファイルに無い項目には触らない**
 *（「復元＝全消しして入れ直す」にすると、ファイルに無いものが黙って消える）。
 *
 * @returns 実際に書き込めた件数
 */
export function applyBackup(
  entries: ImportEntry[],
  write: (key: string, value: string) => void
): number {
  let n = 0;
  for (const e of entries) {
    try {
      write(e.key, e.raw);
      n++;
    } catch {
      // 容量超過など。書けたぶんだけ数える（呼び出し側が差分を出せる）。
    }
  }
  return n;
}
