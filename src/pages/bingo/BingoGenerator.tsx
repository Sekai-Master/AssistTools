import { useEffect, useMemo, useRef, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { ActionButton } from "../../components/ui/ActionButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useBingoMusics } from "./useBingoMusics";
import {
  type BingoMusic,
  type Cell,
  type CenterMode,
  buildRandomCard,
  decodeSeed,
  encodeSeed,
  filterForGeneration,
  pickBorderColor,
} from "./bingoLogic";
import {
  type OdaiCell,
  buildOdaiCandidates,
  buildOdaiCard,
  decodeOdaiSeed,
  encodeOdaiSeed,
  isOdaiSeed,
} from "./odaiLogic";
import { drawBingoCard } from "./bingoCanvas";
import { drawOdaiCard } from "./odaiCanvas";
import { BingoTable } from "./BingoTable";
import { OdaiCardGrid } from "./OdaiCardGrid";
import { SongSearchModal } from "../../components/SongSearchModal";
import {
  ALL_CATEGORY_VALUES,
  ALL_TYPE_VALUES,
  ALL_UNIT_VALUES,
  CATEGORY_OPTIONS,
  TYPE_OPTIONS,
  UNIT_OPTIONS,
} from "./bingoConstants";

const base = import.meta.env.BASE_URL;
const JACKET_BASE = `${base}MusicDatas/jacket/`;
const FREE_ICON = `${base}images/icon.webp`;

/** カードの種類。曲名はほぼ埋まらない（1 曲が載る確率 24/740）ので、既定はお題。 */
type CardKind = "odai" | "song";

/** トグルできるチップ群（複数選択）。 */
function ToggleChips<T extends string | boolean>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <NeuButton
          key={String(o.value)}
          active={selected.has(o.value)}
          onClick={() => onToggle(o.value)}
          className="!px-3 !py-1 !text-xs"
        >
          {o.label}
        </NeuButton>
      ))}
    </div>
  );
}

export default function BingoGenerator() {
  const { musics, aliases, loading, error: dataError } = useBingoMusics();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [kind, setKind] = useState<CardKind>("odai");
  const [mode, setMode] = useState<"random" | "seed">("random");
  const [units, setUnits] = useState(new Set(ALL_UNIT_VALUES));
  const [categories, setCategories] = useState(new Set(ALL_CATEGORY_VALUES));
  const [types, setTypes] = useState(new Set(ALL_TYPE_VALUES));
  const [centerMode, setCenterMode] = useState<CenterMode>("free");
  const [centerSong, setCenterSong] = useState<BingoMusic | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [card, setCard] = useState<Cell[] | null>(null);
  const [odaiCard, setOdaiCard] = useState<OdaiCell[] | null>(null);
  const [borderColor, setBorderColor] = useState("#ff9900");
  const [editing, setEditing] = useState<number | "center" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // お題の候補は楽曲データから毎回計算する（割合が範囲内のものだけ）。
  const odaiCandidates = useMemo(() => buildOdaiCandidates(musics), [musics]);

  // カード/枠線色が変わるたび Canvas を再描画。
  // 非同期描画中に次の描画が始まったら古い方を中断する（レース防止）。
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    if (kind === "odai" && odaiCard) {
      drawOdaiCard(canvasRef.current, odaiCard, { freeIconUrl: FREE_ICON, borderColor }, isCancelled);
    } else if (kind === "song" && card) {
      drawBingoCard(
        canvasRef.current,
        card,
        { jacketBase: JACKET_BASE, freeIconUrl: FREE_ICON, borderColor },
        isCancelled
      );
    }
    return () => {
      cancelled = true;
    };
  }, [kind, card, odaiCard, borderColor]);

  // 中央マス「指定」で曲が未選択なら生成できない（buildRandomCard も throw するが、
  // その前に UI で無効化して無駄な操作＋既存カード消去を防ぐ）。
  const centerSongMissing =
    kind === "song" && mode === "random" && centerMode === "specified" && !centerSong;

  const toggle = <T,>(set: Set<T>, setter: (s: Set<T>) => void, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const handleGenerate = () => {
    setError(null);
    setNotice(null);
    // シード値は形で種類が分かるので、選んでいる種類に関わらず読める方で読む。
    const target: CardKind = mode === "seed" ? (isOdaiSeed(seedInput) ? "odai" : "song") : kind;
    try {
      if (target === "odai") {
        setOdaiCard(
          mode === "seed" ? decodeOdaiSeed(seedInput, musics) : buildOdaiCard(odaiCandidates)
        );
      } else if (mode === "seed") {
        setCard(decodeSeed(seedInput, musics));
      } else {
        const pool = filterForGeneration(musics, units, categories, types);
        setCard(buildRandomCard(pool, centerMode, centerSong));
      }
      setKind(target);
      setBorderColor(pickBorderColor());
    } catch (e) {
      if (target === "odai") setOdaiCard(null);
      else setCard(null);
      setKind(target);
      setError(e instanceof Error ? e.message : "生成に失敗しました。");
    }
  };

  const toggleCleared = (i: number) =>
    setCard((prev) =>
      prev
        ? prev.map((c, j) => (j === i && c !== "FREE" ? { ...c, cleared: !c.cleared } : c))
        : prev
    );

  const toggleOdaiCleared = (i: number) =>
    setOdaiCard((prev) =>
      prev
        ? prev.map((c, j) => (j === i && c !== "FREE" ? { ...c, cleared: !c.cleared } : c))
        : prev
    );

  const replaceCell = (music: BingoMusic) => {
    if (editing === null) return;
    if (editing === "center") {
      setCenterSong(music);
    } else {
      const idx = editing;
      setCard((prev) => (prev ? prev.map((c, j) => (j === idx ? { ...music, cleared: false } : c)) : prev));
    }
    setEditing(null);
  };

  const copyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setNotice("画像をクリップボードにコピーしました。");
      } catch {
        setError("コピーに失敗しました（ブラウザの権限をご確認ください）。");
      }
    }, "image/png");
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = kind === "odai" ? "odai_bingo_card.png" : "bingo_card.png";
    a.click();
  };

  const issueSeed = async () => {
    const seed =
      kind === "odai" ? (odaiCard ? encodeOdaiSeed(odaiCard) : null) : card ? encodeSeed(card) : null;
    if (!seed) return;
    try {
      await navigator.clipboard.writeText(seed);
      setNotice(`シード値をコピーしました: ${seed}`);
    } catch {
      setNotice(`シード値: ${seed}`);
    }
  };

  const shownCard = kind === "odai" ? odaiCard : card;

  const imageButtons = (
    <div className="mt-4 flex flex-wrap gap-3 justify-center">
      <NeuButton onClick={copyImage}>画像をコピー</NeuButton>
      <NeuButton onClick={saveImage}>画像を保存</NeuButton>
      <NeuButton onClick={issueSeed}>シードを発行</NeuButton>
    </div>
  );

  return (
    <ToolPage morphKey="tool:bingo" title="BINGOカードジェネレーター" icon="grid_on">
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}
      <Panel title="生成モード">
        <SegmentedControl
          options={[
            { value: "odai", label: "お題ビンゴ" },
            { value: "song", label: "曲名ビンゴ" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <SegmentedControl
          className="mt-4"
          options={[
            { value: "random", label: "ランダム" },
            { value: "seed", label: "シード値" },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === "seed" && (
          <NeuInput
            className="mt-4"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="シード値を貼り付け"
          />
        )}
      </Panel>

      {kind === "song" && mode === "random" && (
        <Panel title="絞り込み">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">ユニット</p>
              <ToggleChips
                options={UNIT_OPTIONS}
                selected={units}
                onToggle={(v) => toggle(units, setUnits, v)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">MV種別</p>
              <ToggleChips
                options={CATEGORY_OPTIONS}
                selected={categories}
                onToggle={(v) => toggle(categories, setCategories, v)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">曲種</p>
              <ToggleChips
                options={TYPE_OPTIONS}
                selected={types}
                onToggle={(v) => toggle(types, setTypes, v)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">中央マス</p>
              <SegmentedControl
                options={[
                  { value: "free", label: "FREE" },
                  { value: "random", label: "ランダム" },
                  { value: "specified", label: "指定" },
                ]}
                value={centerMode}
                onChange={setCenterMode}
              />
              {centerMode === "specified" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {centerSong ? centerSong.title : "未選択"}
                  </span>
                  <NeuButton className="!px-3 !py-1 !text-xs" onClick={() => setEditing("center")}>
                    曲を選択
                  </NeuButton>
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      <ActionButton
        onClick={handleGenerate}
        disabled={loading || centerSongMissing}
        className="w-full text-base"
      >
        {loading
          ? "楽曲データ読込中…"
          : centerSongMissing
            ? "中央マスの曲を選択してください"
            : "カードを生成"}
      </ActionButton>

      {error && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="neu-panel p-4 text-sm text-slate-600 break-all" role="status">
          {notice}
        </div>
      )}

      {shownCard && (
        <Panel title="カード">
          {kind === "odai" && odaiCard && (
            <>
              <p className="mb-4 text-sm text-slate-600">流れた曲が当てはまるお題を押す</p>
              <OdaiCardGrid card={odaiCard} onToggleCleared={toggleOdaiCleared} />
            </>
          )}
          {/* お題はマスの一覧が画面の主役なので、画像（canvas）は書き出し用に隠して描く */}
          <div className={kind === "odai" ? "hidden" : "flex justify-center"}>
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto rounded-lg"
              style={{ width: 520 }}
            />
          </div>
          {imageButtons}
        </Panel>
      )}

      {kind === "song" && card && (
        <Panel title="マス一覧（曲名で差し替え／状態でクリア切替）">
          <BingoTable
            card={card}
            jacketBase={JACKET_BASE}
            onToggleCleared={toggleCleared}
            onEditCell={(i) => setEditing(i)}
          />
        </Panel>
      )}

      {editing !== null && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          onSelect={replaceCell}
          onClose={() => setEditing(null)}
        />
      )}
    </ToolPage>
  );
}
