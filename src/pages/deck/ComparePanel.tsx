import { useMemo, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { TakiInput } from "../../components/ui/TakiInput";
import { SongSearchModal } from "../../components/SongSearchModal";
import { useRankingMusics, DIFFICULTY_LABEL, type Difficulty } from "../ranking/useRankingMusics";
import { ENVY_ID } from "../analyzer/lib/constants";
import { DEFAULT_PARAMS, type LiveType } from "../ranking/lib/efficiency";
import { ProfileBar } from "../../components/ui/ProfileBar";
import { getActiveProfile } from "../../lib/profiles";
import { cn } from "../../lib/utils";
import { bestIndex, compareDecks, findUpset, type CompareCondition } from "./lib/compare";
import { evaluateDeck, type EvalContext } from "./lib/evaluate";
import { DECK_SIZE, type SavedDeck } from "./lib/deckStore";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/**
 * 編成の比較。**このツールの本体。**
 *
 * ゲーム内の「おまかせ編成」はイベントボーナスしか見ない。だから
 * 「ボーナスを少し落として総合力を盛った方が最終的なイベントPtで勝つ」編成は
 * ゲーム内では絶対に出てこない。それをここで出す。
 *
 * ★ スキル値は編成ごとに出せない（配信データにスキルの表が無い）。全編成に同じ値を
 *   使う近似であることを画面に書いてある。隠すと「編成ごとに計算されている」と
 *   誤解されて、スキルの差が結果に出ないことを不具合だと思われる。
 */
export function ComparePanel({
  decks,
  current,
  ctx,
}: {
  decks: SavedDeck[];
  /** いま画面で組んでいる編成（保存していなくても比較に混ぜられる）。 */
  current: { cardIds: (number | null)[]; leaderIndex: number; supportBonus: number };
  ctx: EvalContext;
}) {
  const { entries, loading, error } = useRankingMusics();
  const [songId, setSongId] = useState(ENVY_ID);
  const [difficulty, setDifficulty] = useState<Difficulty>("master");
  const [live, setLive] = useState<LiveType>("multi");
  // ★ スキルと焚き数は編成プロフィール（全ツール共通の入力）を初期値にする。
  //   ここだけ既定値で走ると、他のツールと違う前提の Pt が出て比べられなくなる。
  const [taki, setTaki] = useState(() => getActiveProfile()?.taki ?? DEFAULT_PARAMS.taki);
  const [skillLeader, setSkillLeader] = useState(
    () => String(getActiveProfile()?.skillLeader ?? DEFAULT_PARAMS.skillLeader)
  );
  const [skillTotal, setSkillTotal] = useState(
    () => String(getActiveProfile()?.skillTotal ?? DEFAULT_PARAMS.skillTotal)
  );
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  /** 曲選択用に「1曲1行」へ畳んだもの（entries は曲×難易度の粒度）。 */
  const songs = useMemo(() => {
    const seen = new Map<string, (typeof entries)[number]>();
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

  const candidates = useMemo(() => {
    const list: { name: string; cardIds: (number | null)[]; leaderIndex: number; supportBonus: number }[] = [
      { name: "いまの編成", ...current },
      ...decks.filter((d) => selected.includes(d.name)),
    ];
    return list.map((d) => {
      const ev = evaluateDeck(d.cardIds, d.leaderIndex, d.supportBonus, ctx);
      return {
        name: d.name,
        power: ev.power.total,
        // ★ 表示は切り捨てでも、比較は小数のまま（0.5% が最終Ptに効く）。
        bonus: ev.bonus?.total ?? 0,
        cardCount: ev.cards.length,
      };
    });
  }, [decks, current, ctx, selected]);

  const cond: CompareCondition = {
    live,
    taki,
    skillLeader: Number(skillLeader) || 0,
    skillTotal: Number(skillTotal) || 0,
    overheadSec: DEFAULT_PARAMS.overheadSec,
  };

  const rows = useMemo(
    () => (entry ? compareDecks(candidates, entry, cond) : []),
    // cond はレンダーごとに作り直されるので、中身を依存に並べる。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, entry, live, taki, skillLeader, skillTotal]
  );
  const best = bestIndex(rows);
  const upset = findUpset(rows);

  const n = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString());

  return (
    <Panel title="編成を比べる">
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="比べる曲" hint="順位の比較には曲選びはほとんど効きません（絶対値が実感に近くなるだけ）">
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
              {(["master", "append", "expert"] as const).map((d) => (
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

        <Field label="先頭スキル" htmlFor="cmp-skill-leader" hint="「150/710/31.3」の 150">
          <NeuInput
            id="cmp-skill-leader"
            inputMode="decimal"
            value={skillLeader}
            onChange={(e) => setSkillLeader(e.target.value.replace(/[^0-9.]/g, ""))}
            className="max-w-28 text-center"
          />
        </Field>
        <Field label="スキル合計" htmlFor="cmp-skill-total" hint="「150/710/31.3」の 710">
          <NeuInput
            id="cmp-skill-total"
            inputMode="decimal"
            value={skillTotal}
            onChange={(e) => setSkillTotal(e.target.value.replace(/[^0-9.]/g, ""))}
            className="max-w-28 text-center"
          />
        </Field>
      </div>

      {/* 押したときだけ反映する（黙って値が変わらない）。ProfileBar.tsx の作法どおり。 */}
      <div className="mt-3">
        <ProfileBar
          apply={(p) => {
            if (p.skillLeader != null) setSkillLeader(String(p.skillLeader));
            if (p.skillTotal != null) setSkillTotal(String(p.skillTotal));
            if (p.taki != null) setTaki(p.taki);
          }}
        />
      </div>

      {decks.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold text-slate-500">比較に混ぜる保存済み編成</p>
          <div className="flex flex-wrap gap-1.5">
            {decks.map((d) => (
              <button
                key={d.name}
                type="button"
                aria-pressed={selected.includes(d.name)}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(d.name) ? prev.filter((x) => x !== d.name) : [...prev, d.name]
                  )
                }
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold",
                  selected.includes(d.name) ? "neu-selected" : "bg-neu text-slate-500 shadow-neu-sm"
                )}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ★ イベント未選択のときは 0% として並べない（「ボーナス0の編成」に見えてしまう）。 */}
      {ctx.eventId == null ? (
        <p className="mt-4 text-sm text-slate-500">イベントを選ぶと比較できます。</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {loading ? "楽曲データを読み込んでいます…" : "曲を選ぶと比較できます。"}
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="px-2 py-1 text-left font-bold">編成</th>
                  <th className="px-2 py-1 text-right font-bold">ボーナス</th>
                  <th className="px-2 py-1 text-right font-bold">総合力</th>
                  <th className="px-2 py-1 text-right font-bold">スコア</th>
                  <th className="px-2 py-1 text-right font-bold">1回のPt</th>
                  <th className="px-2 py-1 text-right font-bold">Pt/時</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.name}
                    className={cn("rounded-lg", i === best && "font-bold")}
                    style={i === best ? { color: "var(--unit-color)" } : undefined}
                  >
                    <td className="px-2 py-1.5">
                      {r.name}
                      {i === best && <span className="ml-1 text-xs">← 最良</span>}
                      {/* ★ 5枚揃っていない編成は全一致（ユニット・属性の2倍）が付かないので、
                          総合力が実際より大幅に低い。並べるときに見えないと誤読される。 */}
                      {(candidates[i]?.cardCount ?? 0) < DECK_SIZE && (
                        <span className="ml-1 text-xs text-amber-600">
                          {candidates[i]?.cardCount ?? 0}枚
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.bonus}%</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n(r.power)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n(r.score)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n(r.eventPt)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n(r.ptPerHour)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ★ 逆転はこのツールの存在意義そのもの。数字を並べるだけだと見落とされる。 */}
          {upset && (
            <p className="mt-3 rounded-lg p-3 text-sm shadow-neu-inset text-slate-700">
              <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                ボーナスが低い方が勝っています。
              </span>{" "}
              「{upset.winner.name}」はボーナス {upset.winner.bonus}%（{upset.loser.name} より
              {(upset.loser.bonus - upset.winner.bonus).toFixed(1)}% 低い）ですが、総合力の差で
              最終ポイントは {Math.round((upset.winner.eventPt ?? 0) - (upset.loser.eventPt ?? 0)).toLocaleString()}
              pt 上回ります。ゲーム内のおまかせ編成では出てこない編成です。
            </p>
          )}

          <p className="mt-3 text-xs text-slate-400">
            スキルは全編成で同じ値を使って計算しています（カードからスキル値を出すためのデータを
            配信していないため）。総合力とボーナスの比較には影響しません。
            オーバーヘッドは {DEFAULT_PARAMS.overheadSec} 秒で固定です。
          </p>
        </>
      )}

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
    </Panel>
  );
}
