/**
 * カードの立ち絵（紹介カードの背景に使う1枚だけ）。
 *
 * ── なぜ実行時に外から取るのか ────────────────────────────────
 * 立ち絵は1枚90〜400KB。全カードぶん持つと 50〜200MB になり、
 * 自前配信しているサムネイル（2363枚で9.4MB）とは桁が違う。
 * **紹介カードで要るのはリーダーの1枚だけ**なので、そこだけ都度取りに行く。
 * Nori の判断（2026-08-02）。
 *
 * ── 守っていること ────────────────────────────────────────────
 * ★ **未公開カードのアセットは要求しない。** URL は配信カタログにあるカードの
 *   asset 名からしか組み立てない。カタログはビルド時に未公開を落としてあるので、
 *   ここを起点にする限り解禁前のアセットを叩くことはない（要求ログ自体が痕跡になる）。
 * ★ **取れなくても機能を止めない。** 失敗・遅延はそのまま簡易版（サムネイルだけの
 *   紹介カード）に落ちる。外部の生死にこのツールの機能を握らせない。
 * ★ **canvas を汚さない。** crossOrigin="anonymous" で読む。これを付けずに描くと
 *   canvas が tainted になり、`toBlob`/`toDataURL` が SecurityError で落ちて
 *   **画像の保存もコピーもできなくなる**（配信元が CORS を返すことは確認済み）。
 */
import type { CatalogCard } from "./deckInputs";

const ART_BASE = `${import.meta.env.BASE_URL}CardDatas/art/`;
const LOGO_BASE = `${import.meta.env.BASE_URL}CardDatas/logo/`;

/**
 * 立ち絵の URL（自前配信）。
 *
 * ★★ **実行時に配信元から直接取ることはできない。** ★★
 *   あちらは Referer 付きの要求を 403 で弾く（＝他サイトからの直リンクを意図的に
 *   塞いでいる）。ブラウザは画像取得で必ず Referer を送るので、実行時取得は
 *   設計上通らない。`referrerPolicy` で回避はできるが、**先方が明示的に塞いでいる
 *   ものを迂回しない**（Nori 判断 2026-08-02）。ビルド時に落として自前で配る。
 *
 * ★ 持っているのは★4と birthday だけ（容量）。それ以外は null を返すので、
 *   呼び出し側はサムネイルの簡易版に落ちる。
 */
export function cardArtUrl(card: CatalogCard, trained: boolean): string | null {
  if (!card.asset) return null;
  if (card.rarity !== "4" && card.rarity !== "birthday") return null;
  return `${ART_BASE}${card.asset}_${trained ? "after_training" : "normal"}.webp`;
}

/** イベントロゴの URL（自前配信）。アセット名を持たないイベントは null。 */
export function eventLogoUrl(asset: string | undefined): string | null {
  return asset ? `${LOGO_BASE}${asset}.webp` : null;
}

/**
 * 画像を1枚読む。**失敗・時間切れは null**（例外にしない＝呼び出し側が分岐しやすい）。
 *
 * @param timeoutMs これを過ぎたら諦める。押してから画像が出るまでの待ち時間なので、
 *                  長く待つより簡易版で出す方がよい。
 */
export function loadCardArt(url: string, timeoutMs = 6000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (v: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = url;
  });
}
