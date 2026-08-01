/**
 * 紹介カードに使う画像（リーダーの立ち絵・イベントのロゴ）。**自前配信**。
 *
 * ── なぜ実行時に外から取らないのか ────────────────────────────
 * 配信元は **Referer 付きの要求を 403 で弾く**（＝他サイトからの直リンクを意図的に
 * 塞いでいる）。ブラウザは画像取得で必ず Referer を送るので、実行時取得は設計上
 * 通らない。`referrerPolicy` で回避はできるが、**先方が明示的に塞いでいるものを
 * 迂回しない**（Nori 判断 2026-08-02）。ビルド時に落として `public/CardDatas/` から配る。
 *
 * ── 守っていること ────────────────────────────────────────────
 * ★ **未公開カード・イベントのアセットは要求しない。** ビルド時の取得は派生データ
 *   （未公開を落としたあとの一覧）を起点にしている（scripts/refresh-card-data.mjs）。
 * ★ **取れなくても機能を止めない。** 立ち絵は★4と birthday しか持っていないので、
 *   ★3以下がリーダーなら null を返し、呼び出し側はサムネイルの簡易版に落ちる。
 * ★ 同一オリジンなので canvas は汚れない（`toBlob`/`toDataURL` が使える）。
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
