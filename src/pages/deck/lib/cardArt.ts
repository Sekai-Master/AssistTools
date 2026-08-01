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

const ART_BASE = "https://storage.sekai.best/sekai-jp-assets/character/member";

/**
 * 立ち絵の URL。特訓後の絵があるのは特訓の加算を持つカードだけ。
 *
 * ★ `?cors` を付けているのは配信元のキャッシュ対策。あちらは Origin をそのまま返す
 *   設定だが `Vary: Origin` を返さないので、**Origin 無しで取られた応答が
 *   キャッシュに乗っていると、こちらの CORS 要求にも許可ヘッダが返ってこない**
 *  （実際にブラウザから叩いて弾かれた）。別 URL にしてキャッシュを分ける。
 *   それでも駄目なときは呼び出し側が簡易版へ落ちるので、機能は止まらない。
 */
export function cardArtUrl(card: CatalogCard, trained: boolean): string | null {
  if (!card.asset) return null;
  return `${ART_BASE}/${card.asset}/card_${trained ? "after_training" : "normal"}.webp?cors`;
}

/**
 * 立ち絵を1枚読む。**失敗・時間切れは null**（例外にしない＝呼び出し側が分岐しやすい）。
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
    img.crossOrigin = "anonymous";
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
