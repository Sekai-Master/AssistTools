import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
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
  LAP_LIVE_KIND,
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
  toRun,
  runToExport,
  type LapRun,
  type LapState,
} from "./lib/lap";
import { addRun, loadRuns, removeRun } from "./lib/runs";
import { LapHowTo } from "./LapHowTo";
import { LapActionBar } from "./LapActionBar";
import { useTapGuard } from "./useTapGuard";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/** 秒の表示。3桁になったら小数を落とす（幅が暴れると読み取りにくい）。 */
const fmtSec = (s: number) => (s >= 100 ? s.toFixed(0) : s.toFixed(1));
const clock = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const fmtMin = (sec: number) => `${(sec / 60).toFixed(1)} 分`;

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
  const [runs, setRuns] = useState<LapRun[]>(loadRuns);
  const [copiedRun, setCopiedRun] = useState<string | null>(null);
  /** 終了した直後の知らせ（保存できたか／何も残らなかったか）。 */
  const [finished, setFinished] = useState<string | null>(null);
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

  const modelOverhead = OVERHEAD_SEC[LAP_LIVE_KIND];
  // ★ now は1秒ごとの時計から取る（描画中に時刻を読むと、描き直すたびに値が変わる）。
  const staleMin =
    running && !paused
      ? (now - state.marks[state.marks.length - 1]) / 60000
      : 0;
  const showStale = !staleChecked && staleMin > 30;

  /**
   * 計測を終える。**1回ぶんの記録として保存してから、進行中の記録を空にする。**
   * ★ 保存できたかどうかを必ず伝える。測り終えた記録が消えていることに
   *   気付かないのが、この道具でいちばん痛い壊れ方。
   */
  const doFinish = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `run-${Date.now()}`;
    const run = toRun(state, id, Date.now());
    if (!run) {
      setFinished("1周も記録がないので、保存せず終了しました。");
      update(clearRecords);
      return;
    }
    const { runs: next, saved } = addRun(run);
    setRuns(next);
    setFinished(
      saved
        ? `${run.laps} 周ぶんを記録として保存しました。`
        : "⚠️ 記録を保存できませんでした（この端末に書き込めません）。下の書き出しからコピーしてください。",
    );
    update(clearRecords);
  };

  const doClear = () => {
    setUndoClear(state);
    update(clearRecords);
  };

  /**
   * ★ 状態（計測前・計測中・中断中）が変わった直後の約 600ms は、主ボタン・1つ戻す・全消去・終了して保存の
   *   押下を捨てる（検分 #241 高-1。二度押しで計測が消える・勝手に始まるのを防ぐ）。中断する・直前を除外は捨てない。
   *   曲の段の「曲を選ぶ」も捨てる（終了の直後の 2 回目がそこに来て、検索の画面が勝手に開くため。中-A の直しで並びが変わった）。
   */
  const blocked = useTapGuard(!running ? "idle" : paused ? "paused" : "running");

  /** 主ボタン 1 つで、計測開始・周回した・再開するを状態で替える。 */
  const onMain = () => {
    if (!running) {
      update((s) => tap(s, Date.now()));
    } else if (paused) {
      update((s) => resume(s, Date.now()));
    } else {
      update((s) => tap(s, Date.now()));
      if (navigator.vibrate) navigator.vibrate(18);
    }
  };

  /**
   * 測る条件（曲・焚き数・単価）。**一番上に置く。**
   * ★ 曲が違うとオーバーヘッドが丸ごとずれるので、最初に決めるものが最初に来る。
   *   決めたあとは畳んで、summary の1行だけ見えていれば足りる。
   */
  const condPanel = (
    <details className="neu-panel px-5 py-4 sm:px-6" open={!running}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
        {song && (
          <img
            src={`${JACKET_BASE}${song.jacketLink}`}
            onError={onJacketError}
            alt=""
            className="h-6 w-6 shrink-0 rounded object-cover"
          />
        )}
        <span className="min-w-0 flex-1 truncate">
          {song?.title ?? state.songTitle ?? "曲が未選択"}
          <span className="ml-2 font-normal text-slate-500">
            {state.songSec > 0 && `${state.songSec}秒`}
            {state.taki > 0 && ` / 焚き${state.taki}`}
            {state.ptPerRun > 0 &&
              ` / 1周 ${state.ptPerRun.toLocaleString()}Pt`}
          </span>
        </span>
      </summary>
      <div className="mt-4">
        <Field
          label="周回する曲"
          hint="曲の長さを引いてオーバーヘッドを出します。"
        >
          <button
            type="button"
            // ★ 終了の直後の二度押しがここに来る（操作の行が上にあるため）。状態の変わり目では捨てる
            onClick={() => !blocked() && setSongOpen(true)}
            disabled={loading}
            className="neu-raised neu-tactile flex w-full items-center gap-3 rounded-xl p-3 text-left disabled:opacity-50"
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
              className="material-icons shrink-0 text-slate-500"
              aria-hidden
            >
              search
            </span>
          </button>
        </Field>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
      </div>
    </details>
  );

  return (
    <ToolPage
      morphKey="tool:lap"
      title="周回ラップ計測"
      icon="timer"
    >
      {condPanel}

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

      {/* ── 計測前: 終了の知らせ・消した記録を戻す（あるときだけ） ─────────── */}
      {!running && (finished || undoClear) && (
        <Panel className="!py-4">
          {finished && (
            <p
              role="status"
              className="rounded-lg bg-emerald-100 px-3 py-2 text-xs leading-relaxed text-emerald-800"
            >
              {finished}
            </p>
          )}
          {undoClear && (
            <div className={finished ? "mt-3 text-center" : "text-center"}>
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
        </Panel>
      )}

      {/* ── 計測（計測中だけ） ──────────────────────────────── */}
      {/**
       * ★ 計測前の数字は 6 枚とも「—」で中身がないので出さない（検分 #241 高-1）。
       *   主ボタンは下の固定バー。ここに残るのは数字と、計測中だけの小さな操作の行。
       */}
      {running && (
        <Panel>
          {/**
           * ★ 操作の行は数字の上に置く（検分 #241 中-A）。数字 6 枚の下だと、390×664・375×667（Safari に近い高さ）や
           *   390×844 の 1 周後で、行が画面下の固定バーに隠れた。
           */}
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            {!paused && (
              <NeuButton onClick={() => update((s) => pause(s, Date.now()))}>
                中断する
              </NeuButton>
            )}
            <NeuButton disabled={paused} onClick={() => !blocked() && update(undo)}>
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
            <NeuButton className="!text-rose-600" onClick={() => !blocked() && doClear()}>
              全消去
            </NeuButton>
            {/* ★ 終了は破壊操作ではない（保存してから空にする）ので確認は挟まない。 */}
            <NeuButton onClick={() => !blocked() && doFinish()}>終了して保存</NeuButton>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="直近ラップ"
              value={
                segs.filter((g) => !g.excluded).length
                  ? fmtSec(lastPer(segs))
                  : "—"
              }
              sub={`通算 ${st.laps} 周`}
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
              サイト全体の見積りは協力ライブで <b>{modelOverhead} 秒</b>{" "}
              を置いています。あなたの実測は <b>{fmtSec(st.overhead)} 秒</b>で、
              {Math.abs(st.overhead - modelOverhead) < 3
                ? "ほぼ同じです。"
                : st.overhead < modelOverhead
                  ? `${fmtSec(modelOverhead - st.overhead)} 秒ぶん速く回せています。`
                  : `${fmtSec(st.overhead - modelOverhead)} 秒ぶん余計にかかっています。`}
            </p>
          )}

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
      )}

      {/* ── 使い方（初回も閉じる。計測のパネルの下） ─────────────── */}
      {/* ★ 計測の開始・終了で key を変えて閉じ直す。開いたまま測り始めると、操作のボタンと
          ラップ一覧の間に約 300px 挟まり続ける（前の open={!running} と同じく、計測中は閉じる）。 */}
      <LapHowTo key={running ? "running" : "idle"} />

      {/* ── 曲と条件 ─────────────────────────────────── */}
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

      {/* ── 終了して閉じた記録 ─────────────────────────── */}
      {runs.length > 0 && (
        <Panel title="保存した記録">
          <ul className="divide-y divide-[color:var(--neu-lo)]">
            {runs.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-bold tabular-nums text-slate-700">
                    {stamp(r.startedAt)} → {stamp(r.endedAt)}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {/* ★ コピーと保存を1つのボタンに束ねない。押した結果が2つ起きると、
                        どちらが起きたのか（どちらが失敗したのか）分からなくなる。 */}
                    <NeuButton
                      className="!px-2 !py-0.5 !text-xs"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            JSON.stringify(runToExport(r), null, 1),
                          );
                          setCopiedRun(r.id);
                          setTimeout(() => setCopiedRun(null), 2000);
                        } catch {
                          setCopiedRun(null);
                        }
                      }}
                    >
                      コピー
                    </NeuButton>
                    <NeuButton
                      className="!px-2 !py-0.5 !text-xs"
                      onClick={() =>
                        downloadJson(
                          `lap-${new Date(r.startedAt).toISOString().slice(0, 16).replace(/[-:T]/g, "")}.json`,
                          JSON.stringify(runToExport(r), null, 1),
                        )
                      }
                    >
                      保存
                    </NeuButton>
                    <NeuButton
                      className="!px-2 !py-0.5 !text-xs !text-rose-600"
                      onClick={() => setRuns(removeRun(r.id))}
                    >
                      削除
                    </NeuButton>
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {copiedRun === r.id && (
                    <span
                      role="status"
                      className="mr-1 font-bold text-emerald-800"
                    >
                      コピーしました
                    </span>
                  )}
                  <b className="text-slate-600">{r.laps} 周</b>
                  {r.avgSec != null && ` / 平均 ${r.avgSec} 秒`}
                  {r.overheadSec != null && ` / OH ${r.overheadSec} 秒`}
                  {r.ptPerHour != null &&
                    ` / ${(r.ptPerHour / 1e6).toFixed(2)}M/h`}
                  {r.songTitle && ` / ${r.songTitle}`}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <NeuButton
              onClick={() =>
                downloadJson(
                  "lap-records.json",
                  JSON.stringify(runs.map(runToExport), null, 1),
                )
              }
            >
              すべてまとめて書き出す
            </NeuButton>
          </div>
        </Panel>
      )}

      <details className="neu-panel px-5 py-4 sm:px-6">
        <summary className="cursor-pointer text-sm font-bold text-slate-600">
          いまの計測を書き出す（JSON）
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

      {/* ── 主ボタン（画面下に固定。どの状態でも同じ場所・同じ大きさ） ───────── */}
      <LapActionBar
        line={
          !running ? (
            // ★ 何で測るのかを、押す直前に見せる。曲が違うとオーバーヘッドが丸ごとずれる。
            <>
              <b>{song?.title ?? state.songTitle ?? "曲を選んでください"}</b>
              {state.songSec > 0 && `（${state.songSec} 秒）`}で計測します
            </>
          ) : paused ? (
            <span className="font-bold text-amber-700">中断中（時計は止まっています）</span>
          ) : (
            <>
              いまの周 <b className="tabular-nums">{elapsed}</b> 秒経過中
            </>
          )
        }
        label={!running ? "計測開始" : paused ? "再開する" : "周回した"}
        sub={
          !running
            ? "1周目が始まった瞬間に押す"
            : paused
              ? "中断していたぶんは平均から外れます"
              : st.laps > 0
                ? `通算 ${st.laps} 周`
                : "1周終わるたびに押す"
        }
        onPress={() => !blocked() && onMain()}
      />
    </ToolPage>
  );
}

function downloadJson(name: string, text: string): void {
  const b = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 日付つきの時刻。記録の一覧は日をまたぐので、時刻だけでは足りない。 */
function stamp(ms: number): string {
  const d = new Date(ms);
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}(${w}) ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 集計に入っている区間のうち、いちばん新しいものの1周あたり秒数。 */
function lastPer(segs: ReturnType<typeof segments>): number {
  const use = segs.filter((g) => !g.excluded);
  return use.length ? use[use.length - 1].per : 0;
}
