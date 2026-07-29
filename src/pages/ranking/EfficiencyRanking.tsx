import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Segmented } from "../../components/ui/Segmented";
import { TakiInput } from "../../components/ui/TakiInput";
import {
  useRankingMusics,
  DIFFICULTY_ORDER,
  DIFFICULTY_LABEL,
  type Difficulty,
} from "./useRankingMusics";
import { rankSongs, totalWithLb, type RankingMode, type EfficiencyParams } from "./lib/efficiency";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;
const STORE_KEY = "sekai-master:ranking-inputs";

const MODE_OPTIONS: { value: RankingMode; label: string }[] = [
  { value: "manual", label: "手動周回" },
  { value: "auto", label: "オート周回" },
  { value: "challenge", label: "チャレライ" },
];

/** タブごとに「何を最大化しているか」を明示する。混同すると最適解が真逆になるため。 */
const MODE_NOTE: Record<RankingMode, { headline: string; body: string; metricLabel: string }> = {
  manual: {
    headline: "時間あたりのイベントポイント",
    body: "手で叩くので律速は時間。短い曲ほど有利になります。",
    metricLabel: "Pt/時",
  },
  auto: {
    headline: "1プレイあたりのイベントポイント",
    body: "放置するので時間はコストになりません。律速はライブボーナスなので、1回で多く稼げる長尺・高基礎点の曲が有利です。手動とは最適解が逆になります。",
    metricLabel: "Pt/回",
  },
  challenge: {
    headline: "1プレイあたりのスコア",
    body: "1日1回なので時間もライボも関係ありません。イベント基礎点も無関係で、純粋にスコアだけを見ます。",
    metricLabel: "スコア",
  },
};

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");
const fmt = (n: number) => Math.round(n).toLocaleString("ja-JP");

interface Stored {
  power?: string;
  bonus?: string;
  taki?: number;
  skillUp?: string;
  overhead?: string;
  lb?: string;
}

function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

export default function EfficiencyRanking() {
  const { entries, loading, error } = useRankingMusics();
  const stored = useMemo(loadStored, []);

  const [mode, setMode] = useState<RankingMode>("manual");
  const [diffFilter, setDiffFilter] = useState<Difficulty | "all">("all");
  const [power, setPower] = useState(stored.power ?? "250000");
  const [bonus, setBonus] = useState(stored.bonus ?? "400");
  const [taki, setTaki] = useState(stored.taki ?? 5);
  const [skillUp, setSkillUp] = useState(stored.skillUp ?? "120");
  const [overhead, setOverhead] = useState(stored.overhead ?? "20");
  const [lb, setLb] = useState(stored.lb ?? "");

  // 入力は毎回同じものを打ち直させない。次回開いたときの初期値にする。
  const persist = (patch: Stored) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadStored(), ...patch }));
    } catch {
      /* プライベートモード等で書けなくても機能は落とさない */
    }
  };

  const params: EfficiencyParams = useMemo(
    () => ({
      power: Number(power) || 0,
      bonus: Number(bonus) || 0,
      taki,
      skillUp: Number(skillUp) || 0,
      overheadSec: Number(overhead) || 0,
    }),
    [power, bonus, taki, skillUp, overhead],
  );

  const ranked = useMemo(() => {
    const filtered =
      diffFilter === "all" ? entries : entries.filter((e) => e.difficulty === diffFilter);
    return rankSongs(filtered, params, mode).slice(0, 50);
  }, [entries, params, mode, diffFilter]);

  const note = MODE_NOTE[mode];
  const lbNum = Number(lb) || 0;

  return (
    <ToolPage unit="ln" title="効率曲ランキング" icon="leaderboard" wide>
      <Panel>
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <p className="mt-4 text-sm font-bold text-slate-600">{note.headline}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{note.body}</p>
      </Panel>

      <Panel title="あなたの条件">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="総合力">
            <NeuInput
              inputMode="numeric"
              value={power}
              onChange={(e) => {
                const v = onlyDigits(e.target.value);
                setPower(v);
                persist({ power: v });
              }}
            />
          </Field>
          {mode !== "challenge" && (
            <Field label="イベントボーナス（%）">
              <NeuInput
                inputMode="numeric"
                value={bonus}
                onChange={(e) => {
                  const v = onlyDigits(e.target.value);
                  setBonus(v);
                  persist({ bonus: v });
                }}
              />
            </Field>
          )}
          <Field label="スキルのスコアアップ（%）">
            <NeuInput
              inputMode="numeric"
              value={skillUp}
              onChange={(e) => {
                const v = onlyDigits(e.target.value);
                setSkillUp(v);
                persist({ skillUp: v });
              }}
            />
          </Field>
          {mode !== "challenge" && (
            <Field label="焚き数">
              <TakiInput
                value={taki}
                onChange={(v) => {
                  setTaki(v);
                  persist({ taki: v });
                }}
              />
            </Field>
          )}
          {mode === "manual" && (
            <Field label="1曲あたりのロス（秒）" hint="ロード・リザルト・部屋待ちの合計">
              <NeuInput
                inputMode="numeric"
                value={overhead}
                onChange={(e) => {
                  const v = onlyDigits(e.target.value);
                  setOverhead(v);
                  persist({ overhead: v });
                }}
              />
            </Field>
          )}
          {mode === "auto" && (
            <Field label="手持ちライブボーナス" hint="入れると総獲得ポイントを出します">
              <NeuInput
                inputMode="numeric"
                value={lb}
                onChange={(e) => {
                  const v = onlyDigits(e.target.value);
                  setLb(v);
                  persist({ lb: v });
                }}
              />
            </Field>
          )}
        </div>
        {mode !== "challenge" && (
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            イベントポイントの式にスコアが入るため、
            <span className="font-bold text-slate-600">総合力によって順位が入れ替わります</span>。
            総合力が低いうちは基礎点と曲の短さがほぼ全てですが、高くなるほど譜面そのものの質が効いてきます。
          </p>
        )}
      </Panel>

      <Panel title="難易度">
        <Segmented
          options={[
            { value: "all", label: "すべて" },
            ...DIFFICULTY_ORDER.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] })),
          ]}
          value={diffFilter}
          onChange={(v) => setDiffFilter(v as Difficulty | "all")}
        />
      </Panel>

      <Panel title={`ランキング（上位${ranked.length}件）`}>
        {loading && <p className="text-sm text-slate-500">楽曲データを読み込んでいます…</p>}
        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
        {!loading && !error && ranked.length === 0 && (
          <p className="text-sm text-slate-500">条件に合う楽曲がありません。</p>
        )}

        {ranked.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-2 py-2 font-bold">#</th>
                  <th className="px-2 py-2 font-bold">楽曲</th>
                  <th className="px-2 py-2 text-right font-bold">{note.metricLabel}</th>
                  <th className="px-2 py-2 text-right font-bold">
                    {mode === "challenge" ? "譜面Lv" : "1回のPt"}
                  </th>
                  <th className="px-2 py-2 text-right font-bold">曲長</th>
                  <th className="px-2 py-2 text-right font-bold">
                    {mode === "challenge" ? "ノーツ" : "基礎点"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => {
                  const top = ranked[0].metric;
                  const gap = top > 0 ? (r.metric / top - 1) * 100 : 0;
                  return (
                    <tr
                      key={`${r.musicId}-${r.difficulty}`}
                      className="border-t border-slate-200/60"
                    >
                      <td className="px-2 py-2 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={`${JACKET_BASE}${r.jacketLink}`}
                            alt=""
                            loading="lazy"
                            className="h-8 w-8 shrink-0 rounded"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-700">{r.title}</div>
                            <div className="text-xs text-slate-400">
                              {DIFFICULTY_LABEL[r.difficulty as Difficulty] ?? r.difficulty}
                              {r.playLevel != null && ` Lv${r.playLevel}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="font-bold tabular-nums text-slate-700">
                          {fmt(r.metric)}
                        </div>
                        {i > 0 && (
                          <div className="text-xs tabular-nums text-slate-400">
                            {gap.toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                        {mode === "challenge" ? (r.playLevel ?? "—") : fmt(r.eventPt)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                        {r.musicTime != null ? `${r.musicTime.toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                        {mode === "challenge" ? (r.noteCount ?? "—") : (r.eventRate ?? "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {mode === "auto" && lbNum > 0 && ranked.length > 0 && (
          <div className="mt-5 rounded-xl bg-neu p-4 text-sm shadow-neu-inset">
            {(() => {
              const best = ranked[0];
              const { plays, total } = totalWithLb(best.eventPt, lbNum, taki);
              const hours = (plays * best.cycleSec) / 3600;
              return (
                <>
                  <p className="font-bold text-slate-600">
                    ライボ {fmt(lbNum)} を {taki}焚きで「{best.title}」に全部回すと
                  </p>
                  <p className="mt-1 text-slate-500">
                    <span className="font-bold text-slate-700">{fmt(plays)}回</span> ／ 合計{" "}
                    <span className="font-bold text-slate-700">{fmt(total)} Pt</span> ／ 所要{" "}
                    {hours.toFixed(1)}時間
                  </p>
                </>
              );
            })()}
          </div>
        )}
      </Panel>

      <Panel title="この数字について">
        <ul className="space-y-2 text-xs leading-relaxed text-slate-500">
          <li>
            スコアは <code>(baseScore + Σ スキル% × 枠重み ÷ 100) × 総合力 × 4</code> で計算しています。
            baseScore と枠重みは楽曲ごとの実データで、譜面上のスキル発動位置が反映されています。
          </li>
          <li>
            全ノーツPERFECT（AP）を前提にした理論値です。
            <span className="font-bold text-slate-600">実際には精度で order が変わります</span>。
            判定係数は GREAT で 0.7 まで落ちるので、譜面が難しくて取りこぼす曲は表より不利になります。
          </li>
          <li>全枠に同じスコアアップ％を置いた想定です。実際の編成はカードごとに倍率が違います。</li>
          <li>
            スキル発動枠の並びを最適化できるかは未確定です。制御できる場合はこの表より伸び、
            ランダムなら平均としてこの値に近づきます。
          </li>
        </ul>
      </Panel>
    </ToolPage>
  );
}
