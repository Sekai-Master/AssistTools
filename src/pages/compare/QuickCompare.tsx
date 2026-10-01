import { useEffect, useMemo, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { TakiInput } from "../../components/ui/TakiInput";
import { SongSearchModal } from "../../components/SongSearchModal";
import { getActiveProfile, useProfiles, type Profile } from "../../lib/profiles";
import { cn } from "../../lib/utils";
import { ENVY_ID } from "../analyzer/lib/constants";
import { bestIndex, compareDecks, findUpset, type DeckCandidate } from "../deck/lib/compare";
import { UpsetNote } from "../deck/UpsetNote";
import { DEFAULT_PARAMS, OVERHEAD_BY_LIVE, type LiveType } from "../ranking/lib/efficiency";
import { DIFFICULTY_LABEL, type Difficulty, type RankingMusic } from "../ranking/useRankingMusics";
import {
  COMPARE_DIFFICULTIES,
  MAX_ROWS,
  checkRow,
  emptyRow,
  loadState,
  lossFromBest,
  nextName,
  saveState,
  uniqueNames,
  type QuickRow,
} from "./lib/quickCompare";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

type NumKey = "power" | "bonus" | "leader" | "total";
const FIELDS: readonly { key: NumKey; label: string; placeholder: string }[] = [
  { key: "power", label: "総合力", placeholder: "351149" },
  { key: "bonus", label: "ボーナス(%)", placeholder: "425" },
  { key: "leader", label: "リーダー(%)", placeholder: "150" },
  { key: "total", label: "内部値(%)", placeholder: "710" },
];

const n = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString());
const pct1 = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
/** 4つとも入っている登録済みの編成だけ、足すボタンにする */
const usableProfile = (p: Profile) =>
  [p.power, p.bonus, p.skillLeader, p.skillTotal].every((v) => typeof v === "number" && Number.isFinite(v));

/**
 * 編成かんたん比較の本体（楽曲データは外から受け取る。テストで差し込めるように）。
 *
 * ★ 計算は編成ビルダーの比較と同じ compareDecks。カードを組まずに、ゲーム内やプロフィールの
 *   4つの数字（総合力・ボーナス・リーダー・内部値）だけで1回のPtを並べるための入口。
 */
export function QuickCompare({ entries, loading, error }: { entries: RankingMusic[]; loading: boolean; error: string | null }) {
  const saved = useMemo(() => loadState(), []);
  const [rows, setRows] = useState<QuickRow[]>(() => saved.rows ?? [emptyRow("A"), emptyRow("B")]);
  const [songId, setSongId] = useState(saved.songId ?? ENVY_ID);
  const [difficulty, setDifficulty] = useState<Difficulty>(saved.difficulty ?? "master");
  const [live, setLive] = useState<LiveType>(saved.live ?? "multi");
  const [taki, setTaki] = useState(() => saved.taki ?? getActiveProfile()?.taki ?? DEFAULT_PARAMS.taki);
  const [picking, setPicking] = useState(false);
  const profiles = useProfiles().filter(usableProfile);

  useEffect(() => saveState({ rows, songId, difficulty, live, taki }), [rows, songId, difficulty, live, taki]);

  /** 曲選択用に「1曲1行」へ畳んだもの（entries は曲×難易度の粒度） */
  const songs = useMemo(() => {
    const seen = new Map<string, RankingMusic>();
    for (const e of entries) if (!seen.has(e.musicId)) seen.set(e.musicId, e);
    return [...seen.values()].map((e) => ({ id: e.musicId, title: e.title, jacketLink: e.jacketLink }));
  }, [entries]);

  const entry = useMemo(
    () =>
      entries.find((e) => e.musicId === songId && e.difficulty === difficulty) ??
      entries.find((e) => e.musicId === songId) ??
      null,
    [entries, songId, difficulty]
  );

  const checks = rows.map((r, i) => checkRow(r, `編成${i + 1}`));
  const usable = rows.flatMap((r, i) => {
    const c = checks[i];
    return c.ok ? [{ id: r.id, candidate: c.candidate }] : [];
  });
  // 同じ名前が並ぶと表と逆転の文で見分けられないので、2つ目から (2) を付ける
  const names = uniqueNames(usable.map((u) => u.candidate.name));
  const results = entry
    ? compareDecks(
        usable.map((u, i): DeckCandidate => ({ ...u.candidate, name: names[i] })),
        entry,
        // ★ ロスはライブ種別に追随させる（編成ビルダーの比較と同じ）
        { live, taki, overheadSec: OVERHEAD_BY_LIVE[live] }
      )
    : [];
  const best = bestIndex(results);
  const bestPt = best >= 0 ? results[best].eventPt : null;
  const upset = findUpset(results);

  const update = (id: string, patch: Partial<QuickRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, emptyRow(nextName(prev))]));
  const removeRow = (id: string) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  /** 登録済みの編成を足す。まっさらな行があればそこに入れる */
  const addProfile = (p: Profile) =>
    setRows((prev) => {
      const filled: Partial<QuickRow> = {
        name: p.name,
        power: String(p.power),
        bonus: String(p.bonus),
        leader: String(p.skillLeader),
        total: String(p.skillTotal),
      };
      const blank = prev.find((r) => [r.power, r.bonus, r.leader, r.total].every((s) => s.trim() === ""));
      if (blank) return prev.map((r) => (r.id === blank.id ? { ...r, ...filled } : r));
      return prev.length >= MAX_ROWS ? prev : [...prev, { ...emptyRow(p.name), ...filled }];
    });

  return (
    <>
      <Panel title="編成">
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          内部値はリーダーを含む5枚のスコアアップの合計です。協力ライブのスコアは実効値（リーダー＋ほかの4枚の2割）で決まります。
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((r, i) => {
            const label = r.name.trim() || `編成${i + 1}`;
            const c = checks[i];
            return (
              <li key={r.id}>
                <fieldset aria-label={`編成 ${label}`} className="rounded-xl p-3 shadow-neu-sm">
                  <div className="flex items-center gap-2">
                    <NeuInput
                      aria-label="編成の名前"
                      value={r.name}
                      maxLength={12}
                      onChange={(e) => update(r.id, { name: e.target.value })}
                      className="!w-28 !py-1.5 text-sm font-bold"
                    />
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`${label} を外す`}
                        onClick={() => removeRow(r.id)}
                        className="ml-auto rounded-lg px-2 py-1 text-sm text-slate-500 shadow-neu-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {FIELDS.map((f) => (
                      <label key={f.key} className="block text-xs font-bold text-slate-500">
                        {f.label}
                        <NeuInput
                          value={r[f.key]}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={f.placeholder}
                          onChange={(e) => update(r.id, { [f.key]: e.target.value })}
                          className="mt-1 !py-2 text-base font-normal tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                  {c.ok ? (
                    <p className="mt-1.5 text-xs text-slate-500">実効値（協力） {pct1(c.effective)}%</p>
                  ) : (
                    c.reason && <p className="mt-1.5 text-xs text-amber-700">{c.reason}</p>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <NeuButton className="!py-1.5" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
            ＋ 編成を足す
          </NeuButton>
          {profiles.length > 0 && <span className="text-xs text-slate-500">登録した編成から:</span>}
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProfile(p)}
              className="rounded-full bg-neu px-3 py-1 text-xs font-bold text-slate-500 shadow-neu-sm"
            >
              {p.name}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="比べる条件">
        {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="曲" hint="順位の比べ方には曲選びはほとんど効きません（数字の大きさが実感に近くなるだけ）">
            <div className="flex flex-wrap items-center gap-2">
              <NeuButton className="!py-1.5" onClick={() => setPicking(true)} disabled={loading}>
                {entry ? entry.title : loading ? "読み込み中…" : "曲を選ぶ"}
              </NeuButton>
              <select
                aria-label="難易度"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="neu-inset rounded-lg px-2 py-1.5 text-sm text-slate-700"
              >
                {COMPARE_DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d]}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="ライブ種別・焚き数">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                options={[
                  { value: "multi", label: "協力" },
                  { value: "solo", label: "ソロ" },
                  { value: "auto", label: "オート" },
                ]}
                value={live}
                onChange={setLive}
                className="!max-w-56"
              />
              <TakiInput value={taki} onChange={setTaki} />
            </div>
          </Field>
        </div>
      </Panel>

      <Panel title="1回あたりのポイント">
        {results.length === 0 ? (
          <p className="text-sm text-slate-500">
            {loading
              ? "楽曲データを読み込んでいます…"
              : !entry
                ? "曲を選ぶと比べられます。"
                : "総合力・ボーナス・リーダー・内部値を入れると、ここに1回のポイントが出ます。"}
          </p>
        ) : (
          <>
            {/* 細い画面で名前が長いとき用に、横に送れるようにしておく（編成ビルダーの比較と同じ） */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="px-1.5 py-1 text-left font-bold">編成</th>
                    <th className="px-1.5 py-1 text-right font-bold">1回のPt</th>
                    <th className="px-1.5 py-1 text-right font-bold">Pt/時</th>
                    <th className="px-1.5 py-1 text-right font-bold">差</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const loss = lossFromBest(r.eventPt, bestPt);
                    return (
                      <tr
                        key={usable[i].id}
                        className={cn(i === best && "font-bold")}
                        style={i === best ? { color: "var(--unit-color)" } : undefined}
                      >
                        <td className="px-1.5 py-1.5">
                          {r.name}
                          {i === best && <span className="ml-1 text-xs">最良</span>}
                        </td>
                        <td className="px-1.5 py-1.5 text-right tabular-nums">{n(r.eventPt)}</td>
                        <td className="px-1.5 py-1.5 text-right tabular-nums">{n(r.ptPerHour)}</td>
                        <td className="px-1.5 py-1.5 text-right tabular-nums">
                          {i === best || loss == null ? "—" : `${(loss * 100).toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {upset && <UpsetNote upset={upset} />}
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              {taki}焚き・{entry?.title}（{DIFFICULTY_LABEL[difficulty]}）での概算です。計算は効率曲ランキング・編成ビルダーと同じ式で、
              スコアは総合力とスキルから見積もっています。オーバーヘッドは {OVERHEAD_BY_LIVE[live]} 秒（ライブ種別ごとの実測値）。
              ワールドリンクの総合力の上限は見ていません（編成ビルダーで比べてください）。
            </p>
          </>
        )}
      </Panel>

      {picking && (
        <SongSearchModal
          musics={songs}
          aliases={[]}
          jacketBase={JACKET_BASE}
          onSelect={(m) => {
            setSongId(m.id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
