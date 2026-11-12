import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { TakiInput } from "../../components/ui/TakiInput";
import { SaveToProfile } from "../../components/ui/ProfileBar";
import { PASS_LABEL, type PassCourse } from "../ranking/lib/lbRun";
import { fmtDuration } from "./lib/format";
import type { AutoConfig } from "./useAutoConfig";

const COURSES: PassCourse[] = ["none", "deluxe", "precious"];

/**
 * 休憩中オートの設定。**曲・難易度・焚き数はプラン全体で1つ**（休憩ごとに変える人はいない）。
 * ブロック側が持つのは回数だけ。
 */
export function AutoPanel({ config }: { config: AutoConfig }) {
  const {
    course,
    setCourse,
    usedToday,
    setUsedToday,
    taki,
    setTaki,
    songKey,
    setSongKey,
    skillLeader,
    setSkillLeader,
    skillTotal,
    setSkillTotal,
    ptOverride,
    setPtOverride,
    hasOverride,
    cycleOverride,
    setCycleOverride,
    hasCycleOverride,
    options,
    selected,
    enabled,
    loading,
    runtime,
  } = config;

  // 手で入れた値が数字として読めないとき（空欄は除く）。これだけは利用者の入力の問題なので赤字で知らせる
  const badPt = ptOverride.trim() !== "" && !hasOverride;
  const badCycle = cycleOverride.trim() !== "" && !hasCycleOverride;

  const capHours = runtime.cycleSec > 0 ? (runtime.dailyCap * runtime.cycleSec) / 3600 : 0;

  return (
    <Panel title="オート（休憩中に回す）">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="カラフルパス"
          htmlFor="pl-auto-course"
          hint="オートの1日の回数上限が決まります（毎日4:00リセット）"
        >
          <select
            id="pl-auto-course"
            value={course}
            onChange={(e) => setCourse(e.target.value as PassCourse)}
            className="neu-inset w-full rounded-lg px-3 py-2 text-slate-700"
          >
            {COURSES.map((c) => (
              <option key={c} value={c}>
                {PASS_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="今日すでに回した回数"
          htmlFor="pl-auto-used"
          hint={`上限 ${runtime.dailyCap} 回のうち消化済みのぶん`}
        >
          <NeuInput
            id="pl-auto-used"
            inputMode="numeric"
            value={usedToday}
            onChange={(e) => setUsedToday(e.target.value.replace(/[^0-9]/g, ""))}
            className="max-w-24"
          />
        </Field>

        <Field label="焚き数" hint="回数に上限があるので、1回を濃くするほど得（ライボは焚き数ぶん減る）">
          <TakiInput value={taki} onChange={setTaki} />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="オートで回す曲"
          htmlFor="pl-auto-song"
          hint="オート効率の高い順。難易度でスコアが変わるので難易度込みで選びます"
        >
          {loading ? (
            <p className="text-sm text-slate-500">楽曲データを読み込み中…</p>
          ) : options.length > 0 ? (
            <select
              id="pl-auto-song"
              value={songKey}
              onChange={(e) => setSongKey(e.target.value)}
              className="neu-inset w-full rounded-lg px-3 py-2 text-slate-700"
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}（{o.eventPt.toLocaleString()}pt/回）
                </option>
              ))}
            </select>
          ) : (
            // 使う（休憩にオートがある）のに候補が無い＝読めなかった。周期も要るので所要まで入れてもらう。
            // ★ 入れるまでオートは 0 回のまま計画に載るので、灰色でなく注意の色にする（赤字は入力の誤りだけ。検分 #246）
            <p className={enabled ? "text-sm text-amber-700" : "text-sm text-slate-500"}>
              {enabled
                ? "楽曲データを読めませんでした。下の「1回のPt」と「1回の所要」を入れるまで、オートは 0 回で計算します。"
                : "休憩に「オート」を付けると候補が出ます。"}
            </p>
          )}
        </Field>

        {/* ★ 下の2つが空欄のときに使うのは「オートで回す曲」（未選択なら効率1位。useAutoConfig の
            selected）。周回プランで「上の曲」はページ上部の手動の曲を指す呼び名なので、補足文では
            そう呼ばない（UX 監査 2026-11-12。前の「上の曲から」はどちらの曲か紛らわしかった）。 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="1回のPt"
            htmlFor="pl-auto-pt"
            hint="空欄なら「オートで回す曲」の値。実測を入れればそちらが優先"
          >
            <div className="flex items-center gap-2">
              <NeuInput
                id="pl-auto-pt"
                inputMode="numeric"
                value={ptOverride}
                onChange={(e) => setPtOverride(e.target.value)}
                placeholder={selected ? String(selected.eventPt) : "例: 69125"}
                className="max-w-40"
              />
              <span className="text-sm text-slate-500">pt</span>
            </div>
          </Field>

          {/* ★ 曲データが読めないときの逃げ道。周期が0だと「休憩に何回入るか」が
              出せず、Ptだけ入れても回数0のままになる。 */}
          <Field
            label="1回の所要"
            htmlFor="pl-auto-cycle"
            hint="空欄なら「オートで回す曲」の長さ＋ロス"
          >
            <div className="flex items-center gap-2">
              <NeuInput
                id="pl-auto-cycle"
                inputMode="numeric"
                value={cycleOverride}
                onChange={(e) => setCycleOverride(e.target.value)}
                placeholder={selected ? String(Math.round(selected.cycleSec)) : "例: 225"}
                className="max-w-40"
              />
              <span className="text-sm text-slate-500">秒</span>
            </div>
          </Field>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500">
          スキルの内部値（オートのスコア計算に使う）
        </summary>
        <p className="mt-2 text-xs text-slate-400">
          ページ上部の「編成」→「入力に反映」で入ります。ここで直した値は下のボタンで編成へ戻せます。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">先頭</span>
          <NeuInput
            inputMode="numeric"
            value={skillLeader}
            onChange={(e) => setSkillLeader(e.target.value)}
            placeholder="150"
            className="max-w-20 text-center"
            aria-label="先頭スキル"
          />
          <span className="text-slate-500">合計</span>
          <NeuInput
            inputMode="numeric"
            value={skillTotal}
            onChange={(e) => setSkillTotal(e.target.value)}
            placeholder="650"
            className="max-w-20 text-center"
            aria-label="スキル合計"
          />
          <span className="text-xs text-slate-400">
            空欄なら既定値（150 / 650）で計算します
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <SaveToProfile
            collect={() => ({
              skillLeader: Number(skillLeader) || undefined,
              skillTotal: Number(skillTotal) || undefined,
            })}
          />
        </div>
      </details>

      {/**
       * ★ 下の 1 行は、赤字を利用者の入力の問題（数字として読めない値）だけにする（UX 監査 2026-11-12、PR-5）。
       *   前は周期が 0 なら必ず赤字で「曲を選ぶか『1回の所要』を入れてください」と出していたが、周期が 0 になるのは
       *   ① 休憩にオートを付けていない（初回）② 読み込み中 ③ 読めなかった、のどれかで、どれも利用者の誤りではない。
       *   その 3 つは上の「オートで回す曲」の欄が落ち着いた文で言うので、ここでは繰り返さない（何も出さない）。
       */}
      {(badPt || badCycle || runtime.cycleSec > 0) && (
        <p className="mt-3 text-xs text-slate-500">
          {badPt || badCycle ? (
            <span className="text-rose-600">
              {[badPt ? "「1回のPt」" : null, badCycle ? "「1回の所要」" : null].filter(Boolean).join("と")}
              は数字で入れてください（所要は 1 以上の秒数）。
            </span>
          ) : runtime.ptPerPlay > 0 && runtime.cycleSec > 0 ? (
            <>
              1回{" "}
              <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                {Math.round(runtime.ptPerPlay).toLocaleString()} pt
              </span>{" "}
              ・ 1周期 {Math.round(runtime.cycleSec)}秒 ・ 上限 {runtime.dailyCap}回で{" "}
              {fmtDuration(capHours * 60)}
              {(hasOverride || hasCycleOverride) && (
                <span className="text-slate-400">
                  （{[hasOverride ? "Pt" : null, hasCycleOverride ? "所要" : null]
                    .filter(Boolean)
                    .join("・")}
                  は手入力を使用）
                </span>
              )}
            </>
          ) : (
            "「1回のPt」を入れると、休憩ブロックにオートが積み上がります。"
          )}
        </p>
      )}
    </Panel>
  );
}
