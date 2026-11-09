import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { ActionButton } from "../../components/ui/ActionButton";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { resolveColor } from "../../lib/canvasColor";
import { useBingoMusics } from "./useBingoMusics";
import { buildSongCard, pickBorderColor } from "./bingoLogic";
import {
  type OdaiLevel,
  type OdaiTheme,
  DEFAULT_ODAI_LEVEL,
  DEFAULT_ODAI_THEME,
  MAX_ODAI_PINS,
  ODAI_LEVELS,
  ODAI_LEVEL_KEYS,
  buildOdaiCandidates,
  buildOdaiCard,
  odaiLevelOf,
  odaiSongsToHalf,
  resolvePinnedOdais,
} from "./odaiLogic";
import { type PickableOdai, listPickableOdais, resolveSavedPins } from "./odaiPins";
import { loadOdaiPins, saveOdaiPins } from "./odaiPinStorage";
import { OdaiPicker } from "./OdaiPicker";
import { BingoSongPicker } from "./BingoSongPicker";
import { progressOf } from "./bingoProgress";
import { MINUTES_PER_SONG, playTimeText } from "./playTime";
import { type CardKind, cardCode, cardLink, decodeCardCode, extractCode, shareText } from "./bingoShare";
import { canReplaceSilently, errorText } from "./bingoRestore";
import { useSingleCards } from "./useSingleCards";
import { useSongPins, useSongPool } from "./useSongPins";
import { MAX_SONG_PINS } from "./songPinStorage";
import { drawBingoCard } from "./bingoCanvas";
import { drawOdaiCard } from "./odaiCanvas";
import { BingoCardGrid } from "./BingoCardGrid";
import { BingoSettings, type SongFilters } from "./BingoSettings";
import { BingoShareBar } from "./BingoShareBar";
import { ALL_CATEGORY_VALUES, ALL_TYPE_VALUES, ALL_UNIT_VALUES } from "./bingoConstants";

const base = import.meta.env.BASE_URL;
const JACKET_BASE = `${base}MusicDatas/jacket/`;
const FREE_ICON = `${base}images/icon.webp`;

/** 種類ごとの 1 行の説明。曲名はほぼ埋まらない（1 曲が載る確率 24/740）ので、既定はお題。 */
const KIND_HINT: Record<CardKind, string> = {
  odai: "マスはお題。遊んだ曲を入れると、当てはまるマスが分かる",
  song: "マスは曲。遊んだ曲を入れると、カードにあるか分かる",
};

const LEVEL_OPTIONS = ODAI_LEVEL_KEYS.map((k) => ({ value: k, label: ODAI_LEVELS[k].label }));

const DEFAULT_FILTERS: SongFilters = {
  units: new Set(ALL_UNIT_VALUES),
  categories: new Set(ALL_CATEGORY_VALUES),
  types: new Set(ALL_TYPE_VALUES),
  singer: null,
  centerMode: "free",
  centerSong: null,
};

export default function BingoGenerator() {
  const data = useBingoMusics();
  // 楽曲データが届いたら作り直す。途中経過とリンクのカードを state の初期値で戻すため
  return (
    <ToolPage morphKey="tool:bingo" title="BINGOカードジェネレーター" icon="grid_on">
      <BingoBoard key={data.musics.length > 0 ? "ready" : "loading"} {...data} />
    </ToolPage>
  );
}

function BingoBoard({
  musics,
  aliases,
  loading,
  error: dataError,
}: ReturnType<typeof useBingoMusics>) {
  const {
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
  } = useSingleCards(musics);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 書き出し画像の描き終わり。共有・保存はこれを待ってから画像にする（埋めた直後でも最新の絵）
  const drawn = useRef<Promise<void>>(Promise.resolve());

  // 開き直したときは今のカードの段から（HARD に戻ると、MASTER のつもりで HARD のカードを作ってしまう）
  const [level, setLevel] = useState<OdaiLevel>(() =>
    initial.odai ? odaiLevelOf(initial.odai) : DEFAULT_ODAI_LEVEL
  );
  // テーマは作るときだけ使う（コードにも保存にも入れない。開き直すとおまかせに戻る）
  const [theme, setTheme] = useState<OdaiTheme>(DEFAULT_ODAI_THEME);
  const [filters, setFilters] = useState<SongFilters>(DEFAULT_FILTERS);
  // 曲名ビンゴの入れたい曲（端末に残す）と、絞り込みに当てはまる曲・足りるか
  const songPins = useSongPins(musics);
  const songPool = useSongPool(musics, filters, songPins.pins);
  const [pickingSongPins, setPickingSongPins] = useState(false);
  const closeSongPinPicker = useCallback(() => setPickingSongPins(false), []);
  const [pickingCenter, setPickingCenter] = useState(false);
  const [borderColor, setBorderColor] = useState(pickBorderColor);
  const [error, setError] = useState<string | null>(initial.error);
  const ready = musics.length > 0;

  const odaiCandidates = useMemo(() => buildOdaiCandidates(musics), [musics]);
  // 選ぶ小窓に出すお題（入れたいお題・マスの差し替え）。楽曲データで 1 曲以上当てはまるすべて
  const pickable = useMemo(() => listPickableOdais(musics), [musics]);
  const pickableByKey = useMemo(() => new Map(pickable.map((o) => [o.key, o])), [pickable]);
  // 入れたいお題の鍵。楽曲データに無い鍵は黙って落とし、表記違いの作者の鍵は同じ人の鍵に置き換える（resolveSavedPins）。
  // ★ 届く前は空になるが、BingoGenerator が楽曲データが届いたら key を変えてこの部品を作り直すので、そこで読み直す
  //   （key を外すと、届く前の空の一覧で保存を消してしまう。保存の useEffect も ready を待つ）
  const [pinKeys, setPinKeys] = useState<string[]>(() => resolveSavedPins(loadOdaiPins(), pickableByKey));
  const [pickingPins, setPickingPins] = useState(false);
  const pins = useMemo(
    () => pinKeys.flatMap((k) => pickableByKey.get(k) ?? []),
    [pinKeys, pickableByKey]
  );

  // 入れたいお題も残す（届く前の空の一覧で消さない）
  useEffect(() => {
    if (ready) saveOdaiPins(pinKeys);
  }, [ready, pinKeys]);

  const togglePin = (odai: PickableOdai) =>
    setPinKeys((keys) =>
      keys.includes(odai.key)
        ? keys.filter((k) => k !== odai.key)
        : keys.length < MAX_ODAI_PINS
          ? [...keys, odai.key]
          : keys
    );
  const closePinPicker = useCallback(() => setPickingPins(false), []);

  // 書き出し画像は隠した canvas に描いておく（共有・保存のとき使う）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !current) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    const markColor = resolveColor(canvas, "var(--unit-color)", "#ff9900");
    drawn.current =
      current.kind === "odai"
        ? drawOdaiCard(canvas, current.card, { freeIconUrl: FREE_ICON, borderColor, markColor }, isCancelled)
        : drawBingoCard(
            canvas,
            current.card,
            { jacketBase: JACKET_BASE, freeIconUrl: FREE_ICON, borderColor, markColor },
            isCancelled
          );
    return () => {
      cancelled = true;
    };
  }, [current, borderColor]);

  const getImage = useCallback(async () => {
    await drawn.current.catch(() => undefined);
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  }, []);

  const newCard = () => {
    if (current && progressOf(current.card).filled > 0 && !window.confirm("いまのカードを消して、新しく作りますか？")) {
      return;
    }
    setError(null);
    try {
      if (kind === "odai") {
        const pinned = resolvePinnedOdais(pinKeys, musics, odaiCandidates);
        setOdaiCard(buildOdaiCard(odaiCandidates, Math.random, level, theme, pinned));
      } else {
        setSongCard(buildSongCard(songPool.pool, songPins.pins, filters.centerMode, filters.centerSong));
      }
      setBorderColor(pickBorderColor());
    } catch (e) {
      setError(errorText(e, "カードを作れませんでした"));
    }
  };

  const openCode = (input: string) => {
    try {
      const kc = decodeCardCode(extractCode(input), musics);
      const existing = kc.kind === "odai" ? odaiCard : songCard;
      if (!canReplaceSilently(existing, kc) && !window.confirm("いまのカードを消して、このコードのカードを開きますか？")) {
        return;
      }
      applyCard(kc);
      setError(null);
    } catch (e) {
      setError(errorText(e, "コードを読めませんでした"));
    }
  };

  // useModalA11y は onClose が変わるたびに掛け直すので、同じ関数を渡す
  const closeCenterPicker = useCallback(() => setPickingCenter(false), []);

  const centerMissing = kind === "song" && filters.centerMode === "specified" && !filters.centerSong;
  // 条件の曲が足りないときは、作る前に止める（足りない数は細かい設定の曲数の行に出る）
  const songShort = kind === "song" && songPool.needs.need > songPool.needs.available;
  const createLabel = loading
    ? "楽曲データ読込中…"
    : centerMissing
      ? "中央マスの曲を選んでください"
      : songShort
        ? "条件に合う曲が足りません"
        : "新しいカードを作る";
  // いまのカードの段（リンクや前の版のカードも、お題から数える）
  const cardLevel = current?.kind === "odai" ? odaiLevelOf(current.card) : null;
  const cardSongs = current?.kind === "odai" ? odaiSongsToHalf(current.card) : null;
  const code = current ? cardCode(current) : "";
  const link = typeof window === "undefined" ? "" : cardLink(`${window.location.origin}${base}`, code);

  return (
    <>
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}
      <Panel>
        <SegmentedControl
          options={[
            { value: "odai", label: "お題ビンゴ" },
            { value: "song", label: "曲名ビンゴ" },
          ]}
          value={kind}
          buttonClassName="min-h-11"
          onChange={(k) => {
            setKind(k);
            setError(null);
          }}
        />
        <p className="mt-2 text-sm text-slate-600">{KIND_HINT[kind]}</p>
        {kind === "odai" && (
          <div className="mt-4">
            <p className="text-sm font-bold text-slate-700">難易度</p>
            <SegmentedControl
              compact
              ariaLabel="難易度"
              options={LEVEL_OPTIONS}
              value={level}
              // ★ 320px では 1 つが約 50px で、NORMAL がやっと入る。カードの盤面と同じく左右の余白へ 8px ずつ広げ、
              //   min-w-0 で 5 つを同じ幅に保つ（字が押し広げると、5 等分で動くつまみとずれる）
              buttonClassName="min-h-11 min-w-0 px-0 tracking-tight"
              className="-mx-2 mt-2 w-[calc(100%+1rem)] max-w-none sm:mx-0 sm:w-full sm:max-w-sm"
              onChange={setLevel}
            />
            <p className="mt-2 text-sm text-slate-600">
              半分の人がBINGOになるまで <span className="font-bold">{playTimeText(ODAI_LEVELS[level].songs)}</span>
              <span className="text-slate-500">
                （<span className="font-num">{ODAI_LEVELS[level].songs}</span>曲・1曲{MINUTES_PER_SONG}分として）
              </span>
            </p>
          </div>
        )}
        <ActionButton
          onClick={newCard}
          disabled={loading || centerMissing || songShort}
          className="mt-4 min-h-12 w-full text-base"
        >
          {createLabel}
        </ActionButton>
        {error && (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        {pendingLink && (
          <div className="mt-4 rounded-lg border border-slate-300 p-4" role="status">
            <p className="text-sm text-slate-700">リンクのカードを開きますか？いまのカードは消えます</p>
            <div className="mt-3 flex gap-3">
              <NeuButton
                className="min-h-11 flex-1 !px-2"
                onClick={() => {
                  applyCard(pendingLink);
                  setPendingLink(null);
                }}
              >
                開く
              </NeuButton>
              <NeuButton className="min-h-11 flex-1 !px-2" onClick={() => setPendingLink(null)}>
                いまのまま
              </NeuButton>
            </div>
          </div>
        )}
        <BingoSettings
          kind={kind}
          filters={filters}
          onFiltersChange={setFilters}
          theme={theme}
          onThemeChange={setTheme}
          pins={pins}
          onRemovePin={(key) => setPinKeys((keys) => keys.filter((k) => k !== key))}
          onPickPins={() => setPickingPins(true)}
          song={{
            pins: songPins.pins,
            outside: songPool.outside,
            matched: songPool.pool.length,
            need: songPool.needs.need,
            available: songPool.needs.available,
            onRemovePin: songPins.remove,
            onClearPins: songPins.clear,
            onPickPins: () => setPickingSongPins(true),
          }}
          onPickCenter={() => setPickingCenter(true)}
          onOpenCode={openCode}
        />
      </Panel>

      {current && (
        <Panel>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-base font-bold text-slate-700">カード</h2>
            {cardLevel && cardSongs !== null && (
              <p className="text-sm text-slate-600">
                <span className="font-bold">{ODAI_LEVELS[cardLevel].label}</span> ・ {playTimeText(cardSongs)}
              </p>
            )}
          </div>
          {current.kind === "odai" ? (
            <BingoCardGrid
              kind="odai"
              card={current.card}
              musics={musics}
              aliases={aliases}
              jacketBase={JACKET_BASE}
              onChange={setOdaiCard}
              pickable={pickable}
            />
          ) : (
            <BingoCardGrid
              kind="song"
              card={current.card}
              musics={musics}
              aliases={aliases}
              jacketBase={JACKET_BASE}
              onChange={setSongCard}
            />
          )}
          <BingoShareBar
            key={current.kind}
            getImage={getImage}
            link={link}
            text={shareText(current.kind, progressOf(current.card), cardLevel ? ODAI_LEVELS[cardLevel].label : undefined)}
            fileName={current.kind === "odai" ? "odai_bingo_card.png" : "bingo_card.png"}
          />
        </Panel>
      )}
      {/* 書き出し用。画面のカードは上のマスが主役なので、画像は隠して描く */}
      <canvas ref={canvasRef} className="hidden" />

      {pickingCenter && (
        <BingoSongPicker
          mode="single"
          caption="中央マス"
          title="中央マスの曲を選ぶ"
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          onPick={(m) => {
            setFilters((f) => ({ ...f, centerSong: m }));
            setPickingCenter(false);
          }}
          onClose={closeCenterPicker}
        />
      )}
      {pickingSongPins && (
        <BingoSongPicker
          mode="multi"
          caption="入れたい曲"
          title="曲を選ぶ"
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          selected={songPins.ids}
          max={MAX_SONG_PINS}
          onPick={songPins.toggle}
          onClose={closeSongPinPicker}
        />
      )}
      {pickingPins && (
        <OdaiPicker
          mode="multi"
          caption="入れたいお題"
          title="お題を選ぶ"
          items={pickable}
          selected={pinKeys}
          max={MAX_ODAI_PINS}
          onPick={togglePin}
          onClose={closePinPicker}
        />
      )}
    </>
  );
}
