/**
 * まとめて遊ぶ（5 枚まで）のセットの状態と、この端末への保存。
 * 保存の形と読む決まりは multiStorage.ts。ここではコードを楽曲データで読み、画面が使うカードにする。
 *
 * ★ 読めないカード（card が null）も、セットから落とさない。保存には元のコードのまま書き戻す（計画のレビュー G-06）。
 * ★ 楽曲データが届く前の部品は、BingoGenerator が届いたら key を変えて作り直す。届く前に保存を上書きしないよう ready を待つ。
 * ★ 同じブラウザでタブを 2 つ開いていると、後から書いた方が勝つ。ほかのタブが保存を変えたら（storage の出来事）、
 *   読み直して画面に出す（G-08）。どちらの画面を見ているか（open・active）はタブごとのまま残す。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BingoMusic } from "./bingoLogic";
import { progressOf } from "./bingoProgress";
import { CARD_PARAM, type KindedCard, cardCode, decodeCardCode } from "./bingoShare";
import {
  MAX_MULTI_CARDS,
  MULTI_STORAGE_KEY,
  type SavedMulti,
  type SavedMultiCard,
  cleanCardName,
  loadMulti,
  newCardId,
  parseSavedMulti,
  saveMulti,
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

function newEntry(kc: KindedCard, now: number): SavedMultiCard {
  return { id: newCardId(), name: "", code: cardCode(kc), addedAt: now, paused: [] };
}

/** カードを替えた後の保存の 1 件。最初に埋めたとき（埋めたマスが 0 から増えた）にプレイ開始の時刻を付ける。 */
function withCard(c: SavedMultiCard, kc: KindedCard, now: number): SavedMultiCard {
  const started = c.startedAt ?? (progressOf(kc.card).filled > 0 ? now : undefined);
  return { ...c, code: cardCode(kc), ...(started !== undefined ? { startedAt: started } : {}) };
}

export function useMultiSet(musics: BingoMusic[]) {
  const ready = musics.length > 0;
  const [saved, setSaved] = useState<SavedMulti>(() => {
    const s = loadMulti();
    // リンク（?card=）から開いたときは、そのカードが出る 1 枚で遊ぶで開く
    const linked = typeof window !== "undefined" && new URLSearchParams(window.location.search).has(CARD_PARAM);
    return linked ? { ...s, open: false } : s;
  });

  useEffect(() => {
    if (ready) saveMulti(saved);
  }, [ready, saved]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MULTI_STORAGE_KEY) return;
      const next = parseSavedMulti(e.newValue);
      setSaved((cur) => ({ ...next, open: cur.open, active: Math.min(cur.active, Math.max(0, next.cards.length - 1)) }));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const entries = useMemo<MultiEntry[]>(
    () => saved.cards.map((c) => ({ ...c, card: ready ? decodeOrNull(c.code, musics) : null })),
    [saved.cards, musics, ready]
  );

  /** まとめて遊ぶを開く／閉じる。初めて開いたとき（セットが空）は、1 枚で遊ぶで見ていたカードを 1 枚目に写す。 */
  const setOpen = useCallback((open: boolean, seed: KindedCard | null = null) => {
    setSaved((s) => ({
      ...s,
      open,
      cards: open && s.cards.length === 0 && seed ? [newEntry(seed, Date.now())] : s.cards,
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
      return { ...s, cards, active: Math.max(0, Math.min(s.active, cards.length - 1)) };
    });
  }, []);

  const renameCard = useCallback((id: string, name: string) => {
    setSaved((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, name: cleanCardName(name) } : c)) }));
  }, []);

  /** カードを替える（埋める・戻す・差し替え・遊んだ曲の反映）。updates は id → 新しいカード。 */
  const updateCards = useCallback((updates: ReadonlyMap<string, KindedCard>) => {
    const now = Date.now();
    setSaved((s) => ({
      ...s,
      cards: s.cards.map((c) => {
        const kc = updates.get(c.id);
        return kc ? withCard(c, kc, now) : c;
      }),
    }));
  }, []);

  return {
    open: saved.open,
    active: saved.active,
    cols: saved.cols,
    entries,
    full: saved.cards.length >= MAX_MULTI_CARDS,
    setOpen,
    setActive,
    setCols,
    addCard,
    removeCard,
    renameCard,
    updateCards,
  };
}

export type MultiSet = ReturnType<typeof useMultiSet>;
