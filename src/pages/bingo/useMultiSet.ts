/**
 * まとめて遊ぶ（5 枚まで）のセットの状態と、この端末への保存。
 * 保存の形と読む決まりは multiStorage.ts。ここではコードを楽曲データで読み、画面が使うカードにする。
 *
 * ★ 読めないカード（card が null）も、セットから落とさない。保存には元のコードのまま書き戻す（計画のレビュー G-06）。
 * ★ 楽曲データが届く前の部品は、BingoGenerator が届いたら key を変えて作り直す。届く前に保存を上書きしないよう ready を待つ。
 * ★ 同じブラウザでタブを 2 つ開いていると、後から書いた方が勝つ。ほかのタブが保存を変えたら（storage の出来事）、
 *   読み直して画面に出す（G-08）。どちらの画面を見ているか（open・active）はタブごとのまま残す。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BingoMusic } from "./bingoLogic";
import { isFirstFill } from "./bingoProgress";
import { CARD_PARAM, type KindedCard, cardCode, decodeCardCode } from "./bingoShare";
import type { CardTimes } from "./bingoRestore";
import {
  MAX_MULTI_CARDS,
  MULTI_STORAGE_KEY,
  type SavedMulti,
  type SavedMultiCard,
  cleanCardName,
  isPaused,
  loadMulti,
  newCardId,
  parseSavedMulti,
  saveMulti,
  withPaused,
} from "./multiStorage";

export interface MultiEntry extends SavedMultiCard {
  /** 楽曲データで読んだカード。読めなければ null（「読めないカード」の行で出す）。 */
  card: KindedCard | null;
}

/** 見出しに出す名前。名前が空なら「カード1」のように番号で。 */
export const entryName = (e: Pick<SavedMultiCard, "name">, index: number) => e.name || `カード${index + 1}`;

function decodeOrNull(code: string, musics: readonly BingoMusic[]): KindedCard | null {
  try {
    return decodeCardCode(code, musics);
  } catch {
    return null;
  }
}

/** 新しく足す 1 件。times は 1 枚で遊ぶから写すカードの時刻（同じカードなので、足した時刻・プレイ開始を持ち越す）。 */
function newEntry(kc: KindedCard, now: number, times?: CardTimes | null): SavedMultiCard {
  const addedAt = times && times.addedAt > 0 ? times.addedAt : now;
  return {
    id: newCardId(),
    name: "",
    code: cardCode(kc),
    addedAt,
    ...(times?.startedAt !== undefined ? { startedAt: times.startedAt } : {}),
    paused: [],
  };
}

/**
 * カードを替えた後の保存の 1 件。最初に埋めたとき（替える前が 0 マスで、替えた後が 1 マス以上）にプレイ開始の時刻を付ける。
 * prev は替える前のカード（読めなければ null で、時刻は付けない）。
 * ★ 前は替える前を見ず、時刻の無い途中のカード（埋めた状態で足した・リンクから足した）に、次に替えた時刻が付いた（検分 P 中-1）
 */
function withCard(c: SavedMultiCard, prev: KindedCard | null, kc: KindedCard, now: number): SavedMultiCard {
  const started = c.startedAt ?? (prev && isFirstFill(prev.card, kc.card) ? now : undefined);
  return { ...c, code: cardCode(kc), ...(started !== undefined ? { startedAt: started } : {}) };
}

/** 外した・減ったあとも、見ていたカードを id で追って選び直す（番号で持つと、前のカードを外したときに別のカードが出る）。 */
function followActive(prev: SavedMulti, cards: readonly SavedMultiCard[]): number {
  const id = prev.cards[prev.active]?.id;
  const kept = id === undefined ? -1 : cards.findIndex((c) => c.id === id);
  if (kept >= 0) return kept;
  return Math.max(0, Math.min(prev.active, cards.length - 1));
}

export function useMultiSet(musics: BingoMusic[]) {
  const ready = musics.length > 0;
  const [saved, setSaved] = useState<SavedMulti>(() => {
    const s = loadMulti();
    // リンク（?card=）から開いたときは、そのカードが出る 1 枚で遊ぶで開く
    const linked = typeof window !== "undefined" && new URLSearchParams(window.location.search).has(CARD_PARAM);
    return linked ? { ...s, open: false } : s;
  });
  // ほかのタブの保存を読み直した直後は、書き返さない。
  // ★ 書き返すと、タブごとに違う open・active が入った文字列が往復し、storage の出来事が止まらなくなる。
  //   設定画面で消した保存（newValue が null）を、開いているタブが書き直して復活させることも防ぐ
  const fromOtherTab = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (fromOtherTab.current) {
      fromOtherTab.current = false;
      return;
    }
    saveMulti(saved);
  }, [ready, saved]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage) return;
      // key が null は localStorage.clear()（全部消した）
      if (e.key !== null && e.key !== MULTI_STORAGE_KEY) return;
      const next = parseSavedMulti(e.key === null ? null : e.newValue);
      fromOtherTab.current = true;
      setSaved((cur) => ({ ...next, open: cur.open, active: followActive(cur, next.cards) }));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const entries = useMemo<MultiEntry[]>(
    () => saved.cards.map((c) => ({ ...c, card: ready ? decodeOrNull(c.code, musics) : null })),
    [saved.cards, musics, ready]
  );

  /**
   * まとめて遊ぶを開く／閉じる。初めて開いたとき（セットが空）は、1 枚で遊ぶで見ていたカードを 1 枚目に写す。
   * seedTimes はそのカードの時刻（プレイ開始の印が、まとめて遊ぶに移っても消えないように）。
   */
  const setOpen = useCallback((open: boolean, seed: KindedCard | null = null, seedTimes: CardTimes | null = null) => {
    setSaved((s) => ({
      ...s,
      open,
      cards: open && s.cards.length === 0 && seed ? [newEntry(seed, Date.now(), seedTimes)] : s.cards,
    }));
  }, []);

  const setActive = useCallback((active: number) => setSaved((s) => ({ ...s, active })), []);
  const setCols = useCallback((cols: number) => setSaved((s) => ({ ...s, cols })), []);

  /** カードを足す（上限なら何もしない）。足したカードを選ぶ（スマホで、足したカードがすぐ見えるように）。 */
  const addCard = useCallback((kc: KindedCard) => {
    setSaved((s) =>
      s.cards.length >= MAX_MULTI_CARDS
        ? s
        : { ...s, cards: [...s.cards, newEntry(kc, Date.now())], active: s.cards.length }
    );
  }, []);

  const removeCard = useCallback((id: string) => {
    setSaved((s) => {
      const cards = s.cards.filter((c) => c.id !== id);
      return { ...s, cards, active: followActive(s, cards) };
    });
  }, []);

  const renameCard = useCallback((id: string, name: string) => {
    setSaved((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, name: cleanCardName(name) } : c)) }));
  }, []);

  /**
   * カードを替える（マスの小窓で埋める・戻す・差し替え）。updates は id → 新しいカード。
   * ★ 休止中のカードは変えない。休止はほかのタブでも変わるので、当てる時点の保存で見る（検分 M2 低-2。
   *   小窓を開いたままほかのタブで休止されると、開いていた小窓の［埋める］で休止中のカードが埋まった）
   */
  const updateCards = useCallback(
    (updates: ReadonlyMap<string, KindedCard>) => {
      const now = Date.now();
      setSaved((s) => ({
        ...s,
        cards: s.cards.map((c) => {
          const kc = updates.get(c.id);
          // 替える前のカードは保存のコードから読む（最初に埋めたときかを見るため）
          return kc && !isPaused(c) ? withCard(c, decodeOrNull(c.code, musics), kc, now) : c;
        }),
      }));
    },
    [musics]
  );

  /**
   * いまの保存のカードに対して、変え方（fn）を当てる（遊んだ曲の反映）。画面に描いた時点のカードではなく、
   * 当てる時点のカードを読み直して変えるので、小窓を開いている間にほかのタブが埋めたマスを古い内容で上書きしない。
   * fn が null を返したカード・読めないカード・休止中のカードは変えない（休止もほかのタブで変わりうるので、当てる時点で見る）。
   */
  const applyToCards = useCallback(
    (fn: (kc: KindedCard) => KindedCard | null) => {
      const now = Date.now();
      setSaved((s) => ({
        ...s,
        cards: s.cards.map((c) => {
          if (isPaused(c)) return c;
          const kc = decodeOrNull(c.code, musics);
          const next = kc ? fn(kc) : null;
          return next ? withCard(c, kc, next, now) : c;
        }),
      }));
    },
    [musics]
  );

  /**
   * 1 枚だけに変え方（fn）を当てる（遊んだ曲の一覧から埋める・戻す）。applyToCards と同じく当てる時点の保存を読み直す。
   * skipPaused が偽なら休止中でも当てる（一覧から 1 曲消してマスを戻すのは、休止中のカードにも当てる）。
   * 一覧から埋めるときは真にする（休止中のカードには遊んだ曲を反映しない。持ち主の決定 2）。
   */
  const applyToCard = useCallback(
    (id: string, fn: (kc: KindedCard) => KindedCard | null, skipPaused = false) => {
      const now = Date.now();
      setSaved((s) => ({
        ...s,
        cards: s.cards.map((c) => {
          if (c.id !== id || (skipPaused && isPaused(c))) return c;
          const kc = decodeOrNull(c.code, musics);
          const next = kc ? fn(kc) : null;
          return next ? withCard(c, kc, next, now) : c;
        }),
      }));
    },
    [musics]
  );

  /**
   * そのカードがいま休止しているか。ほかのタブの休止が storage の出来事で届く前でも分かるよう、保存を読み直して見る
   * （保存が読めない・そのカードが無いときは、この画面の状態で見る）。
   */
  const pausedNow = useCallback(
    (id: string) => {
      const latest = loadMulti().cards.find((c) => c.id === id) ?? saved.cards.find((c) => c.id === id);
      return latest !== undefined && isPaused(latest);
    },
    [saved.cards]
  );

  /** 休止する／再開する（区間を保存に足す・閉じる）。 */
  const setPaused = useCallback((id: string, paused: boolean) => {
    const now = Date.now();
    setSaved((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? withPaused(c, paused, now) : c)) }));
  }, []);

  /**
   * セットをまるごと置き換える（中断用の書き出しの読み込み）。まとめて遊ぶで開いたままにする。
   * 戻り値は楽曲データで読めないカードの数（落とさずに持ってきたことを画面で知らせる）。
   */
  const replaceAll = useCallback(
    (next: SavedMulti) => {
      setSaved({ ...next, open: true });
      return next.cards.filter((c) => decodeOrNull(c.code, musics) === null).length;
    },
    [musics]
  );

  return {
    open: saved.open,
    active: saved.active,
    cols: saved.cols,
    entries,
    /** 中断用の書き出しに入れる、保存の形そのまま。 */
    saved,
    full: saved.cards.length >= MAX_MULTI_CARDS,
    setOpen,
    setActive,
    setCols,
    addCard,
    removeCard,
    renameCard,
    updateCards,
    applyToCards,
    applyToCard,
    pausedNow,
    setPaused,
    replaceAll,
  };
}

export type MultiSet = ReturnType<typeof useMultiSet>;
