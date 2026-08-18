/**
 * ほしいものリストの共有。
 *
 * ★★ なぜリンクで渡すのか ★★
 * 持っていない家具は**他人のマイセカイに行って模写する**しかない。だから
 * 「自分に何が足りないか」を相手に伝えられないと、そもそも取りに行けない。
 * 要望も「アマゾンのほしいものリストのイメージ」（すだま氏 2026-08-18）で、
 * **リンクを渡す前提で発想されている**。JSON の書き出しや画像でも情報は運べるが、
 * 受け取った側に「読み込む」という一手間が増える。リンクなら開くだけで済む。
 *
 * ★ 状態はサーバに置かない。**URL そのものに載せる**ので、
 *   このサイトはリストを一切保存しないし、誰が誰に渡したかも知らない。
 *
 * ── 詰め方 ────────────────────────────────────────────────
 * ID を昇順に並べ、**前との差**を可変長で書き、base64url にする。
 * 家具IDは 1〜1676 に密集していて1件だけ 900002 という外れ値があるため、
 * 固定長より差分の方が圧倒的に短い（外れ値も3バイトで収まる）。
 * 100件でも 130 文字程度にしかならず、X や Discord にそのまま貼れる。
 */

/** URL に載せるときの検索パラメータ名。 */
export const WISH_PARAM = "wish";

/**
 * 受け取る上限。**ここを超えたリンクは読まない。**
 * 家具は全部で1518件しかないので、それ以上は壊れた入力か悪意のどちらか。
 */
const MAX_ITEMS = 2000;

function toVarint(n: number, out: number[]): void {
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function b64urlEncode(bytes: number[]): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): number[] | null {
  try {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    const out: number[] = [];
    for (let i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i));
    return out;
  } catch {
    return null;
  }
}

/** ID の集合を、URL に載せられる短い文字列にする。空なら空文字。 */
export function encodeWish(ids: Iterable<number>): string {
  const sorted = [...new Set(ids)]
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 9_999_999)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const bytes: number[] = [];
  let prev = 0;
  for (const id of sorted) {
    // 差は必ず1以上。0 を使わないぶん1引いて詰める。
    toVarint(id - prev - 1, bytes);
    prev = id;
  }
  return b64urlEncode(bytes);
}

/**
 * 共有文字列を ID の集合に戻す。壊れていれば空を返す。
 *
 * ★ **例外を投げない。** 他人から渡される文字列なので、
 *   壊れていても画面が落ちないことの方が大事。
 */
export function decodeWish(s: string): Set<number> {
  const out = new Set<number>();
  if (!s || !/^[A-Za-z0-9\-_]+$/.test(s)) return out;
  const bytes = b64urlDecode(s);
  if (!bytes) return out;
  let prev = 0;
  let i = 0;
  while (i < bytes.length) {
    let v = 0;
    let shift = 1;
    let ok = false;
    // 可変長を1つ読む。5バイト以上続くのは壊れた入力とみなす。
    for (let k = 0; k < 5 && i < bytes.length; k++) {
      const b = bytes[i++];
      v += (b & 0x7f) * shift;
      if ((b & 0x80) === 0) {
        ok = true;
        break;
      }
      shift *= 128;
    }
    if (!ok) return out.size ? out : new Set();
    const id = prev + v + 1;
    if (id <= prev || id > 9_999_999) return out;
    out.add(id);
    prev = id;
    if (out.size > MAX_ITEMS) return out;
  }
  return out;
}

/** 共有用の URL を組み立てる。空のリストなら null。 */
export function wishUrl(ids: Iterable<number>, base: string): string | null {
  const code = encodeWish(ids);
  if (!code) return null;
  const u = new URL(base);
  u.searchParams.set(WISH_PARAM, code);
  return u.toString();
}

/** いま開いている URL に共有リストが載っていれば取り出す。 */
export function readWishFromUrl(search: string): Set<number> {
  try {
    const code = new URLSearchParams(search).get(WISH_PARAM);
    return code ? decodeWish(code) : new Set();
  } catch {
    return new Set();
  }
}
