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
import { getActiveProfile, upsertProfileByName, useProfiles } from "../../lib/profiles";
import { useRankingMusics } from "../ranking/useRankingMusics";
import { DEFAULT_PARAMS, OVERHEAD_BY_LIVE } from "../ranking/lib/efficiency";
import { ENVY_ID } from "../analyzer/lib/constants";
import { readPlayerSettings, writePlayerSettings, type PlayerSettings } from "./lib/playerStore";
import { evaluateDeck, type EvalContext } from "./lib/evaluate";
import {
  buildEvalContext,
  deckProfileValues,
  decksWithoutProfile,
  profileValuesFromEval,
  syncDecksToProfiles,
  withDefaultStates,
  type DeckEvalBase,
} from "./lib/deckProfiles";
import { swapCandidates } from "./lib/swap";
import {
  CUSTOM_EVENT_ID,
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
  /** 台帳にあるカード＝「持っている」と登録済みのカード。 */
  const ownedIds = useMemo(() => new Set(Object.keys(states).map(Number)), [states]);

  /**
   * 計算はここで1回だけ行い、各パネルへ結果を配る。
   * ★ パネルごとに計算し直すと、比較や編成プロフィールへの保存と**別の値**が出かねない。
   *   同じ画面に違う総合力が並ぶのが一番たちが悪い。
   */
  /** 計算の材料。一括変換（保存編成→プロフィール）と同じものを渡す。 */
  const evalBase = useMemo<DeckEvalBase | null>(
    () => (data ? { data, catalog, states, player } : null),
    [data, catalog, states, player],
  );
  const ctx = useMemo<EvalContext | null>(
    () => (evalBase ? buildEvalContext(evalBase, { eventId, custom, mode }) : null),
    [evalBase, eventId, custom, mode],
  );
  const profiles = useProfiles();
  /** ビルダーには有るのに、まだプロフィール（＝他ツールの受け口）になっていない編成。 */
  const unlinkedDecks = useMemo(
    () => decksWithoutProfile(decks, profiles),
    [decks, profiles],
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

  /**
   * 「持っている」だけ登録する（編成には入れない）。
   * ★ 台帳が育つほど差し替え候補の母数が増える。全部入力させる設計にはせず、
   *   カードを探しているついでに1枚ずつ足せる形にしてある。
   */
  const toggleOwned = (card: CatalogCard) => {
    setStates((prev) => {
      const next = { ...prev };
      if (next[card.id]) delete next[card.id];
      else next[card.id] = defaultCardState(maxLevelOf(card), isTrainable(card));
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

  /** 台帳に無いカードを既定の育成状態で登録する（無いと編集パネルが開かない）。 */
  const ensureStates = (ids: (number | null)[]) => {
    setStates((prev) => {
      // 既定値の埋め方は lib/deckProfiles と共有する（別々に持つと、開いたときと
      // 一括書き出しで違う数字が出る）。
      const next = withDefaultStates(ids, catalog, prev);
      if (next === prev) return prev;
      writeCardStates(next);
      return next;
    });
  };

  const applyDeck = (d: SavedDeck) => {
    setCardIds(d.cardIds);
    // ★ 編成だけ取り込んで育成状態が無い端末（バックアップの部分取り込み等）でも、
    //   タップして直せる状態にしておく。無いとカードの編集パネルが開かず、
    //   楽観的な既定値のまま計算だけ走る。
    ensureStates(d.cardIds);
    setMode(d.mode === "challenge" ? "challenge" : "event");
    setLeaderIndex(d.leaderIndex);
    setSupportBonus(String(d.supportBonus));
    if (d.eventId != null) setEventId(d.eventId);
    // カスタムの条件も一緒に戻す（外部由来なので必ず検証を通す）。
    const saved = parseCustomEvent(d.custom);
    if (saved) setCustom(saved);
    setDeckName(d.name);
    setOpenIndex(null);
    /*
     * ★ 呼び出したら**その場でプロフィールにも書く。**
     *   保存時にしか書いていなかったので、バックアップから取り込んだ編成は
     *   ビルダーには並ぶのに他のツールからは1件も呼べなかった。
     *   開いた編成は「いま使っている編成」なので、ここで揃えるのが自然。
     */
    if (evalBase) {
      const result = deckProfileValues(d, evalBase, { eventId, custom });
      if (result) upsertProfileByName(d.name, result.values);
    }
  };

  /**
   * 楽曲データ（難易度別で428KB）。
   * ★ **カード選択を開いた時点**から読み始める。差し替え候補の判断で一番効くのは
   *   Δ最終Pt で、それを出すには曲が要るため。開くまでは読まない（この画面の
   *   初期表示を重くしない）。比較を開いたときも同じデータを使い回す。
   */
  const music = useRankingMusics(pickIndex != null || compareOpen);

  /** 差し替え候補の基準にする曲（基礎点100の独りんぼエンヴィー・MASTER）。 */
  const swapEntry = useMemo(
    () =>
      music.entries.find((e) => e.musicId === ENVY_ID && e.difficulty === "master") ??
      music.entries.find((e) => e.musicId === ENVY_ID) ??
      null,
    [music.entries]
  );
  const swapTaki = getActiveProfile()?.taki ?? DEFAULT_PARAMS.taki;

  /**
   * カード選択を開いている枠の「差し替え候補」。
   *
   * ★ 候補は**台帳にあるカード＝持っている証拠があるカード**だけ。総当たりをやるには
   *   所持カード全部の育成状態が要り、入力コストが価値を上回る（lib/swap.ts 冒頭）。
   * ★ 他の枠に入っているキャラは編成できないので、ここで外す。
   * ★ 最終Pt の差は楽曲データが要るので、比較を開いていないうちは出さない
   *  （総合力とボーナスの差だけになる）。
   */
  const swap = useMemo(() => {
    if (pickIndex == null || !ctx) return undefined;
    const usedChars = new Set(
      slots.filter((c, i) => !!c && i !== pickIndex).map((c) => (c as CatalogCard).ch)
    );
    const candidates = Object.keys(states)
      .map((id) => catalog.get(Number(id)))
      .filter((c): c is CatalogCard => !!c)
      .filter((c) =>
        mode === "challenge"
          ? // チャレンジライブは同キャラ限定。他の枠のキャラに揃える。
            usedChars.size === 0 || usedChars.has(c.ch)
          : !usedChars.has(c.ch)
      );
    if (candidates.length === 0) return undefined;

    const { rows } = swapCandidates(cardIds, pickIndex, candidates, ctx, {
      leaderIndex,
      supportBonus: Number(supportBonus) || 0,
      // 曲が読めていれば最終Ptの差まで出す（読めるまでは総合力とボーナスの差だけ）。
      entry: swapEntry,
      cond: {
        live: "multi",
        taki: swapTaki,
        overheadSec: OVERHEAD_BY_LIVE.multi,
        // 上限帯では「総合力を盛る」候補が1点にもならない。入れないと推奨が逆になる。
        powerLimit: ctx.powerLimit,
      },
    });
    // 候補が1枚も残らないなら絞り込み自体を出さない（空の一覧を見せない）。
    if (rows.length === 0) return undefined;
    return {
      rows: new Map(
        rows.map((r) => [r.cardId, { deltaPower: r.deltaPower, deltaBonus: r.deltaBonus, deltaPt: r.deltaPt }])
      ),
      order: rows.map((r) => r.cardId),
      ...(swapEntry ? { basis: `協力・${swapEntry.title}・焚き${swapTaki}` } : {}),
    };
  }, [pickIndex, ctx, slots, states, catalog, cardIds, leaderIndex, supportBonus, mode, swapEntry, swapTaki]);

  /**
   * 計算した数字を、全ツール共通の「編成プロフィール」へ書き戻す。
   *
   * ★ **プロフィールは軽い受け口のまま**にする。各ツールが編成ビルダーのデータ
   *  （カタログ1.2MB＋計算一式）を直接読むと、どのページも重くなる。
   *   ビルダーが生産者として数字だけ置き、ツールは今までどおりそこを読む。
   * ★ 手で作ったプロフィールは潰さない（upsertProfileByName が source で分けている）。
   */
  const pushToProfile = (name: string) => {
    if (!evaluated || cards.length === 0) return;
    upsertProfileByName(name, profileValuesFromEval(evaluated));
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
    /*
     * ★ 保存したら編成プロフィールにも必ず書く。
     *
     *   以前は「同名のプロフィールが既にあるときだけ更新し、無ければ増やさない」
     *   にしていた（勝手にプロフィールが増えるのを避けるため）。だが実際に使うと、
     *   **編成ビルダーで組んだ編成が他のツールに出てこない**という詰まり方をする。
     *   ランキングや稼働時間の側からは「保存したのに呼べない」としか見えず、
     *   もう一度ここへ戻って別のボタンを押す必要があった（Nori 指摘 2026-08-11）。
     *
     *   編成ビルダーの値を他のツールで使うのが主たる用途なので、保存＝共有でよい。
     *   増えたプロフィールは設定画面の台帳から消せるし、source が "deck" なので
     *   手で作ったプロフィールを潰すこともない（upsertProfileByName）。
     */
    pushToProfile(name);
    setNotice(`「${name}」に保存しました`);
    setTimeout(() => setNotice(null), 2600);
  };

  return (
    <ToolPage morphKey="tool:deck" title="編成ビルダー" icon="style" wide>
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

        {/* ★ 取り込んだ編成が「ビルダーには有るのにツールからは呼べない」状態を検出して出す。
            保存済み編成が持っているのはカード5枚の並びだけで、総合力・ボーナス・
            スキルの内部値はプロフィールに書かれて初めて他のツールから読める。 */}
        {unlinkedDecks.length > 0 && evalBase && (
          <div className="neu-raised mb-4 flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="text-slate-600">
              保存した編成のうち{" "}
              <span className="font-bold">{unlinkedDecks.length}件</span>{" "}
              が、他のツール（周回プラン・アナライザー等）から呼べません。
            </span>
            <NeuButton
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => {
                const { written, states: filled } = syncDecksToProfiles(
                  unlinkedDecks,
                  evalBase,
                  // イベントを持たない古い保存は、いま選んでいるイベントで計算する
                  // （＝ビルダーで開いたときと同じ数字にする）。
                  { eventId, custom },
                );
                // 育成状態を埋めたぶんは書き戻す（開いたときと同じ既定値で計算するため）。
                if (filled !== states) {
                  setStates(filled);
                  writeCardStates(filled);
                }
                setNotice(`${written}件を編成として登録しました`);
                setTimeout(() => setNotice(null), 2600);
              }}
            >
              ツールから呼べるようにする
            </NeuButton>
            <span className="text-xs text-slate-400">
              育成状態が無いカードは、編成を開いたときと同じ既定値で計算します
            </span>
          </div>
        )}

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
          {/* ★ 比較用の2案目をゼロから組み直さなくて済むようにする。
              いまの編成を別名で保存して、そのまま1枚だけ差し替えられる。 */}
          {cards.length > 0 && (
            <NeuButton
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => {
                const base = deckName.trim() || `編成${decks.length + 1}`;
                let name = `${base}の写し`;
                for (let i = 2; decks.some((d) => d.name === name); i++) name = `${base}の写し${i}`;
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
                setNotice(`「${name}」として複製しました`);
                setTimeout(() => setNotice(null), 2600);
              }}
            >
              複製
            </NeuButton>
          )}
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
          {/*
           * ★ 読み込み中の知らせは **sr-only**（画面に場所を取らない）。
           *   見える文字として置くと、スマホ幅ではこの行が折り返して1行増え、
           *   読み込み完了で消えるときに下の内容が全部ずれる
           *  （モバイルで CLS 0.31。2026-08-10 実測。デスクトップでは
           *   行に余白があったので気付けなかった）。
           *   枠は最初から描かれていて中身が入るだけなので、目で見て
           *   分からなくなることはない。読み上げには status として届く。
           */}
          {loading && (
            <span role="status" className="sr-only">
              カードデータを読み込んでいます…
            </span>
          )}
        </div>

        {/*
         * ★ 読み込み中も枠を描く。1行のテキストに差し替えていたときは、
         *   データが届いた瞬間に枠5つぶん（約400px）が生えて画面全体が飛び、
         *   **CLS 0.30（判定「悪い」）** になっていた（2026-08-10 実測。
         *   Cloudflare Web Analytics が実ユーザーの値 0.244 で検知）。
         *   枠は cardIds だけで描けてカードデータを必要としないので、
         *   最初から同じ高さで出しておけば動かない。
         */}
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
          playerName={player.playerName}
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
          deckPower={evaluated.power.total}
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
              {/* ★ 各ツール（ランキング・アナライザー・稼働時間）はこのプロフィールを
                  読む。ここで書き戻せば、編成ビルダーで作った編成をそのまま呼び出せる。 */}
              <NeuButton
                className="!px-3 !py-1"
                onClick={() => {
                  const name = deckName.trim() || `編成${decks.length + 1}`;
                  pushToProfile(name);
                  setNotice(`編成プロフィール「${name}」に反映しました`);
                  setTimeout(() => setNotice(null), 3000);
                }}
              >
                編成プロフィールへ反映
              </NeuButton>
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
              // ★ 種類が違う編成は混ぜない。イベント編成の比較にチャレンジ用（同キャラ5枚）が
              //   並ぶと、組めないはずの編成にボーナスが付いた行が出る。
              decks={decks.filter((d) => (d.mode ?? "event") === mode)}
              current={{ cardIds, leaderIndex, supportBonus: Number(supportBonus) || 0 }}
              ctx={ctx}
              mode={mode}
              music={music}
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
          swap={swap}
          owned={ownedIds}
          onToggleOwned={toggleOwned}
          onSelect={(card) => selectCard(pickIndex, card)}
          onClose={() => setPickIndex(null)}
        />
      )}
    </ToolPage>
  );
}
