/**
 * 1 枚で遊ぶときのカードの状態（お題・曲名を 1 枚ずつ）と、その保存・リンクの読み込み。
 * BingoGenerator の画面から状態を切り出したもの。以後のカードまわりの追加はここに積む。
 *
 * カードごとに時刻を持つ（CardTimes）: 足した時刻（遊んだ曲の一覧から埋めるとき、これより前の曲は使わない）と、
 * プレイ開始（最初に埋めたとき。まとめて遊ぶの useMultiSet の withCard と同じ決まり）。
 *
 * ★ 楽曲データが届く前（musics が空）に呼ばれた部品は、BingoGenerator が届いたら key を変えて作り直す。
 *   届く前の空のカードで保存を上書きしないよう、保存とリンクの外しは ready を待つ。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BingoMusic } from "./bingoLogic";
import { progressOf } from "./bingoProgress";
import { CARD_PARAM, type CardKind, type KindedCard, cardCode } from "./bingoShare";
import { saveBingo } from "./bingoStorage";
import { type CardTimes, restoreInitial } from "./bingoRestore";

type OwnOdai = Extract<KindedCard, { kind: "odai" }>["card"];
type OwnSong = Extract<KindedCard, { kind: "song" }>["card"];

interface Owned {
  odai: OwnOdai | null;
  song: OwnSong | null;
  meta: Record<CardKind, CardTimes | null>;
}

const cardOf = (o: Owned, kind: CardKind): KindedCard | null =>
  kind === "odai" ? (o.odai ? { kind, card: o.odai } : null) : o.song ? { kind, card: o.song } : null;

const withCardSet = (o: Owned, kc: KindedCard, times: CardTimes): Owned =>
  kc.kind === "odai" ? { ...o, odai: kc.card, meta: { ...o.meta, odai: times } } : { ...o, song: kc.card, meta: { ...o.meta, song: times } };

/** 埋めたマスのあるカードになったとき、まだプレイ開始が無ければ now を付ける（useMultiSet の withCard と同じ）。 */
function startedTimes(times: CardTimes | null, kc: KindedCard, now: number): CardTimes {
  const base = times ?? { addedAt: 0 };
  if (base.startedAt !== undefined || progressOf(kc.card).filled === 0) return base;
  return { ...base, startedAt: now };
}

/** 保存の時刻の項目（無いものは書かない。0 は分からないなので書かない）。 */
function timeFields(kind: CardKind, t: CardTimes | null) {
  if (!t) return {};
  return {
    ...(t.addedAt > 0 ? { [`${kind}AddedAt`]: t.addedAt } : {}),
    ...(t.startedAt !== undefined ? { [`${kind}StartedAt`]: t.startedAt } : {}),
  };
}

export function useSingleCards(musics: BingoMusic[]) {
  const ready = musics.length > 0;
  const [initial] = useState(() =>
    restoreInitial(musics, new URLSearchParams(window.location.search).get(CARD_PARAM))
  );
  const [kind, setKind] = useState<CardKind>(initial.kind);
  const [owned, setOwned] = useState<Owned>({ odai: initial.odai, song: initial.song, meta: initial.meta });
  // リンクのカードを「見るだけ」で出しているとき、そのカード（見る間に埋めたマスごと）。保存には入れない
  const [viewing, setViewing] = useState<KindedCard | null>(initial.viewing);
  // リンクのカードを開いた知らせを出す種類（閉じる・入れ替える・作るで消える）
  const [linked, setLinked] = useState<CardKind | null>(initial.linked);

  /**
   * 自分のカードにする（作る・コードから開く・見ていたリンクのカードで遊ぶ）。リンクの知らせと「見るだけ」は終える。
   * 同じカード（同じコード）なら時刻はそのまま。別のカードなら足した時刻を今にし、プレイ開始は消える（始める前に戻る）。
   */
  const applyCard = useCallback((kc: KindedCard) => {
    const now = Date.now();
    setOwned((o) => {
      const prev = cardOf(o, kc.kind);
      const same = prev !== null && cardCode(prev) === cardCode(kc);
      return withCardSet(o, kc, same ? (o.meta[kc.kind] ?? { addedAt: now }) : { addedAt: now });
    });
    setKind(kc.kind);
    setViewing(null);
    setLinked(null);
  }, []);

  /**
   * 自分のカードを変える（埋める・戻す・差し替え・遊んだ曲の一覧から埋める／戻す）。見るだけの間でも自分のカードを変える。
   * fn は今の自分のカードを受け取り、変えないなら null。最初に埋めたときにプレイ開始の時刻が付く。
   * ★ fn は setState の中で呼ぶので、純粋にする（StrictMode では 2 回呼ばれる。保存や記録は呼ぶ側で 1 回だけ）

   */
  const updateOwn = useCallback((k: CardKind, fn: (kc: KindedCard) => KindedCard | null) => {
    const now = Date.now();
    setOwned((o) => {
      const prev = cardOf(o, k);
      const next = prev ? fn(prev) : null;
      return next && next.kind === k ? withCardSet(o, next, startedTimes(o.meta[k], next, now)) : o;
    });
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
  // ★ 見るだけのカード（viewing）はここに入らない。見る間に埋めても、自分のカード（owned）は変わらない
  useEffect(() => {
    if (!ready) return;
    saveBingo({
      kind,
      ...(owned.odai ? { odai: cardCode({ kind: "odai", card: owned.odai }), ...timeFields("odai", owned.meta.odai) } : {}),
      ...(owned.song ? { song: cardCode({ kind: "song", card: owned.song }), ...timeFields("song", owned.meta.song) } : {}),
    });
  }, [ready, kind, owned]);

  /** 自分のカード（見ている種類の）。 */
  const own = useMemo<KindedCard | null>(() => cardOf(owned, kind), [owned, kind]);
  // 種類を切り替えると見るだけのカードは隠れ、戻すとまた出る
  const viewingNow = viewing && viewing.kind === kind ? viewing : null;

  /** 画面のカードを替える（埋める・戻す・差し替え）。見るだけの間は、見ているカードだけを替える（保存しない）。 */
  const changeCard = useCallback(
    (kc: KindedCard) => {
      if (viewingNow) setViewing(kc);
      else updateOwn(kc.kind, () => kc);
    },
    [viewingNow, updateOwn]
  );

  return {
    /** 開いたときに決めたもの（読めなかったリンクの文言・段の初期値に使う）。 */
    initial,
    kind,
    setKind,
    odaiCard: owned.odai,
    songCard: owned.song,
    /** 自分のカードの時刻（種類ごと）。 */
    meta: owned.meta,
    own,
    /** 画面に出すカード（見るだけのカードがあればそれ、無ければ自分のカード）。 */
    current: viewingNow ?? own,
    /** 見るだけで出しているリンクのカード（この種類のとき）。 */
    viewing: viewingNow,
    /** リンクのカードを開いた知らせを、いまの種類で出すか。 */
    linkShown: linked === kind,
    changeCard,
    applyCard,
    updateOwn,
    dismissLink,
  };
}
