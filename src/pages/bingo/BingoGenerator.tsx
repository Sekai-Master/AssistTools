import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { ActionButton } from "../../components/ui/ActionButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SongSearchModal } from "../../components/SongSearchModal";
import { resolveColor } from "../../lib/canvasColor";
import { useBingoMusics } from "./useBingoMusics";
import { type BingoMusic, type Cell, buildRandomCard, filterForGeneration, pickBorderColor } from "./bingoLogic";
import { type OdaiCell, buildOdaiCandidates, buildOdaiCard } from "./odaiLogic";
import { progressOf } from "./bingoProgress";
import {
  CARD_PARAM,
  type CardKind,
  type KindedCard,
  cardCode,
  cardLink,
  decodeCardCode,
  extractCode,
  shareText,
} from "./bingoShare";
import { loadBingo, saveBingo } from "./bingoStorage";
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
  odai: "マスはお題。流れた曲が当てはまるお題を埋める",
  song: "マスは曲。流れた曲のマスを埋める",
};

const DEFAULT_FILTERS: SongFilters = {
  units: new Set(ALL_UNIT_VALUES),
  categories: new Set(ALL_CATEGORY_VALUES),
  types: new Set(ALL_TYPE_VALUES),
  centerMode: "free",
  centerSong: null,
};

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

interface Initial {
  kind: CardKind;
  odai: OdaiCell[] | null;
  song: Cell[] | null;
  error: string | null;
}

/**
 * 開いたときのカード: この端末の途中経過を戻し、リンク（?card=）があればそれを出す。
 * 壊れた・古い保存は黙って捨てる。読めないリンクは文言を出し、新しいカードを作れる状態にする。
 */
function restoreInitial(musics: BingoMusic[], linked: string | null): Initial {
  const init: Initial = { kind: "odai", odai: null, song: null, error: null };
  if (musics.length === 0) return init;
  const put = (kc: KindedCard) => {
    if (kc.kind === "odai") init.odai = kc.card;
    else init.song = kc.card;
  };
  const saved = loadBingo();
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
      put(kc);
      init.kind = kc.kind;
    } catch (e) {
      init.error = `リンクのカードを読めませんでした。${errorText(e, "コードの形が違います。")}`;
    }
  }
  return init;
}

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
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => restoreInitial(musics, params.get(CARD_PARAM)));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 書き出し画像の描き終わり。共有・保存はこれを待ってから画像にする（埋めた直後でも最新の絵）
  const drawn = useRef<Promise<void>>(Promise.resolve());

  const [kind, setKind] = useState<CardKind>(initial.kind);
  const [odaiCard, setOdaiCard] = useState<OdaiCell[] | null>(initial.odai);
  const [songCard, setSongCard] = useState<Cell[] | null>(initial.song);
  const [filters, setFilters] = useState<SongFilters>(DEFAULT_FILTERS);
  const [pickingCenter, setPickingCenter] = useState(false);
  const [borderColor, setBorderColor] = useState(pickBorderColor);
  const [error, setError] = useState<string | null>(initial.error);
  const ready = musics.length > 0;

  const odaiCandidates = useMemo(() => buildOdaiCandidates(musics), [musics]);

  const applyCard = useCallback((kc: KindedCard) => {
    if (kc.kind === "odai") setOdaiCard(kc.card);
    else setSongCard(kc.card);
    setKind(kc.kind);
  }, []);

  // リンクのカードを出した後はリンクを外す（開き直したときに、埋めた途中が人のカードで上書きされないように）
  useEffect(() => {
    if (!ready || !params.has(CARD_PARAM)) return;
    setParams(
      (p) => {
        p.delete(CARD_PARAM);
        return p;
      },
      { replace: true }
    );
  }, [ready, params, setParams]);

  // 途中経過を残す（楽曲データが届く前の空のカードで上書きしない）
  useEffect(() => {
    if (!ready) return;
    saveBingo({
      kind,
      ...(odaiCard ? { odai: cardCode({ kind: "odai", card: odaiCard }) } : {}),
      ...(songCard ? { song: cardCode({ kind: "song", card: songCard }) } : {}),
    });
  }, [ready, kind, odaiCard, songCard]);

  const current = useMemo<KindedCard | null>(
    () =>
      kind === "odai"
        ? odaiCard
          ? { kind, card: odaiCard }
          : null
        : songCard
          ? { kind, card: songCard }
          : null,
    [kind, odaiCard, songCard]
  );

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
        setOdaiCard(buildOdaiCard(odaiCandidates));
      } else {
        const pool = filterForGeneration(musics, filters.units, filters.categories, filters.types);
        setSongCard(buildRandomCard(pool, filters.centerMode, filters.centerSong));
      }
      setBorderColor(pickBorderColor());
    } catch (e) {
      setError(errorText(e, "カードを作れませんでした"));
    }
  };

  const openCode = (input: string) => {
    try {
      applyCard(decodeCardCode(extractCode(input), musics));
      setError(null);
    } catch (e) {
      setError(errorText(e, "コードを読めませんでした"));
    }
  };

  const centerMissing = kind === "song" && filters.centerMode === "specified" && !filters.centerSong;
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
        <ActionButton
          onClick={newCard}
          disabled={loading || centerMissing}
          className="mt-4 min-h-12 w-full text-base"
        >
          {loading ? "楽曲データ読込中…" : centerMissing ? "中央マスの曲を選んでください" : "新しいカードを作る"}
        </ActionButton>
        {error && (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        <BingoSettings
          kind={kind}
          filters={filters}
          onFiltersChange={setFilters}
          onPickCenter={() => setPickingCenter(true)}
          onOpenCode={openCode}
        />
      </Panel>

      {current && (
        <Panel title="カード">
          {current.kind === "odai" ? (
            <BingoCardGrid
              kind="odai"
              card={current.card}
              musics={musics}
              aliases={aliases}
              jacketBase={JACKET_BASE}
              onChange={setOdaiCard}
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
            text={shareText(current.kind, progressOf(current.card))}
            fileName={current.kind === "odai" ? "odai_bingo_card.png" : "bingo_card.png"}
          />
        </Panel>
      )}
      {/* 書き出し用。画面のカードは上のマスが主役なので、画像は隠して描く */}
      <canvas ref={canvasRef} className="hidden" />

      {pickingCenter && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          title="中央マスの曲を選ぶ"
          onSelect={(m) => {
            setFilters((f) => ({ ...f, centerSong: m }));
            setPickingCenter(false);
          }}
          onClose={() => setPickingCenter(false)}
        />
      )}
    </>
  );
}
