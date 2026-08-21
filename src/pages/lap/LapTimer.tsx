import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { ActionButton } from "../../components/ui/ActionButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { TakiInput } from "../../components/ui/TakiInput";
import { Link } from "react-router-dom";
import { SaveToProfile } from "../../components/ui/ProfileBar";
import { useActiveProfile } from "../../lib/profiles";
import { SongSearchModal } from "../../components/SongSearchModal";
import { useAnalyzerMusics } from "../analyzer/useAnalyzerMusics";
import { onJacketError } from "../../lib/img";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { Stat } from "../refresh/Stat";
import {
  useLapTimer,
  useLeaveGuard,
  useTicker,
  useWakeLock,
} from "./useLapTimer";
import {
  LAP_MODE_LABEL,
  RECENT_LAPS,
  clearRecords,
  exportObj,
  isRunning,
  pause,
  resume,
  segments,
  setLapCount,
  stats,
  suspects,
  tap,
  toggleExclude,
  undo,
  type LapMode,
  type LapState,
} from "./lib/lap";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/** 秒の表示。3桁になったら小数を落とす（幅が暴れると読み取りにくい）。 */
const fmtSec = (s: number) => (s >= 100 ? s.toFixed(0) : s.toFixed(1));
const clock = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const fmtMin = (sec: number) => `${(sec / 60).toFixed(1)} 分`;

/**
 * ★ ラベルは短くする。SegmentedControl は等幅なので、1つでも長いと全体が割れる。
 *   「ソロ・オート」は 390px で単語の途中で折れた（実機幅で確認 2026-08-21）。
 *   文章の中では LAP_MODE_LABEL の正式名を使う。
 */
const MODE_OPTIONS: { value: LapMode; label: string }[] = [
  { value: "multi", label: "協力" },
  { value: "auto", label: "オート" },
  { value: "challenge", label: "チャレンジ" },
];

export default function LapTimer() {
  const { musics, aliases, loading } = useAnalyzerMusics();
  // ★ 編成が1つも無いと SaveToProfile は何も描かない。「取り込める」と書いておいて
  //   ボタンが無いのは行き止まりなので、その場合は登録先への導線を出す。
  const profile = useActiveProfile();
  const { state, setState, update, saveError } = useLapTimer();
  const running = isRunning(state);
  const paused = state.pausedAt != null;

  // 中断中は時計を止める（止まっているのに数字が増えると「測り続けている」と誤解する）。
  const now = useTicker(running && !paused);
  const wake = useWakeLock(running && !paused);
  useLeaveGuard(running);

  const [songOpen, setSongOpen] = useState(false);
  const [undoClear, setUndoClear] = useState<LapState | null>(null);
  const [copied, setCopied] = useState(false);
  /** 開いた時点で古い記録が残っていたか。開始前に一度だけ確認する。 */
  const [staleChecked, setStaleChecked] = useState(false);

  const segs = useMemo(() => segments(state), [state]);
  const st = useMemo(() => stats(state), [state]);
  /** ★ 挙げるのは最初の1件ではなく**いちばんひどい区間**。平均を一番壊しているのはそれ。 */
  const bad = useMemo(() => {
    const list = suspects(state);
    return list.length
      ? {
          worst: list.reduce((a, b) => (a.per > b.per ? a : b)),
          n: list.length,
        }
      : null;
  }, [state]);
  const json = useMemo(
    () => JSON.stringify(exportObj(state), null, 1),
    [state],
  );

  const song = useMemo(
    () =>
      state.songId ? musics.find((m) => m.id === state.songId) : undefined,
    [musics, state.songId],
  );

  // 現在の周の経過。中断中は中断した時点で止める。
  const elapsed = running
    ? Math.max(
        0,
        Math.floor(
          ((state.pausedAt ?? now) - state.marks[state.marks.length - 1]) /
            1000,
        ),
      )
    : 0;

  const modelOverhead = OVERHEAD_SEC[state.mode];
  // ★ now は1秒ごとの時計から取る（描画中に時刻を読むと、描き直すたびに値が変わる）。
  const staleMin =
    running && !paused
      ? (now - state.marks[state.marks.length - 1]) / 60000
      : 0;
  const showStale = !staleChecked && staleMin > 30;

  const doClear = () => {
    setUndoClear(state);
    update(clearRecords);
  };

  return (
    <ToolPage
      unit="vbs"
      morphKey="tool:lap"
      title="周回ラップ計測"
      icon="timer"
    >
      {/* ── 使い方。記録が無いうちは開いて出す ───────────────── */}
      <details className="neu-panel px-5 py-4 sm:px-6" open={!running}>
        <summary className="cursor-pointer text-sm font-bold text-slate-600">
          使い方
        </summary>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
          <li>
            <b>1.</b> 下の「測る条件」で周回する曲を選ぶ（曲の長さを引いて
            <b>オーバーヘッド</b>を出すため）。
          </li>
          <li>
            <b>2.</b> 1周目が始まった瞬間に <b>計測開始</b> を押す。
          </li>
          <li>
            <b>3.</b> あとは1周終わるたびに <b>周回した</b> を押すだけ。
          </li>
          <li>
            <b>4.</b> 休憩・部屋落ち・離席は <b>中断</b>。戻ったら <b>再開</b>。
            <span className="text-slate-500">
              中断していた時間は自動で平均から外れます。
            </span>
          </li>
          <li>
            <b>5.</b> 押し忘れた区間は一覧の <b>＋</b> で周回数を増やす。
            <span className="text-slate-500">
              区間の時間をその数で割った値がラップになるので、時刻の整合は壊れません。
            </span>
          </li>
        </ol>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
          計測中は画面の自動ロックを止めます（対応端末のみ）。記録はこの端末にだけ保存され、
          リロードしても続きから測れます。
        </p>
      </details>

      {saveError && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600">
          ⚠️
          記録を保存できていません。このままリロードすると消えます（プライベートブラウズなどで
          保存が禁止されている可能性があります）。
        </p>
      )}

      {showStale && (
        <Panel className="!py-4">
          <p className="text-sm text-slate-600">
            前回の記録が <b>{Math.round(staleMin)} 分前</b>
            で止まっています。このまま押すと、その空白がまるごと1周として入ります。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <NeuButton
              onClick={() => {
                doClear();
                setStaleChecked(true);
              }}
            >
              消して新しく始める
            </NeuButton>
            <NeuButton onClick={() => setStaleChecked(true)}>
              続きから測る
            </NeuButton>
          </div>
        </Panel>
      )}

      {/* ── 計測 ────────────────────────────────────────── */}
      <Panel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="直近ラップ"
            value={
              segs.filter((g) => !g.excluded).length
                ? fmtSec(lastPer(segs))
                : "—"
            }
            sub={running ? `通算 ${st.laps} 周` : "計測前"}
          />
          <Stat
            label={`直近${RECENT_LAPS}周の平均`}
            value={st.recent ? fmtSec(st.recent.avg) : "—"}
            sub={st.recent ? `${st.recent.n} 周ぶん` : "2周ぶんから"}
          />
          <Stat
            label="全体平均"
            value={st.avg != null ? fmtSec(st.avg) : "—"}
            sub={st.avg != null ? `${st.laps} 周 / ${fmtMin(st.sec)}` : "秒"}
          />
          <Stat
            label="オーバーヘッド"
            value={st.overhead != null ? fmtSec(st.overhead) : "—"}
            sub={`曲以外の秒数（既定 ${modelOverhead} 秒）`}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat
            label="この時速なら"
            value={st.runsPerHour != null ? st.runsPerHour.toFixed(1) : "—"}
            sub="周/時"
          />
          <Stat
            label="時速ポイント"
            value={
              st.ptPerHour != null ? `${(st.ptPerHour / 1e6).toFixed(2)}M` : "—"
            }
            sub={
              state.ptPerRun > 0
                ? `1周 ${state.ptPerRun.toLocaleString()} Pt`
                : "1周の獲得Ptを入れると出ます"
            }
          />
        </div>

        {/**
         * ★ ラップが曲より短いことは本来ありえない（曲を最後まで聴かないと終わらない）。
         *   出たなら押し間違いか、選んでいる曲が違う。差の解説を出すより先にそこを疑わせる。
         */}
        {st.overhead != null && st.overhead < 0 && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">
            平均ラップが曲の長さ（{state.songSec}{" "}
            秒）より短くなっています。連打・押し間違いか、
            <b>選んでいる曲が違います</b>
            。曲を選び直すか、おかしい区間を除外してください。
          </p>
        )}
        {st.overhead != null && st.overhead >= 0 && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            サイト全体の見積りは{LAP_MODE_LABEL[state.mode]}で{" "}
            <b>{modelOverhead} 秒</b> を置いています。あなたの実測は{" "}
            <b>{fmtSec(st.overhead)} 秒</b>で、
            {Math.abs(st.overhead - modelOverhead) < 3
              ? "ほぼ同じです。"
              : st.overhead < modelOverhead
                ? `${fmtSec(modelOverhead - st.overhead)} 秒ぶん速く回せています。`
                : `${fmtSec(st.overhead - modelOverhead)} 秒ぶん余計にかかっています。`}
          </p>
        )}

        {running && (
          <p
            className="mt-3 text-center text-sm text-slate-500"
            aria-live="off"
          >
            {paused ? (
              <span className="font-bold text-amber-700">
                中断中（時計は止まっています）
              </span>
            ) : (
              <>
                いまの周 <b className="text-base tabular-nums">{elapsed}</b> 秒
                経過中
              </>
            )}
          </p>
        )}

        {/* ── 押すところ ──────────────────────────────── */}
        <div className="mt-4">
          {!running ? (
            <>
              {/* ★ 何で測るのかを、押す直前に見せる。曲が違うとオーバーヘッドが丸ごとずれる。 */}
              <p className="mb-2 text-center text-xs text-slate-500">
                <b>{song?.title ?? state.songTitle ?? "曲を選んでください"}</b>
                {state.songSec > 0 && `（${state.songSec} 秒）`}で計測します
              </p>
              <ActionButton
                className="w-full py-5 text-lg"
                onClick={() => update((s) => tap(s, Date.now()))}
              >
                計測開始
                <span className="mt-1 block text-xs font-normal opacity-90">
                  1周目が始まった瞬間に押す
                </span>
              </ActionButton>
            </>
          ) : paused ? (
            <ActionButton
              className="w-full py-5 text-lg"
              onClick={() => update((s) => resume(s, Date.now()))}
            >
              再開する
              <span className="mt-1 block text-xs font-normal opacity-90">
                中断していたぶんは平均から外れます
              </span>
            </ActionButton>
          ) : (
            <ActionButton
              className="w-full py-7 text-xl"
              onClick={() => {
                update((s) => tap(s, Date.now()));
                if (navigator.vibrate) navigator.vibrate(18);
              }}
            >
              周回した
              <span className="mt-1 block text-xs font-normal opacity-90">
                {st.laps > 0 ? `通算 ${st.laps} 周` : "1周終わるたびに押す"}
              </span>
            </ActionButton>
          )}

          {running && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {!paused && (
                <NeuButton onClick={() => update((s) => pause(s, Date.now()))}>
                  中断する
                </NeuButton>
              )}
              <NeuButton disabled={paused} onClick={() => update(undo)}>
                1つ戻す
              </NeuButton>
              <NeuButton
                disabled={segs.length === 0}
                onClick={() =>
                  update((s) => toggleExclude(s, s.marks.length - 2))
                }
              >
                直前を除外
              </NeuButton>
              <NeuButton className="!text-rose-600" onClick={doClear}>
                全消去
              </NeuButton>
            </div>
          )}

          {undoClear && !running && (
            <div className="mt-3 text-center">
              <NeuButton
                onClick={() => {
                  setState(undoClear);
                  setUndoClear(null);
                }}
              >
                消した記録を戻す
              </NeuButton>
            </div>
          )}
        </div>

        {wake.failed && running && !paused && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            画面の消灯を止められませんでした。端末の<b>自動ロックを切って</b>
            ください （iOS は低電力モードだと止められません）。
          </p>
        )}

        {bad && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
            <b>
              #{bad.worst.i + 1} が {fmtSec(bad.worst.per)} 秒
            </b>
            です。休憩や部屋落ちなら除外、押し忘れなら一覧の ＋
            で周回数を増やしてください。
            {bad.n > 1 && ` ほかに ${bad.n - 1} 件。`}
            このままだと平均が壊れます。
            <NeuButton
              className="ml-2 !px-2 !py-0.5 !text-xs"
              onClick={() => update((s) => toggleExclude(s, bad.worst.i))}
            >
              #{bad.worst.i + 1} を除外
            </NeuButton>
          </div>
        )}
      </Panel>

      {/* ── 曲と条件 ─────────────────────────────────── */}
      <Panel title="測る条件">
        <Field
          label="周回する曲"
          hint="曲の長さを引いてオーバーヘッドを出します。"
        >
          <button
            type="button"
            onClick={() => setSongOpen(true)}
            disabled={loading}
            className="neu-raised neu-tactile flex w-full items-center gap-3 rounded-xl p-2.5 text-left disabled:opacity-50"
          >
            {song && (
              <img
                src={`${JACKET_BASE}${song.jacketLink}`}
                onError={onJacketError}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-slate-700">
                {song?.title ?? state.songTitle ?? "曲を選ぶ"}
              </span>
              <span className="block text-xs text-slate-500">
                {state.songSec > 0 ? `${state.songSec} 秒` : "長さ不明"}
                ・タップで変更
              </span>
            </span>
            <span
              className="material-icons shrink-0 text-slate-400"
              aria-hidden
            >
              search
            </span>
          </button>
        </Field>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="ライブの種類"
            hint="比べる既定のオーバーヘッドが変わります。"
          >
            <SegmentedControl
              options={MODE_OPTIONS}
              value={state.mode}
              compact
              onChange={(mode) => update((s) => ({ ...s, mode }))}
            />
          </Field>
          <Field
            label="焚き数"
            hint="時速ポイントは焚き数とセットでないと意味がありません。"
          >
            <TakiInput
              value={state.taki}
              onChange={(taki) => update((s) => ({ ...s, taki }))}
            />
          </Field>
        </div>

        <Field
          className="mt-4"
          label="1周の獲得ポイント（任意）"
          htmlFor="lap-pt"
          hint="リザルト画面の獲得ポイントをそのまま入れると、時速ポイントが出ます。"
        >
          <NeuInput
            id="lap-pt"
            inputMode="numeric"
            value={state.ptPerRun ? String(state.ptPerRun) : ""}
            placeholder="例: 96285"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ""));
              update((s) => ({ ...s, ptPerRun: Number.isFinite(n) ? n : 0 }));
            }}
          />
        </Field>

        {st.ptPerHour != null && state.taki > 0 && (
          <div className="mt-4 rounded-lg bg-emerald-100 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">
            実測の時速 <b>{Math.round(st.ptPerHour).toLocaleString()} pt/時</b>
            （焚き
            {state.taki}）が出ました。編成に取り込むと
            <b>必要稼働時間計算</b>と<b>周回プラン</b>がこの実測値で計算します。
            <span className="mt-2 flex flex-wrap items-center gap-2">
              {profile ? (
                <SaveToProfile
                  collect={() => ({
                    hourlyRate: Math.round(st.ptPerHour!),
                    taki: state.taki,
                  })}
                />
              ) : (
                <span>
                  <Link to="/settings" className="font-bold underline">
                    設定
                  </Link>
                  で編成を登録すると、ここから取り込めるようになります。
                </span>
              )}
            </span>
          </div>
        )}
      </Panel>

      {/* ── ラップ一覧 ───────────────────────────────── */}
      <Panel title="ラップ（新しい順）">
        {segs.length === 0 ? (
          <p className="text-sm text-slate-500">まだ記録がありません。</p>
        ) : (
          <ul className="divide-y divide-[color:var(--neu-lo)]">
            {segs
              .slice()
              .reverse()
              .map((g) => (
                <li
                  key={g.i}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                >
                  <span className="w-8 shrink-0 text-xs font-bold text-slate-400">
                    #{g.i + 1}
                  </span>
                  <span
                    className={`shrink-0 text-lg font-extrabold tabular-nums ${
                      g.excluded
                        ? "text-slate-400 line-through"
                        : g.per > (state.songSec || 0) * 3
                          ? "text-rose-600"
                          : "text-slate-700"
                    }`}
                  >
                    {fmtSec(g.per)}
                    <span className="ml-0.5 text-xs font-normal text-slate-500">
                      秒
                    </span>
                  </span>
                  {/* ★ 時刻は縮めない。押し忘れがどこで起きたかを後から突き合わせる唯一の手がかり。 */}
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {clock(g.at)}
                  </span>
                  {(g.excluded || g.n > 1) && (
                    <span className="shrink-0 text-xs font-bold text-slate-500">
                      {g.excluded && (g.reason === "break" ? "中断" : "除外")}
                      {g.n > 1 && `${g.excluded ? " / " : ""}${g.n}周ぶん`}
                    </span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <NeuButton
                      className="!px-2 !py-0.5 !text-xs"
                      onClick={() => update((s) => toggleExclude(s, g.i))}
                    >
                      {g.excluded ? "戻す" : "除外"}
                    </NeuButton>
                    <NeuButton
                      className="!px-2 !py-0.5 !text-xs"
                      aria-label={`#${g.i + 1} の周回数を減らす`}
                      disabled={g.n <= 1}
                      onClick={() =>
                        update((s) => setLapCount(s, g.i, g.n - 1))
                      }
                    >
                      −
                    </NeuButton>
                    <b className="w-4 text-center text-sm tabular-nums text-slate-600">
                      {g.n}
                    </b>
                    <NeuButton
                      className="!px-2 !py-0.5 !text-xs"
                      aria-label={`#${g.i + 1} の周回数を増やす`}
                      onClick={() =>
                        update((s) => setLapCount(s, g.i, g.n + 1))
                      }
                    >
                      ＋
                    </NeuButton>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Panel>

      <details className="neu-panel px-5 py-4 sm:px-6">
        <summary className="cursor-pointer text-sm font-bold text-slate-600">
          記録を書き出す（JSON）
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <NeuButton
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(json);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
          >
            コピー
          </NeuButton>
          <NeuButton
            onClick={() => {
              const b = new Blob([json], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(b);
              const d = new Date();
              const p = (n: number) => String(n).padStart(2, "0");
              a.download = `lap-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            ファイルで保存
          </NeuButton>
          {copied && (
            <span role="status" className="self-center text-xs text-slate-600">
              コピーしました
            </span>
          )}
        </div>
        <textarea
          readOnly
          value={json}
          rows={8}
          className="mt-3 w-full rounded-lg bg-neu p-3 font-mono text-xs text-slate-700 shadow-neu-inset"
        />
      </details>

      {songOpen && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          title="周回する曲を選ぶ"
          meta={(m) => (m.musicTime ? `${m.musicTime} 秒` : "")}
          onSelect={(m) => {
            update((s) => ({
              ...s,
              songId: m.id,
              songTitle: m.title,
              // 長さが入っていない曲を選んだときに 0 を書き込むと、
              // オーバーヘッドが「曲長ゼロ」で出て桁ごと嘘になる。前の値を残す。
              songSec: m.musicTime > 0 ? m.musicTime : s.songSec,
            }));
            setSongOpen(false);
          }}
          onClose={() => setSongOpen(false)}
        />
      )}
    </ToolPage>
  );
}

/** 集計に入っている区間のうち、いちばん新しいものの1周あたり秒数。 */
function lastPer(segs: ReturnType<typeof segments>): number {
  const use = segs.filter((g) => !g.excluded);
  return use.length ? use[use.length - 1].per : 0;
}
