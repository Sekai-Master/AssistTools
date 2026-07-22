import { useEffect, useRef, useState } from "react";
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
import { drawBingoCard } from "./bingoCanvas";
import { BingoTable } from "./BingoTable";
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
  const { musics, aliases, loading } = useBingoMusics();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<"random" | "seed">("random");
  const [units, setUnits] = useState(new Set(ALL_UNIT_VALUES));
  const [categories, setCategories] = useState(new Set(ALL_CATEGORY_VALUES));
  const [types, setTypes] = useState(new Set(ALL_TYPE_VALUES));
  const [centerMode, setCenterMode] = useState<CenterMode>("free");
  const [centerSong, setCenterSong] = useState<BingoMusic | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [card, setCard] = useState<Cell[] | null>(null);
  const [borderColor, setBorderColor] = useState("#ff9900");
  const [editing, setEditing] = useState<number | "center" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // カード/枠線色が変わるたび Canvas を再描画
  useEffect(() => {
    if (!card || !canvasRef.current) return;
    drawBingoCard(canvasRef.current, card, {
      jacketBase: JACKET_BASE,
      freeIconUrl: FREE_ICON,
      borderColor,
    });
  }, [card, borderColor]);

  const toggle = <T,>(set: Set<T>, setter: (s: Set<T>) => void, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const handleGenerate = () => {
    setError(null);
    setNotice(null);
    try {
      if (mode === "seed") {
        setCard(decodeSeed(seedInput, musics));
      } else {
        const pool = filterForGeneration(musics, units, categories, types);
        setCard(buildRandomCard(pool, centerMode, centerSong));
      }
      setBorderColor(pickBorderColor());
    } catch (e) {
      setCard(null);
      setError(e instanceof Error ? e.message : "生成に失敗しました。");
    }
  };

  const toggleCleared = (i: number) =>
    setCard((prev) =>
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
    a.download = "bingo_card.png";
    a.click();
  };

  const issueSeed = async () => {
    if (!card) return;
    const seed = encodeSeed(card);
    try {
      await navigator.clipboard.writeText(seed);
      setNotice(`シード値をコピーしました: ${seed}`);
    } catch {
      setNotice(`シード値: ${seed}`);
    }
  };

  return (
    <ToolPage unit="wxs" title="BINGOカードジェネレーター" icon="grid_on">
      <Panel title="生成モード">
        <SegmentedControl
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
            placeholder="50文字のシード値を貼り付け"
          />
        )}
      </Panel>

      {mode === "random" && (
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

      <ActionButton onClick={handleGenerate} disabled={loading} className="w-full text-base">
        {loading ? "楽曲データ読込中…" : "カードを生成"}
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

      {card && (
        <>
          <Panel title="カード">
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                className="max-w-full h-auto rounded-lg"
                style={{ width: 520 }}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3 justify-center">
              <NeuButton onClick={copyImage}>画像をコピー</NeuButton>
              <NeuButton onClick={saveImage}>画像を保存</NeuButton>
              <NeuButton onClick={issueSeed}>シードを発行</NeuButton>
            </div>
          </Panel>

          <Panel title="マス一覧（曲名で差し替え／状態でクリア切替）">
            <BingoTable
              card={card}
              jacketBase={JACKET_BASE}
              onToggleCleared={toggleCleared}
              onEditCell={(i) => setEditing(i)}
            />
          </Panel>
        </>
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
