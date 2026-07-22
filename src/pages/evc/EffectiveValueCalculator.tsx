import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { Switch } from "../../components/ui/Switch";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { UNIT_COLOR_VAR, UNIT_LABEL, type UnitKey } from "../../lib/units";
import {
  type SkillCandidate,
  type SkillLevel,
  effectiveValue,
  formatCandidates,
  ocSkillCandidates,
  reverseVerdict,
  toHalfWidthNumber,
  trainedSkillValue,
  vsSkillValue,
  REVERSE_DEFAULT_LEADERS,
} from "./evcLogic";

const LEADER_PRESETS = [150, 140, 130, 120, 110, 100];
const SKILL_LEVELS: SkillLevel[] = [1, 2, 3, 4];
const NON_VS_UNITS: UnitKey[] = ["ln", "mmj", "vbs", "wxs", "n25"];

type LeaderKind = "preset" | "bulfes";
type TrainState = "trained" | "untrained";
type CharType = "vs" | "oc";

/** Lv選択の小さなボタン群。 */
function LevelPicker({ value, onChange }: { value: SkillLevel; onChange: (v: SkillLevel) => void }) {
  return (
    <div className="flex gap-2">
      {SKILL_LEVELS.map((lv) => (
        <NeuButton key={lv} active={value === lv} onClick={() => onChange(lv)}>
          Lv{lv}
        </NeuButton>
      ))}
    </div>
  );
}

export default function EffectiveValueCalculator() {
  const [mode, setMode] = useState<"forward" | "reverse">("forward");

  // 順方向 — 先頭スキル値の決め方
  const [leaderKind, setLeaderKind] = useState<LeaderKind>("preset");
  const [presetLeader, setPresetLeader] = useState("150");
  // ブルフェス
  const [train, setTrain] = useState<TrainState>("trained");
  const [rank, setRank] = useState("");
  const [level, setLevel] = useState<SkillLevel>(4);
  const [charType, setCharType] = useState<CharType>("vs");
  const [units, setUnits] = useState<Set<UnitKey>>(new Set());
  // 内部値
  const [detailMode, setDetailMode] = useState(false);
  const [inner, setInner] = useState("");
  const [slots, setSlots] = useState<string[]>(["", "", "", ""]);
  // 逆算
  const [effInput, setEffInput] = useState("");
  const [revLeader, setRevLeader] = useState("");

  const isOc = leaderKind === "bulfes" && train === "untrained" && charType === "oc";
  const slotVals = slots.map((s) => toHalfWidthNumber(s) ?? 0);

  // 先頭スキル値の候補（OCのみ複数）。OCは値ごとの個数(count)を保持し、
  // 平均・表示を legacy 同様に「4枠の生候補」ベースで個数重み付けする。
  const leaderCandidates = useMemo<SkillCandidate[]>(() => {
    if (leaderKind === "preset") {
      const v = toHalfWidthNumber(presetLeader);
      return v === null ? [] : [{ value: v, count: 1 }];
    }
    if (train === "trained") {
      const r = toHalfWidthNumber(rank);
      return r === null ? [] : [{ value: trainedSkillValue(level, r), count: 1 }];
    }
    if (charType === "vs") return [{ value: vsSkillValue(level, units.size), count: 1 }];
    return ocSkillCandidates(level, slotVals);
  }, [leaderKind, presetLeader, train, rank, level, charType, units, slotVals]);

  const ocCandidateLabel = isOc ? formatCandidates(ocSkillCandidates(level, slotVals)) : "";

  // 実効値（候補ごと、個数付き）
  const forwardResults = useMemo(() => {
    if (leaderCandidates.length === 0) return [];
    return leaderCandidates.map((cand) => {
      const leader = cand.value;
      // 内部値 = 先頭 + 他4枠合計（詳細/OC）or 単一入力
      const innerTotal =
        detailMode || isOc
          ? leader + slotVals.reduce((a, b) => a + b, 0)
          : (toHalfWidthNumber(inner) ?? 0);
      return { leader, count: cand.count, effective: effectiveValue(leader, innerTotal) };
    });
  }, [leaderCandidates, detailMode, isOc, slotVals, inner]);

  // 表示用に実効値を個数集計（同一実効値が複数候補から出るケースを「値(個数)」でまとめる）。
  const forwardEffectiveCandidates = useMemo<SkillCandidate[]>(() => {
    const counts = new Map<number, number>();
    for (const r of forwardResults) counts.set(r.effective, (counts.get(r.effective) ?? 0) + r.count);
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  }, [forwardResults]);

  // 個数重み付き平均（legacy: 4枠の生候補の平均）。候補が実質1種なら非表示。
  const forwardAvg = useMemo(() => {
    const total = forwardResults.reduce((a, r) => a + r.count, 0);
    if (forwardEffectiveCandidates.length <= 1 || total === 0) return null;
    return Math.round(forwardResults.reduce((a, r) => a + r.effective * r.count, 0) / total);
  }, [forwardResults, forwardEffectiveCandidates]);

  // 逆算
  const reverseResults = useMemo(() => {
    const eff = toHalfWidthNumber(effInput);
    if (eff === null) return [];
    // 未入力・0 は「代表値ごとに一覧表示」（0を指定しても意味のある逆算にならないため）。
    const leaderVal = toHalfWidthNumber(revLeader);
    const leaders =
      leaderVal !== null && leaderVal !== 0 ? [leaderVal] : [...REVERSE_DEFAULT_LEADERS];
    return leaders.map((leader) => ({ leader, verdict: reverseVerdict(eff, leader) }));
  }, [effInput, revLeader]);

  const toggleUnit = (u: UnitKey) =>
    setUnits((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });

  return (
    <ToolPage unit="mmj" title="スキル実効値計算機" icon="calculate">
      <SegmentedControl
        options={[
          { value: "forward", label: "順方向（→実効値）" },
          { value: "reverse", label: "逆算（→内部値）" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "forward" ? (
        <>
          <Panel title="先頭スキル値">
            <div className="flex flex-wrap gap-2">
              {LEADER_PRESETS.map((v) => (
                <NeuButton
                  key={v}
                  active={leaderKind === "preset" && toHalfWidthNumber(presetLeader) === v}
                  onClick={() => {
                    setLeaderKind("preset");
                    setPresetLeader(String(v));
                  }}
                >
                  {v}
                </NeuButton>
              ))}
              <NeuButton active={leaderKind === "bulfes"} onClick={() => setLeaderKind("bulfes")}>
                ブルフェス
              </NeuButton>
            </div>

            {leaderKind === "preset" && (
              <Field label="任意の先頭スキル値" htmlFor="evc-leader" className="mt-4">
                <NeuInput
                  id="evc-leader"
                  inputMode="numeric"
                  value={presetLeader}
                  onChange={(e) => setPresetLeader(e.target.value)}
                  placeholder="例: 150"
                />
              </Field>
            )}

            {leaderKind === "bulfes" && (
              <div className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <NeuButton active={train === "trained"} onClick={() => setTrain("trained")}>
                    特訓後
                  </NeuButton>
                  <NeuButton active={train === "untrained"} onClick={() => setTrain("untrained")}>
                    特訓前
                  </NeuButton>
                </div>

                {train === "trained" ? (
                  <>
                    <Field label="キャラクターランク" htmlFor="evc-rank">
                      <NeuInput
                        id="evc-rank"
                        inputMode="numeric"
                        value={rank}
                        onChange={(e) => setRank(e.target.value)}
                        placeholder="例: 60（100で頭打ち）"
                      />
                    </Field>
                    <Field label="スキルレベル">
                      <LevelPicker value={level} onChange={setLevel} />
                    </Field>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <NeuButton active={charType === "vs"} onClick={() => setCharType("vs")}>
                        バーチャルシンガー
                      </NeuButton>
                      <NeuButton active={charType === "oc"} onClick={() => setCharType("oc")}>
                        ユニットキャラ
                      </NeuButton>
                    </div>
                    <Field label="スキルレベル">
                      <LevelPicker value={level} onChange={setLevel} />
                    </Field>
                    {charType === "vs" && (
                      <Field
                        label="編成に含むユニット（VS以外）"
                        hint="混成数（最大2）に応じて発動スキル値が上がります"
                      >
                        <div className="flex flex-wrap gap-2">
                          {NON_VS_UNITS.map((u) => (
                            <NeuButton
                              key={u}
                              active={units.has(u)}
                              onClick={() => toggleUnit(u)}
                              // 各チップは自分のユニット色を --unit-color に上書きし、
                              // neu-selected のグラデをそのユニット色から生成させる。
                              style={{ ["--unit-color" as string]: UNIT_COLOR_VAR[u] }}
                            >
                              {UNIT_LABEL[u]}
                            </NeuButton>
                          ))}
                        </div>
                      </Field>
                    )}
                    {charType === "oc" && ocCandidateLabel && (
                      <p className="text-sm text-slate-600">
                        発動スキル値候補: <span className="font-bold">{ocCandidateLabel}</span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </Panel>

          <Panel title="内部値（編成5枠のスキル値合計）">
            {!isOc && (
              <Switch checked={detailMode} onChange={setDetailMode} label="スキル値を個別に入力する" />
            )}
            {detailMode || isOc ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {slots.map((s, i) => (
                  <Field key={i} label={`${i + 2}枠目のスキル値`} htmlFor={`evc-slot-${i}`}>
                    <NeuInput
                      id={`evc-slot-${i}`}
                      inputMode="numeric"
                      value={s}
                      onChange={(e) =>
                        setSlots((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      placeholder="例: 150"
                    />
                  </Field>
                ))}
              </div>
            ) : (
              <Field label="内部値" htmlFor="evc-inner" className="mt-4">
                <NeuInput
                  id="evc-inner"
                  inputMode="numeric"
                  value={inner}
                  onChange={(e) => setInner(e.target.value)}
                  placeholder="例: 620"
                />
              </Field>
            )}
          </Panel>

          <Panel>
            <p className="text-sm text-slate-500">この編成の実効値は</p>
            <p className="mt-1 text-4xl font-extrabold" style={{ color: "var(--unit-color)" }}>
              {forwardEffectiveCandidates.length === 0
                ? "—"
                : formatCandidates(forwardEffectiveCandidates)}
            </p>
            {forwardAvg !== null && (
              <p className="text-sm text-slate-500">（平均 {forwardAvg}）</p>
            )}
            <p className="text-sm text-slate-500">です。</p>
          </Panel>
        </>
      ) : (
        <>
          <Panel title="逆算">
            <Field label="実効値" htmlFor="evc-eff">
              <NeuInput
                id="evc-eff"
                inputMode="numeric"
                value={effInput}
                onChange={(e) => setEffInput(e.target.value)}
                placeholder="例: 244"
              />
            </Field>
            <Field label="先頭スキル値（任意）" htmlFor="evc-revleader" hint="未入力なら代表値ごとに一覧" className="mt-4">
              <NeuInput
                id="evc-revleader"
                inputMode="numeric"
                value={revLeader}
                onChange={(e) => setRevLeader(e.target.value)}
                placeholder="例: 150"
              />
            </Field>
          </Panel>

          <Panel title="内部値">
            {reverseResults.length === 0 ? (
              <p className="text-slate-500">実効値を入力してください。</p>
            ) : (
              <ul className="space-y-2">
                {reverseResults.map(({ leader, verdict }) => (
                  <li key={leader} className="flex items-baseline gap-3">
                    <span className="w-14 shrink-0 text-sm text-slate-500">先頭 {leader}</span>
                    {verdict.kind === "value" ? (
                      <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                        {verdict.inner.toFixed(1)}
                        {verdict.bulfes && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            ※ブルフェス個体を含む編成
                          </span>
                        )}
                      </span>
                    ) : verdict.kind === "recheck" ? (
                      <span className="text-sm text-slate-500">実効値を再確認してください</span>
                    ) : (
                      <span className="text-sm text-slate-500">該当なし</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </ToolPage>
  );
}
