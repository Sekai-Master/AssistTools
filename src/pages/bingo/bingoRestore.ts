/**
 * 開いたときのカードを決める（この端末の途中経過・リンク・初めて開いたとき）。
 */
import type { BingoMusic, Cell } from "./bingoLogic";
import { type OdaiCell, buildOdaiCandidates, buildOdaiCard } from "./odaiLogic";
import { progressOf } from "./bingoProgress";
import { type CardKind, type KindedCard, cardCode, decodeCardCode } from "./bingoShare";
import { type SavedBingo, loadBingo } from "./bingoStorage";

export const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export interface Initial {
  kind: CardKind;
  odai: OdaiCell[] | null;
  song: Cell[] | null;
  error: string | null;
  /**
   * 埋めた途中のカードと同じ種類のリンクを開いたとき、そのリンクのカード。保存せずに「見るだけ」で出し、
   * 入れ替える・まとめて遊ぶに足すは本人が選ぶ（持ち主の決定 2。前は「いまのカードは消えます」で入れ替えるしかなかった）。
   */
  viewing: KindedCard | null;
  /** リンクのカードを読めたときの種類（見るだけ・そのまま開いた のどちらも）。開いたことを 1 行で知らせる。 */
  linked: CardKind | null;
}

/** 同じ種類の今のカードを、確かめずに置き換えてよいか（埋めたマスが無い・同じカード）。 */
export function canReplaceSilently(existing: KindedCard["card"] | null, next: KindedCard): boolean {
  if (!existing || progressOf(existing).filled === 0) return true;
  return cardCode({ kind: next.kind, card: existing } as KindedCard) === cardCode(next);
}

/**
 * 開いたときのカード: この端末の途中経過を戻し、リンク（?card=）があればそれを出す。
 * 埋めた途中の同じ種類のカードがあれば、リンクのカードは置き換えずに「見るだけ」（viewing）にする。
 * 壊れた・古い保存は黙って捨てる。読めないリンクは文言を出し、新しいカードを作れる状態にする。
 * どちらも無い（初めて開いた）ときは、すぐ遊べるようにお題ビンゴのカードを 1 枚作っておく。
 */
export function restoreInitial(
  musics: BingoMusic[],
  linked: string | null,
  saved: SavedBingo | null = loadBingo()
): Initial {
  const init: Initial = { kind: "odai", odai: null, song: null, error: null, viewing: null, linked: null };
  if (musics.length === 0) return init;
  const put = (kc: KindedCard) => {
    if (kc.kind === "odai") init.odai = kc.card;
    else init.song = kc.card;
  };
  if (saved) {
    for (const code of [saved.odai, saved.song]) {
      if (!code) continue;
      try {
        put(decodeCardCode(code, musics));
      } catch {
        /* 無視 */
      }
    }
    init.kind = saved.kind;
  }
  if (linked !== null) {
    try {
      const kc = decodeCardCode(linked, musics);
      if (canReplaceSilently(kc.kind === "odai" ? init.odai : init.song, kc)) put(kc);
      else init.viewing = kc;
      init.kind = kc.kind;
      init.linked = kc.kind;
    } catch (e) {
      init.error = `リンクのカードを読めませんでした。${errorText(e, "コードの形が違います。")}`;
    }
  }
  if (!saved && linked === null) {
    try {
      init.odai = buildOdaiCard(buildOdaiCandidates(musics));
    } catch {
      /* 作れなければ「新しいカードを作る」から */
    }
  }
  return init;
}
