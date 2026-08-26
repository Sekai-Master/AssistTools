import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { TakiInput } from "../../components/ui/TakiInput";
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
    options,
    selected,
    loading,
    error,
    runtime,
  } = config;

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
            <p className="text-sm text-slate-500">
              {error
                ? "楽曲データを読めませんでした。下の「1回のPt」を手で入れれば計算できます。"
                : "休憩に「オート」を付けると候補が出ます。"}
            </p>
          )}
        </Field>

        <Field
          label="1回のPt"
          htmlFor="pl-auto-pt"
          hint="空欄なら上の曲から計算します。実測があれば入れてください（そちらが優先）"
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
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500">
          スキルの内部値（オートのスコア計算に使う）
        </summary>
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
      </details>

      <p className="mt-3 text-xs text-slate-500">
        {runtime.ptPerPlay > 0 && runtime.cycleSec > 0 ? (
          <>
            1回{" "}
            <span className="font-bold" style={{ color: "var(--unit-color)" }}>
              {Math.round(runtime.ptPerPlay).toLocaleString()} pt
            </span>{" "}
            ・ 1周期 {Math.round(runtime.cycleSec)}秒 ・ 上限 {runtime.dailyCap}回で{" "}
            {fmtDuration((capHours * 60))}
            {hasOverride && <span className="text-slate-400">（Ptは手入力を使用）</span>}
          </>
        ) : (
          "曲を選ぶか「1回のPt」を入れると、休憩ブロックにオートを積めます。"
        )}
      </p>
    </Panel>
  );
}
