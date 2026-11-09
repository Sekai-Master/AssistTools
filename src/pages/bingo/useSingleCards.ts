/**
 * 1 枚で遊ぶときのカードの状態（お題・曲名を 1 枚ずつ）と、その保存・リンクの読み込み。
 * BingoGenerator の画面から状態を切り出したもの。以後のカードまわりの追加はここに積む。
 *
 * ★ 楽曲データが届く前（musics が空）に呼ばれた部品は、BingoGenerator が届いたら key を変えて作り直す。
 *   届く前の空のカードで保存を上書きしないよう、保存とリンクの外しは ready を待つ。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BingoMusic, Cell } from "./bingoLogic";
import type { OdaiCell } from "./odaiLogic";
import { CARD_PARAM, type CardKind, type KindedCard, cardCode } from "./bingoShare";
import { saveBingo } from "./bingoStorage";
import { restoreInitial } from "./bingoRestore";

export function useSingleCards(musics: BingoMusic[]) {
  const ready = musics.length > 0;
  const [initial] = useState(() =>
    restoreInitial(musics, new URLSearchParams(window.location.search).get(CARD_PARAM))
  );
  const [kind, setKind] = useState<CardKind>(initial.kind);
  const [odaiCard, setOdaiCard] = useState<OdaiCell[] | null>(initial.odai);
  const [songCard, setSongCard] = useState<Cell[] | null>(initial.song);
  const [pendingLink, setPendingLink] = useState<KindedCard | null>(initial.pendingLink);

  const applyCard = useCallback((kc: KindedCard) => {
    if (kc.kind === "odai") setOdaiCard(kc.card);
    else setSongCard(kc.card);
    setKind(kc.kind);
  }, []);

  // リンクのカードを読んだ後はリンクを外す（開き直したときに、埋めた途中が人のカードで上書きされないように）。
  // ★ ルーターの setSearchParams を使うと同じ /bingo でも画面遷移の演出が走るので、履歴を直接書き換える
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CARD_PARAM)) return;
    url.searchParams.delete(CARD_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, [ready]);

  // 途中経過を残す（楽曲データが届く前の空のカードで上書きしない）
  useEffect(() => {
    if (!ready) return;
    saveBingo({
      kind,
      ...(odaiCard ? { odai: cardCode({ kind: "odai", card: odaiCard }) } : {}),
      ...(songCard ? { song: cardCode({ kind: "song", card: songCard }) } : {}),
    });
  }, [ready, kind, odaiCard, songCard]);

  const current = useMemo<KindedCard | null>(() => {
    if (kind === "odai") return odaiCard ? { kind, card: odaiCard } : null;
    return songCard ? { kind, card: songCard } : null;
  }, [kind, odaiCard, songCard]);

  return {
    /** 開いたときに決めたもの（読めなかったリンクの文言・段の初期値に使う）。 */
    initial,
    kind,
    setKind,
    odaiCard,
    setOdaiCard,
    songCard,
    setSongCard,
    pendingLink,
    setPendingLink,
    applyCard,
    current,
  };
}
