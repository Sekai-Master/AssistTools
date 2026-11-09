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
  // リンクのカードを「見るだけ」で出しているとき、そのカード（見る間に埋めたマスごと）。保存には入れない
  const [viewing, setViewing] = useState<KindedCard | null>(initial.viewing);
  // リンクのカードを開いた知らせを出す種類（閉じる・入れ替える・作るで消える）
  const [linked, setLinked] = useState<CardKind | null>(initial.linked);

  /** 自分のカードにする（作る・コードから開く・見ていたリンクのカードで遊ぶ）。リンクの知らせと「見るだけ」は終える。 */
  const applyCard = useCallback((kc: KindedCard) => {
    if (kc.kind === "odai") setOdaiCard(kc.card);
    else setSongCard(kc.card);
    setKind(kc.kind);
    setViewing(null);
    setLinked(null);
  }, []);

  /** リンクの知らせを閉じる（「見るだけ」なら見るのをやめて、自分のカードに戻る）。 */
  const dismissLink = useCallback(() => {
    setViewing(null);
    setLinked(null);
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

  // 途中経過を残す（楽曲データが届く前の空のカードで上書きしない）。
  // ★ 見るだけのカード（viewing）はここに入らない。見る間に埋めても、自分のカード（odaiCard・songCard）は変わらない
  useEffect(() => {
    if (!ready) return;
    saveBingo({
      kind,
      ...(odaiCard ? { odai: cardCode({ kind: "odai", card: odaiCard }) } : {}),
      ...(songCard ? { song: cardCode({ kind: "song", card: songCard }) } : {}),
    });
  }, [ready, kind, odaiCard, songCard]);

  /** 自分のカード（見ている種類の）。 */
  const own = useMemo<KindedCard | null>(() => {
    if (kind === "odai") return odaiCard ? { kind, card: odaiCard } : null;
    return songCard ? { kind, card: songCard } : null;
  }, [kind, odaiCard, songCard]);
  // 種類を切り替えると見るだけのカードは隠れ、戻すとまた出る
  const viewingNow = viewing && viewing.kind === kind ? viewing : null;

  /** 画面のカードを替える（埋める・戻す・差し替え）。見るだけの間は、見ているカードだけを替える（保存しない）。 */
  const changeCard = useCallback(
    (kc: KindedCard) => {
      if (viewingNow) setViewing(kc);
      else if (kc.kind === "odai") setOdaiCard(kc.card);
      else setSongCard(kc.card);
    },
    [viewingNow]
  );

  return {
    /** 開いたときに決めたもの（読めなかったリンクの文言・段の初期値に使う）。 */
    initial,
    kind,
    setKind,
    odaiCard,
    songCard,
    own,
    /** 画面に出すカード（見るだけのカードがあればそれ、無ければ自分のカード）。 */
    current: viewingNow ?? own,
    /** 見るだけで出しているリンクのカード（この種類のとき）。 */
    viewing: viewingNow,
    /** リンクのカードを開いた知らせを、いまの種類で出すか。 */
    linkShown: linked === kind,
    changeCard,
    applyCard,
    dismissLink,
  };
}
