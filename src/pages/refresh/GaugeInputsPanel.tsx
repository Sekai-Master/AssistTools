import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { WheelPicker } from "../../components/ui/WheelPicker";
import { DECAY_INTERVAL_MIN } from "./lib/gaugeModel";
import { SongSearchModal } from "../../components/SongSearchModal";
import { onJacketError } from "../../lib/img";
import { isMeasured } from "./lib/refreshConstant";
import { fmtDuration } from "./lib/format";
import {
  LIVE_ASSUMPTION_LABEL,
  type LiveAssumption,
  paceHint,
  soloPaceNote,
} from "./lib/liveAssumption";
import type { GaugeInputs } from "./useGaugeInputs";
import type { AnalyzerMusic } from "../analyzer/useAnalyzerMusics";
import type { AliasEntry } from "../bingo/useBingoMusics";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/**
 * 並びは「みんなでライブ｜ひとりでライブ」。効率曲ランキング（#263）・周回ラップ計測（#264）とそろえる（検分 L-5）。
 * 止まっている間の既定がひとりでライブなのは並びと別（defaultLiveAssumption）。
 */
const LIVE_OPTIONS: { value: LiveAssumption; label: string }[] = [
  { value: "multi", label: LIVE_ASSUMPTION_LABEL.multi },
  { value: "solo", label: LIVE_ASSUMPTION_LABEL.solo },
];

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
    gaugePct,
    setNextDecay,
    nextDecayMin,
    emptyInMinutes,
    rate,
    setRate,
    liveChoice,
    live,
    setLive,
    defaultRate,
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
                  {loading
                    ? "読み込み中…"
                    : selectedSong
                      ? selectedSong.title
                      : "未選択"}
                </p>
                {selectedSong && (
                  <p className="text-xs text-slate-500">
                    定数 {rc}
                    {isMeasured(selectedSong.id) ? (
                      <span
                        className="ml-2 rounded px-1 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: "var(--unit-color)" }}
                      >
                        実測
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-slate-400">
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
            <div className="space-y-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="現在のゲージ"
                  htmlFor="rg-gauge"
                  hint="いまの表示%（0〜100）"
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

                {/* ★ ゲージ%だけでは「30分タイマーがどこまで進んでいるか」が分からない。
                    イベントの途中で開くのが普通なので、触らないままだと最大30分ずれる。
                    ★ 0〜30分で上下限がはっきりしているので、ドラム式のピッカー（2026-11-25。前の円のダイヤルは場所を取りすぎた）。
                      値の持ち方（空＝未設定＝30分で計算）と計算は前のまま。回していないときは 30 の段を出す */}
                <Field
                  label="次の回復まで"
                  htmlFor="rg-next-decay"
                  hint="ゲージ画面の残り時間。回さなければ30分で計算"
                >
                  <WheelPicker
                    id="rg-next-decay"
                    value={nextDecayMin}
                    fallback={DECAY_INTERVAL_MIN}
                    max={DECAY_INTERVAL_MIN}
                    unit="分"
                    valueText={`${Math.round(nextDecayMin ?? DECAY_INTERVAL_MIN)}分`}
                    onChange={(v) => setNextDecay(String(v))}
                  />
                </Field>
              </div>

              {gaugePct > 0 && (
                <p className="text-xs text-slate-500">
                  この状態からの全回復まで{" "}
                  <span className="font-bold text-slate-600">
                    {fmtDuration(emptyInMinutes)}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* ★ 想定を選べるのはリフレッシュゲージと周回プラン（liveChoice）。周回ペースの既定がここで決まるので、すぐ上に置く。
              どちらで計算しているかは、結果の枠（周回プランはタイムラインの見出し）にも札で出す。
              ★ ラベルが 7 字なので compact（部品の注: 日本語 5 字以上）。押せる高さは 44px（#264 と同じ。検分 L-9） */}
          {liveChoice && (
            <Field label="ライブの種類">
              <SegmentedControl
                options={LIVE_OPTIONS}
                value={live}
                onChange={setLive}
                ariaLabel="ライブの種類"
                compact
                buttonClassName="min-h-11"
              />
            </Field>
          )}

          {/* ★ ひとりでライブで仮の値の間は「既定33（仮）。…」（検分 M-1。印は SOLO_OVERHEAD_PROVISIONAL） */}
          <Field
            label="周回ペース"
            htmlFor="rg-rate"
            hint={paceHint(live, defaultRate)}
          >
            <div className="flex items-center gap-2">
              <NeuInput
                id="rg-rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="max-w-24"
              />
              <span className="text-sm text-slate-500">回/時（エビ基準）</span>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">
                実測から較正する
              </summary>
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

          {/* ★ 補足文は 1 行（約 30 字）まで。詳しい説明はここに畳む（UX 監査 2026-11-12、共通の型 2・3）。
              前は欄の下に 27＋49＋74 字あり、同じ文が 3 ページ（リフレッシュ・周回プラン・必要稼働時間）に出ていた。 */}
          <details>
            <summary className="cursor-pointer text-xs text-slate-500">入力について</summary>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
              {showGauge && (
                <>
                  <li>
                    <b>現在のゲージ</b>: いまの表示%（0〜100）。ここからの残りを計算します。
                  </li>
                  <li>
                    <b>次の回復まで</b>:
                    ゲーム内のゲージ画面に出ている残り時間。回さなければ「たった今プレイを止めた」＝30分として計算します。
                  </li>
                </>
              )}
              {liveChoice && (
                <li>
                  <b>ライブの種類</b>:
                  周回ペースの既定を、どちらのライブの1周で出すか。周回ペースは種類ごとに別々に持ちます。
                </li>
              )}
              {/* ★ ひとりでライブのロスが仮の値だという詳しい断りは、ここに 1 回だけ（入力欄の下は「（仮）」の印だけ。design-system 7 節）。
                  数字は OVERHEAD_SEC.solo から、「仮」と出すかは SOLO_OVERHEAD_PROVISIONAL から決める（soloPaceNote）。 */}
              {live === "solo" ? (
                <li>
                  <b>周回ペース</b>
                  {soloPaceNote(defaultRate)}
                </li>
              ) : (
                <li>
                  <b>周回ペース</b>:
                  エビ基準の周回 回/時（マッチング・支援者交代・ロード込み）。長い曲は自動で少なくなります。既定28、自分の環境に合わせて調整を。
                </li>
              )}
            </ul>
          </details>
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
