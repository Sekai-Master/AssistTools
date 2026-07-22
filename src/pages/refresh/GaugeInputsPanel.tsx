import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { SongSearchModal } from "../../components/SongSearchModal";
import { onJacketError } from "../../lib/img";
import { isMeasured } from "./lib/refreshConstant";
import type { GaugeInputs } from "./useGaugeInputs";
import type { AnalyzerMusic } from "../analyzer/useAnalyzerMusics";
import type { AliasEntry } from "../bingo/useBingoMusics";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/** ゲージ系ツール共通の入力パネル（曲・現在ゲージ・周回ペース＋較正）＋曲検索モーダル。 */
export function GaugeInputsPanel({
  inputs,
  musics,
  aliases,
  loading,
  showGauge = true,
}: {
  inputs: GaugeInputs;
  musics: AnalyzerMusic[];
  aliases: AliasEntry[];
  loading: boolean;
  /** 「現在のゲージ」欄を出すか（稼働時間ツールでは不要） */
  showGauge?: boolean;
}) {
  const {
    selectedSong,
    rc,
    gauge,
    setGauge,
    rate,
    setRate,
    calibPlays,
    setCalibPlays,
    calibMin,
    setCalibMin,
    calibRate,
    songModalOpen,
    setSongModalOpen,
    setSongId,
  } = inputs;
  const len = selectedSong?.musicTime ?? 0;

  return (
    <>
      <Panel title="設定">
        <div className="space-y-4">
          <Field label="曲">
            <div className="flex items-center gap-3">
              {selectedSong ? (
                <img
                  src={`${JACKET_BASE}${selectedSong.jacketLink}`}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0"
                  onError={onJacketError}
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-700">
                  {loading ? "読み込み中…" : selectedSong ? selectedSong.title : "未選択"}
                </p>
                {selectedSong && (
                  <p className="text-xs text-slate-500">
                    定数 {rc}
                    {isMeasured(selectedSong.id) ? (
                      <span
                        className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: "var(--unit-color)" }}
                      >
                        実測
                      </span>
                    ) : (
                      <span className="ml-1.5 text-[10px] text-slate-400">
                        基礎点{selectedSong.basePoint}推定
                      </span>
                    )}
                    {len > 0 && <span className="ml-2">長さ {len}s</span>}
                  </p>
                )}
              </div>
              <NeuButton
                className="!px-3 !py-1.5 !text-xs shrink-0"
                disabled={loading}
                onClick={() => setSongModalOpen(true)}
              >
                曲を選択
              </NeuButton>
            </div>
          </Field>

          {showGauge && (
            <Field
              label="現在のゲージ"
              htmlFor="rg-gauge"
              hint="いまの表示%（0〜100）。ここからの残りを計算します"
            >
              <div className="flex items-center gap-2">
                <NeuInput
                  id="rg-gauge"
                  inputMode="decimal"
                  value={gauge}
                  onChange={(e) => setGauge(e.target.value)}
                  placeholder="例: 13.6"
                  className="max-w-32"
                />
                <span className="text-slate-500">%</span>
              </div>
            </Field>
          )}

          <Field
            label="周回ペース"
            hint="エビ基準の周回 回/時（マッチング・支援者交代・ロード込み）。長い曲は自動で少なくなります。既定28、自分の環境に合わせて調整を"
          >
            <div className="flex items-center gap-2">
              <NeuInput
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="max-w-24"
              />
              <span className="text-sm text-slate-500">回/時（エビ基準）</span>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">実測から較正する</summary>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">エビを</span>
                <NeuInput
                  inputMode="numeric"
                  value={calibPlays}
                  onChange={(e) => setCalibPlays(e.target.value)}
                  placeholder="回"
                  className="max-w-16 text-center"
                />
                <span className="text-slate-500">回を</span>
                <NeuInput
                  inputMode="numeric"
                  value={calibMin}
                  onChange={(e) => setCalibMin(e.target.value)}
                  placeholder="分"
                  className="max-w-16 text-center"
                />
                <span className="text-slate-500">分で</span>
                <NeuButton
                  className="!py-1 !text-xs"
                  disabled={!calibRate}
                  onClick={() => calibRate && setRate(String(calibRate))}
                >
                  → {calibRate ?? "?"}回/時にする
                </NeuButton>
              </div>
            </details>
          </Field>
        </div>
      </Panel>

      {songModalOpen && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          onSelect={(m) => {
            setSongId(m.id);
            setSongModalOpen(false);
          }}
          onClose={() => setSongModalOpen(false)}
        />
      )}
    </>
  );
}
