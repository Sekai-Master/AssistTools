import { useEffect, useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { useCardData } from "./useCardData";
import { CardSearchModal } from "./CardSearchModal";
import { DeckSlots } from "./DeckSlots";
import { BonusPanel } from "./BonusPanel";
import { PowerPanel } from "./PowerPanel";
import { SkillPanel } from "./SkillPanel";
import { SharePanel } from "./SharePanel";
import { PlayerSettingsPanel } from "./PlayerSettingsPanel";
import { ComparePanel } from "./ComparePanel";
import { SaveToProfile } from "../../components/ui/ProfileBar";
import {
  readPlayerSettings,
  toPlayerState,
  writePlayerSettings,
  type PlayerSettings,
} from "./lib/playerStore";
import { evaluateDeck, type EvalContext } from "./lib/evaluate";
import {
  CUSTOM_EVENT_ID,
  customBonusTables,
  emptyCustomEvent,
  parseCustomEvent,
  type CustomEvent,
} from "./lib/customEvent";
import {
  defaultEventId,
  filledCards,
  isTrainable,
  maxLevelOf,
  type CatalogCard,
} from "./lib/deckInputs";
import {
  DECK_SIZE,
  defaultCardState,
  deleteDeck,
  listDecks,
  readCardStates,
  saveDeck,
  writeCardStates,
  type CardState,
  type CardStates,
  type DeckMode,
  type SavedDeck,
} from "./lib/deckStore";
import { SegmentedControl } from "../../components/ui/SegmentedControl";

/**
 * 編成ビルダー。
 *
 * ── このツールが埋める穴（見失わないこと）─────────────────────────
 * ゲーム内の「おまかせ編成」はイベントボーナスしか見ない。だから
 * **「ボーナスを5%落として総合力を盛った方が、最終的なイベントPtで勝つ」**が出せない。
 * そこがこのツールの存在意義で、編成を並べて最終Ptで比べるところが本体になる。
 * 計算の中身と実測の根拠は docs/deck-builder.md に全部ある。
 *
 * ── 画面の並び ────────────────────────────────────────────────
 * ①編成（保存の切替＋5枠） ②イベントボーナス ③総合力 ④比較 ⑤プレイヤー設定
 * イベントボーナスを先に置いているのは、**プレイヤー固有の入力なしで正確に出せる**
 * のがこちらだから（総合力はエリアアイテム等を入れるまで出ない）。
 */
export default function DeckBuilder() {
  const { data, loading, error } = useCardData();

  const [cardIds, setCardIds] = useState<(number | null)[]>(Array(DECK_SIZE).fill(null));
  const [leaderIndex, setLeaderIndex] = useState(0);
  const [supportBonus, setSupportBonus] = useState("0");
  const [eventId, setEventId] = useState<number | undefined>(undefined);

  /** 所持カードの育成状態。**編成ではなくカードに紐づく**（deckStore.ts）。 */
  const [states, setStates] = useState<CardStates>(() => readCardStates());
  const [pickIndex, setPickIndex] = useState<number | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  /** プレイヤー固有の育成状況。総合力にだけ効く（イベントボーナスには効かない）。 */
  const [player, setPlayer] = useState<PlayerSettings>(() => readPlayerSettings());
  /** 「カスタム」を選んだときの条件（対象メンバー・タイプ・配分）。 */
  const [custom, setCustom] = useState<CustomEvent>(() => emptyCustomEvent());

  const [decks, setDecks] = useState<SavedDeck[]>(() => listDecks());
  const [deckName, setDeckName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  /**
   * ★ チャレンジライブは同じキャラのカードだけで5枚組む＝イベント編成と条件が正反対。
   *   イベントポイントも無いので、ボーナスの計算ごと外す。
   */
  const [mode, setMode] = useState<DeckMode>("event");

  // 既定のイベント（開催中）。データが来た1回だけ決める。
  useEffect(() => {
    if (!data || eventId != null) return;
    setEventId(defaultEventId(data.events, Date.now()));
  }, [data, eventId]);

  const catalog = useMemo(() => new Map((data?.cards ?? []).map((c) => [c.id, c])), [data]);
  const slots = useMemo<(CatalogCard | null)[]>(
    () => cardIds.map((id) => (id == null ? null : (catalog.get(id) ?? null))),
    [cardIds, catalog]
  );
  const cards = useMemo(() => filledCards(slots), [slots]);

  /**
   * 計算はここで1回だけ行い、各パネルへ結果を配る。
   * ★ パネルごとに計算し直すと、比較や編成プロフィールへの保存と**別の値**が出かねない。
   *   同じ画面に違う総合力が並ぶのが一番たちが悪い。
   */
  const ctx = useMemo<EvalContext | null>(
    () =>
      data
        ? {
            catalog,
            states,
            player: toPlayerState(player),
            // カスタムのときは、自分で置いた条件から作った表に差し替える。
            // 計算式（eventBonus）はそのまま＝実在イベントと同じ経路を通る。
            bonusTables:
              eventId === CUSTOM_EVENT_ID
                ? customBonusTables(custom, data.bonusTables)
                : data.bonusTables,
            powerTables: data.powerTables,
            skills: data.skills,
            characterRanks: player.characterRanks,
            // チャレンジライブにイベントボーナスは無い。ここで外すと下流が全部止まる。
            eventId: mode === "challenge" ? undefined : eventId,
          }
        : null,
    [data, catalog, states, player, eventId, custom, mode]
  );
  const evaluated = useMemo(
    () => (ctx ? evaluateDeck(cardIds, leaderIndex, Number(supportBonus) || 0, ctx) : null),
    [ctx, cardIds, leaderIndex, supportBonus]
  );

  /** 育成状態の書き込みは write-through（保存ボタンを押させない）。 */
  const patchState = (cardId: number, patch: Partial<CardState>) => {
    setStates((prev) => {
      const base = prev[cardId];
      if (!base) return prev;
      // masterRank は undefined を「未設定に戻す」意味で使うので、
      // スプレッドで消えないように patch のキー有無で判定する。
      const next: CardStates = { ...prev, [cardId]: { ...base, ...patch } };
      if ("masterRank" in patch && patch.masterRank == null) delete next[cardId].masterRank;
      writeCardStates(next);
      return next;
    });
  };

  const selectCard = (index: number, card: CatalogCard) => {
    setCardIds((prev) => prev.map((id, i) => (i === index ? card.id : id)));
    setPickIndex(null);
    setOpenIndex(index);
    // 初めて触るカードは既定の育成状態で登録する（上限Lv・前後編読了・MRは未設定）。
    setStates((prev) => {
      if (prev[card.id]) return prev;
      const next = { ...prev, [card.id]: defaultCardState(maxLevelOf(card), isTrainable(card)) };
      writeCardStates(next);
      return next;
    });
  };

  const applyDeck = (d: SavedDeck) => {
    setCardIds(d.cardIds);
    setMode(d.mode === "challenge" ? "challenge" : "event");
    setLeaderIndex(d.leaderIndex);
    setSupportBonus(String(d.supportBonus));
    if (d.eventId != null) setEventId(d.eventId);
    // カスタムの条件も一緒に戻す（外部由来なので必ず検証を通す）。
    const saved = parseCustomEvent(d.custom);
    if (saved) setCustom(saved);
    setDeckName(d.name);
    setOpenIndex(null);
  };

  const store = () => {
    const name = deckName.trim() || `編成${decks.length + 1}`;
    setDecks(
      saveDeck({
        name,
        savedAt: Date.now(),
        cardIds,
        leaderIndex,
        mode,
        supportBonus: Number(supportBonus) || 0,
        ...(eventId != null ? { eventId } : {}),
        ...(eventId === CUSTOM_EVENT_ID ? { custom } : {}),
      })
    );
    setDeckName(name);
    setNotice(`「${name}」に保存しました`);
    setTimeout(() => setNotice(null), 2600);
  };

  return (
    <ToolPage morphKey="tool:deck" unit="wxs" title="編成ビルダー" icon="style" wide>
      {error && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {error}
        </div>
      )}

      <Panel title="編成">
        {/* ★ 組める条件が正反対（イベント=同キャラ不可 / チャレライ=同キャラ限定）なので、
            先に選ばせる。ここを取り違えると、そもそも組めない編成の数字が出る。 */}
        <SegmentedControl<DeckMode>
          className="mb-4"
          options={[
            { value: "event", label: "イベント編成" },
            { value: "challenge", label: "チャレンジライブ" },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            // 条件が変わるので枠を空ける（残すと組めない編成のまま数字が出る）。
            setCardIds(Array(DECK_SIZE).fill(null));
            setLeaderIndex(0);
            setOpenIndex(null);
          }}
        />

        {/* 保存済み編成の呼び出しと保存。周回プラン（planStorage）と同じ作法で名前付き。 */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {decks.length > 0 && (
            <select
              aria-label="保存した編成"
              value=""
              onChange={(e) => {
                const d = decks.find((x) => x.name === e.target.value);
                if (d) applyDeck(d);
              }}
              className="neu-inset rounded-lg px-3 py-1.5 text-slate-700"
            >
              <option value="">呼び出す…</option>
              {decks.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <NeuInput
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="編成の名前"
            aria-label="編成の名前"
            className="max-w-40 !py-1.5 text-sm"
          />
          <NeuButton className="!px-3 !py-1.5" onClick={store}>
            保存
          </NeuButton>
          {decks.some((d) => d.name === deckName.trim()) && (
            <NeuButton
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => {
                setDecks(deleteDeck(deckName.trim()));
                setNotice(`「${deckName.trim()}」を削除しました`);
                setTimeout(() => setNotice(null), 2600);
              }}
            >
              削除
            </NeuButton>
          )}
          {notice && (
            <span role="status" className="text-xs text-slate-600">
              {notice}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">カードデータを読み込んでいます…</p>
        ) : (
          <DeckSlots
            slots={slots}
            states={states}
            leaderIndex={leaderIndex}
            openIndex={openIndex}
            onPick={setPickIndex}
            onClear={(i) => setCardIds((prev) => prev.map((id, j) => (j === i ? null : id)))}
            onLeader={setLeaderIndex}
            onToggleOpen={(i) => setOpenIndex((cur) => (cur === i ? null : i))}
            onStateChange={patchState}
          />
        )}

        <p className="mt-3 text-xs text-slate-400">
          育成状態はカードごとに保存され、どの編成に入れても同じ値が使われます。
        </p>
      </Panel>

      {/* ★ 紹介カードはイベントボーナスより上（Nori 指示 2026-08-02）。
          組んだ直後に出したくなるものなので、下まで送らない。 */}
      {evaluated && cards.length > 0 && (
        <SharePanel
          deckName={deckName}
          eventName={data?.events.find((e) => e.id === eventId)?.name}
          eventAsset={data?.events.find((e) => e.id === eventId)?.asset}
          cards={cards}
          states={states}
          evaluated={evaluated}
          leaderCardId={cardIds[leaderIndex] ?? undefined}
          hideBonus={mode === "challenge"}
        />
      )}

      {/* チャレンジライブにイベントポイントは無いので、ボーナスの画面ごと出さない。 */}
      {data && evaluated && mode === "event" && (
        <BonusPanel
          cards={cards}
          result={evaluated.bonus}
          events={data.events}
          eventId={eventId}
          onEventId={setEventId}
          supportBonus={supportBonus}
          onSupportBonus={setSupportBonus}
          custom={custom}
          onCustom={setCustom}
        />
      )}

      {evaluated && (
        <>
          <PowerPanel cards={cards} result={evaluated.power} settings={player} />

          <SkillPanel cards={cards} result={evaluated.skill} />


          {/* ★ 出した値を他のツール（ランキング・アナライザー・稼働時間）へ渡す導線。
              値を出している場所のすぐ隣に置く（ProfileBar.tsx の規約）。 */}
          {cards.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-1">
              <SaveToProfile
                collect={() => ({
                  power: evaluated.power.total,
                  // スキルもカードから出るので一緒に渡す（他のツールの入力がこれで埋まる）。
                  skillLeader: Math.round(evaluated.skill.leader * 10) / 10,
                  skillTotal: Math.round(evaluated.skill.total * 10) / 10,
                  // ★ ボーナスは切り捨てず小数のまま渡す（0.5% が最終Ptに効く）。
                  //   イベント未選択のときは**書かない**（0% として保存すると、
                  //   他のツールが「ボーナス0の編成」として計算してしまう）。
                  ...(evaluated.bonus ? { bonus: evaluated.bonus.total } : {}),
                })}
              />
            </div>
          )}
        </>
      )}

      {ctx && (
        <>
          {compareOpen ? (
            <ComparePanel
              decks={decks}
              current={{ cardIds, leaderIndex, supportBonus: Number(supportBonus) || 0 }}
              ctx={ctx}
              mode={mode}
            />
          ) : (
            // 比較には楽曲データ（400KB超）が要るので、開いたときだけ読みに行く。
            <div className="px-1">
              <NeuButton onClick={() => setCompareOpen(true)}>編成を比べる</NeuButton>
            </div>
          )}
        </>
      )}

      <PlayerSettingsPanel
        settings={player}
        onChange={(next) => {
          setPlayer(next);
          writePlayerSettings(next);
        }}
      />

      {pickIndex != null && data && (
        <CardSearchModal
          cards={data.cards}
          // 選び直している枠自身は除く（自分のキャラで塞がって差し替えられなくなる）。
          others={slots.filter((c, i): c is CatalogCard => !!c && i !== pickIndex)}
          sameCharacterOnly={mode === "challenge"}
          onSelect={(card) => selectCard(pickIndex, card)}
          onClose={() => setPickIndex(null)}
        />
      )}
    </ToolPage>
  );
}
