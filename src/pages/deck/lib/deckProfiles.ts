/**
 * 編成ビルダーの編成 → 全ツール共通の「編成プロフィール」。
 *
 * ── なぜ要るか ────────────────────────────────────────────────
 * 保存した編成（`sekaimaster:deck:decks:v1`）が持っているのは**カード5枚の並び**で、
 * 総合力・ボーナス・スキルの内部値は入っていない。それらは編成ビルダーが計算して
 * プロフィール（`sekaimaster:profiles:v1`）へ書いたときに初めて他のツールから読める。
 *
 * ★ **バックアップの取り込みはここを素通りする。** 編成ビルダーの編成は復元されるのに、
 *   プロフィールが無ければ他のツールからは1件も呼べない（＝取り込んだのに使えない）。
 *   別端末から移した人・編成だけ受け取った人が必ずここに落ちる。
 *   そのため「保存済みの編成をまとめてプロフィールへ書き出す」経路をここに置く。
 *
 * ★ 計算の文脈（EvalContext）の組み立ても**ここが正本**。DeckBuilder の画面と
 *   一括変換で別々に組むと、同じ編成なのに開いたときと違う数字がプロフィールに入る。
 */
import { evaluateDeck, type DeckEval, type EvalContext } from "./evaluate";
import {
  CUSTOM_EVENT_ID,
  customBonusTables,
  emptyCustomEvent,
  parseCustomEvent,
  type CustomEvent,
} from "./customEvent";
import { isTrainable, maxLevelOf, type CatalogCard } from "./deckInputs";
import { toPlayerState, type PlayerSettings } from "./playerStore";
import { defaultCardState, type CardStates, type DeckMode, type SavedDeck } from "./deckStore";
import type { CardData } from "../useCardData";
import {
  getActiveId,
  setActiveProfile,
  upsertProfileByName,
  type Profile,
} from "../../../lib/profiles";

/** 計算に要る、画面に依らない材料。 */
export interface DeckEvalBase {
  data: CardData;
  catalog: Map<number, CatalogCard>;
  states: CardStates;
  player: PlayerSettings;
}

/** どのイベント・どのモードとして評価するか。 */
export interface DeckEvalTarget {
  eventId: number | undefined;
  custom: CustomEvent;
  mode: DeckMode;
}

/** 評価の文脈を組む。**画面と一括変換で共有する**（別々に組むと数字が割れる）。 */
export function buildEvalContext(base: DeckEvalBase, target: DeckEvalTarget): EvalContext {
  const { data, catalog, states, player } = base;
  const { eventId, custom, mode } = target;
  const event = data.events.find((e) => e.id === eventId);
  return {
    catalog,
    states,
    player: toPlayerState(player),
    // カスタムのときは、自分で置いた条件から作った表に差し替える。
    // 計算式（eventBonus）はそのまま＝実在イベントと同じ経路を通る。
    bonusTables:
      eventId === CUSTOM_EVENT_ID ? customBonusTables(custom, data.bonusTables) : data.bonusTables,
    powerTables: data.powerTables,
    skills: data.skills,
    characterRanks: player.characterRanks,
    // チャレンジライブにイベントボーナスは無い。ここで外すと下流が全部止まる。
    eventId: mode === "challenge" ? undefined : eventId,
    // ★ ワールドリンクでは編成の属性の種類数にボーナスが乗る（最大5種類125%）。
    //   チャレンジライブとカスタム条件では効かせない（実在イベントの制約から外れる）。
    worldBloom: mode !== "challenge" && eventId !== CUSTOM_EVENT_ID && event?.type === "world_bloom",
    // ★ 総合力の上限はイベント固有（ワールドリンク第3弾のみ）。同じ理由でここも外す。
    powerLimit: mode === "challenge" || eventId === CUSTOM_EVENT_ID ? undefined : event?.powerLimit,
  };
}

/** 評価結果 → プロフィールに置く値。**この対応もここが正本。** */
export function profileValuesFromEval(ev: DeckEval): Partial<Profile> {
  return {
    source: "deck",
    power: ev.power.total,
    skillLeader: Math.round(ev.skill.leader * 10) / 10,
    skillTotal: Math.round(ev.skill.total * 10) / 10,
    // ボーナスは切り捨てず小数のまま（0.5% が最終Ptに効く）。
    ...(ev.bonus ? { bonus: ev.bonus.total } : {}),
  };
}

/**
 * 育成状態が無いカードに既定値を入れた状態を返す（元は書き換えない）。
 *
 * ★ **これを通さないと、開いたときと違う数字がプロフィールに入る。**
 *   評価側は状態が無いカードをスキルLv1などの控えめな既定で計算するが、
 *   画面で編成を開くと既定値（最大レベル・特訓済み）が書き込まれてから計算される。
 *   同じ編成で2つの答えが出るのが一番たちが悪いので、書き出す側も同じ既定に揃える。
 */
export function withDefaultStates(
  cardIds: readonly (number | null)[],
  catalog: Map<number, CatalogCard>,
  states: CardStates
): CardStates {
  let next = states;
  for (const id of cardIds) {
    if (id == null || next[id]) continue;
    const card = catalog.get(id);
    if (!card) continue;
    next = { ...next, [id]: defaultCardState(maxLevelOf(card), isTrainable(card)) };
  }
  return next;
}

/**
 * 保存された編成に無い項目を、画面を開いたときと同じ既定で埋めるための現在値。
 *
 * ★ **これが無いと「開いたときと違う数字」になる。** 古い保存にはイベントが
 *   入っていないことがあり（`eventId` を持つ前の版）、ビルダーで開くと
 *   いま選ばれているイベントのボーナスが乗るのに、一括変換ではボーナス無しで
 *   書き込まれてしまう（実際そうなっていた）。
 */
export interface DeckEvalFallback {
  eventId: number | undefined;
  custom: CustomEvent;
}

/** その編成をプロフィールに書いたときの値。カードが1枚も無ければ null。 */
export function deckProfileValues(
  deck: SavedDeck,
  base: DeckEvalBase,
  fallback?: DeckEvalFallback
): { values: Partial<Profile>; states: CardStates } | null {
  if (!deck.cardIds.some((id) => id != null)) return null;
  const states = withDefaultStates(deck.cardIds, base.catalog, base.states);
  const ctx = buildEvalContext(
    { ...base, states },
    {
      // applyDeck と同じ規則: 保存に無ければ、いま選んでいるイベントのまま。
      eventId: deck.eventId ?? fallback?.eventId,
      custom: parseCustomEvent(deck.custom) ?? fallback?.custom ?? emptyCustomEvent(),
      mode: deck.mode === "challenge" ? "challenge" : "event",
    }
  );
  const ev = evaluateDeck(deck.cardIds, deck.leaderIndex, deck.supportBonus || 0, ctx);
  return { values: profileValuesFromEval(ev), states };
}

/** まだプロフィールになっていない編成。 */
export function decksWithoutProfile(
  decks: readonly SavedDeck[],
  profiles: readonly Profile[]
): SavedDeck[] {
  return decks.filter(
    (d) => !profiles.some((p) => p.source === "deck" && p.name === d.name.trim())
  );
}

/**
 * 保存済みの編成をプロフィールへ書き出す。**書けた件数と、埋めた育成状態を返す。**
 *
 * 使用中の編成は勝手に切り替えない（upsertProfileByName が最後に書いたものを
 * 使用中にするので、元に戻す）。
 */
export function syncDecksToProfiles(
  decks: readonly SavedDeck[],
  base: DeckEvalBase,
  fallback?: DeckEvalFallback
): { written: number; states: CardStates } {
  const before = getActiveId();
  let states = base.states;
  let written = 0;
  for (const deck of decks) {
    const result = deckProfileValues(deck, { ...base, states }, fallback);
    if (!result) continue;
    states = result.states;
    upsertProfileByName(deck.name, result.values);
    written++;
  }
  if (before) setActiveProfile(before);
  return { written, states };
}
