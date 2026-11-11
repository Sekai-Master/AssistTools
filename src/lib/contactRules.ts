/**
 * 問い合わせ（/contact）の入力の決まり。画面（src/pages/contact）と関数（functions/api/contact.ts）で共有する。
 *
 * ★ DOM の型も `__APP_VERSION__` も使わない。関数は Workers の型（functions/tsconfig.json）で
 *   型検査されるので、ここで DOM に触ると `npm run typecheck:border` が落ちる。
 * ★ 字数は画面と関数で同じ数え方（コードポイント）。片方だけ UTF-16 の length で数えると、
 *   絵文字の多い内容が「画面では 2,000 字以内なのに関数に弾かれる」形でずれる。
 */

/** 種類。最後の「その他」は、選択肢の外の値を寄せる先を兼ねる。 */
export const CONTACT_KINDS = [
  "不具合の報告",
  "ボーダー予測・データの誤り",
  "要望・感想",
  "権利者からのご連絡",
  "その他",
] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

const KIND_FALLBACK: ContactKind = "その他";
/** 選択肢の外の値を内容の頭に添えるときの上限。2,000 字の検査を通したあとで膨らませないため。 */
const KIND_ORIGINAL_MAX = 40;

export const CONTACT_BODY_MAX = 2000;
export const CONTACT_REPLY_MAX = 100;
const PAGE_MAX = 100;

/** 関数が受け取る本文の上限（バイト）。内容 2,000 字の UTF-8（最大 8KB）に余裕を持たせた値。 */
export const CONTACT_REQUEST_MAX_BYTES = 16 * 1024;

export const charCount = (s: string): number => Array.from(s).length;

/** 内容の問題。null なら送れる。前後の空白は数えない。 */
export function bodyProblem(body: string): "empty" | "too_long" | null {
  const n = charCount(body.trim());
  if (n === 0) return "empty";
  if (n > CONTACT_BODY_MAX) return "too_long";
  return null;
}

/**
 * 種類を選択肢の中に寄せる。外の値は「その他」にし、元の値（40 字まで）を返す。
 * 開きっぱなしの古いタブが、後の版で消した選択肢を送ってきても 400 にしないため（レビュー 中-3）。
 */
export function normalizeKind(raw: unknown): { kind: ContactKind; original: string | null } {
  if (typeof raw === "string" && (CONTACT_KINDS as readonly string[]).includes(raw)) {
    return { kind: raw as ContactKind, original: null };
  }
  const original = typeof raw === "string" ? raw.trim() : "";
  return {
    kind: KIND_FALLBACK,
    original: original ? Array.from(original).slice(0, KIND_ORIGINAL_MAX).join("") : null,
  };
}

/** どのページから来たか（入口の `?from=`）。サイト内のパスの形でなければ空。 */
export function normalizePage(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > PAGE_MAX) return "";
  return /^\/[A-Za-z0-9/-]*$/.test(raw) ? raw : "";
}

/** 版（x.y.z）。形に合わなければ空。 */
export function normalizeVersion(raw: unknown): string {
  return typeof raw === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(raw) ? raw : "";
}

/**
 * 返信先が X の ID かメールアドレスの形か。**弾くためではなく、注意を出すためだけ**に使う
 *（「Discord の ID」のような書き方でも、こちらが読めば連絡できることがある）。
 */
export function replyLooksLikeAddress(reply: string): boolean {
  const s = reply.trim();
  return /^@?[A-Za-z0-9_]{1,15}$/.test(s) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
