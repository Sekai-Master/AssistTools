import { useMemo, useState } from "react";
import { Field } from "../../components/ui/Field";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { SongSearchModal } from "../../components/SongSearchModal";
import { ENVY_ID } from "../analyzer/lib/constants";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  useRankingMusics,
  type Difficulty,
  type RankingMusic,
} from "../ranking/useRankingMusics";
import { encoreGap, encoreVerdict, parseRoomBest } from "./encoreLogic";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;
const NO_ALIASES: never[] = [];

/**
 * 既定の難易度。協力の時間あたり 1 位は独りんぼエンヴィー EXPERT（効率曲ランキングの既定の条件、
 * 台帳 4.2）。アンコールの重みは難易度で変わる（EXPERT 0.148・MASTER 0.129）ので選べるようにする。
 */
const DEFAULT_DIFFICULTY: Difficulty = "expert";

/** 出どころの印。文字で出す（色だけに頼らない）。語は知識ガイドの 0.1 の表と揃える。 */
function Mark({ children }: { children: string }) {
  return <span className="text-xs text-slate-500">〔{children}〕</span>;
}

const pct = (r: number) => `${(Math.abs(r) * 100).toFixed(1)}%`;
const pts = (n: number) => `${Math.abs(n).toLocaleString("ja-JP")} 点`;

/**
 * 実効値計算機の結果の下に置く、畳んだ 1 段「アンコールは誰が取るとよいか」。
 *
 * ★ 既定は閉じる（煩雑さの直し #247 の MoreSettings と同じ考え方）。#247 がまだ main に無いので
 *   素の <details> で作り、見た目（neu-panel・min-h-11 の見出し・data-icon の矢印）を合わせた。
 * ★ 楽曲データ（musicScoreData.json と transformedMusics.json、圧縮前で約 1.7MB）は段を開いてから読む。
 * ★ 判定は「実効値で比べて誰が取ると部屋が得か」。実際に誰が取るかは直前のスコアで決まる
 *   （運営者の実感・プレイヤーの間の話で、公式の説明は無い）ので、「取れる」とは書かない。
 *
 * @param myEffective 上の結果の実効値。まだ出ていなければ null（判定しない）
 * @param myRange 候補が複数ある編成（特訓前のユニットキャラ）の [最小, 最大]。このとき myEffective は画面の平均
 * @param power 総合力（「入力に反映」で編成から読んだ値）。無ければ割合だけ出す
 */
export function EncoreAdvice({
  myEffective,
  myRange,
  power,
}: {
  myEffective: number | null;
  myRange: readonly [number, number] | null;
  power: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [bestRaw, setBestRaw] = useState("");
  const [songId, setSongId] = useState(ENVY_ID);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [picking, setPicking] = useState(false);
  const { entries, error } = useRankingMusics(open);
  // ★ main の useRankingMusics は後から enabled にしても loading が false のまま（#251 で直す）。
  //   ここでは「開いていて、まだ何も無く、失敗もしていない」を読み込み中として扱う
  const loading = open && entries.length === 0 && !error;

  const songs = useMemo(() => {
    const seen = new Map<string, RankingMusic>();
    for (const e of entries) if (!seen.has(e.musicId)) seen.set(e.musicId, e);
    return [...seen.values()].map((e) => ({ id: e.musicId, title: e.title, jacketLink: e.jacketLink }));
  }, [entries]);

  const songDifficulties = useMemo(
    () =>
      DIFFICULTY_ORDER.filter((d) => entries.some((e) => e.musicId === songId && e.difficulty === d)),
    [entries, songId],
  );
  // 選んだ難易度が無い曲では、いちばん上の難易度に落とす（EASY に落ちて重みの小さい目安を出さない）
  const fallback = songDifficulties.at(-1);
  const entry =
    entries.find((e) => e.musicId === songId && e.difficulty === difficulty) ??
    entries.find((e) => e.musicId === songId && e.difficulty === fallback) ??
    null;

  const best = parseRoomBest(bestRaw);
  const judged = myEffective !== null && best.kind === "ok";
  const verdict = judged ? encoreVerdict(myEffective, best.value, myRange ?? undefined) : null;
  const gap = judged && entry && verdict !== "split" ? encoreGap(entry, myEffective, best.value, power) : null;
  const mineLabel = myRange
    ? `自分の実効値（候補 ${myRange[0]}〜${myRange[1]}、平均 ${myEffective}）`
    : `自分の実効値 ${myEffective}`;

  return (
    <details
      className="group neu-panel"
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (!e.currentTarget.open) setPicking(false);
      }}
    >
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-slate-600 sm:px-6">
        {/* ★ summary を flex にすると既定の三角が消えるので、矢印を自分で出す（#247 と同じ。文字は CSS で） */}
        <span
          aria-hidden
          data-icon="chevron_right"
          className="material-icons -ml-1 text-slate-500 transition-transform group-open:rotate-90"
        />
        アンコールは誰が取るとよいか
      </summary>

      <div className="space-y-4 border-t border-slate-300 px-4 pt-4 pb-6 sm:px-6">
        <p className="text-sm leading-relaxed text-slate-600">
          協力ライブのスキルの発動は 6 回で、参加 5 人が 1 回ずつと、最後のアンコールの 1 回です。各回に乗るのは、その回を取った人の実効値です
          <Mark>このサイトの計算</Mark>。アンコールを取るのは、その直前にスコアがいちばん高かった人です
          <Mark>走っている人の実感</Mark>
          <Mark>プレイヤーの間で</Mark>。
        </p>
        <p className="text-sm text-slate-600">アンコールの決まり方について、公式の説明は見当たりません。</p>

        <Field label="ほかの 4 人でいちばん高い実効値" htmlFor="evc-encore-best" className="max-w-md">
          <NeuInput
            id="evc-encore-best"
            inputMode="numeric"
            value={bestRaw}
            onChange={(e) => setBestRaw(e.target.value)}
            placeholder="例: 280"
          />
        </Field>

        <div role="status">
          {myEffective === null ? (
            <p className="text-sm text-slate-500">上で自分の実効値が出ると判定します。</p>
          ) : best.kind === "empty" ? (
            <p className="text-sm text-slate-500">ほかの 4 人でいちばん高い実効値を入れると判定します。</p>
          ) : best.kind === "negative" ? (
            <p className="text-sm text-amber-700">0 以上の数で入れてください。</p>
          ) : best.kind === "invalid" ? (
            <p className="text-sm text-amber-700">数字で入れてください。</p>
          ) : best.kind === "tooLarge" ? (
            <p className="text-sm text-amber-700">{best.max} 以下で入れてください。</p>
          ) : (
            verdict &&
            best.kind === "ok" && (
              <div>
                <p className="text-base font-bold" style={{ color: "var(--unit-color)" }}>
                  {verdict === "take"
                    ? "取りに行ってよい"
                    : verdict === "yield"
                      ? "アンコールの分では、譲るほうが部屋のスコアが上がります"
                      : "発動スキル値の候補によって分かれます"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {mineLabel} は、ほかの 4 人の最高 {best.value}
                  {verdict === "take" ? " と同じか上です。" : verdict === "yield" ? " より下です。" : " をまたいでいます。"}
                </p>
              </div>
            )
          )}
        </div>
        <p className="text-sm text-slate-600">
          アンコールを取るには、高い総合力と安定したプレイが要ります
          <Mark>走っている人の実感</Mark>。
        </p>

        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-600">曲ごとの差の目安</p>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <NeuButton
              className="!py-1.5"
              onClick={() => setPicking(true)}
              disabled={loading}
              aria-label={entry ? `曲を選ぶ（いまは ${entry.title}）` : undefined}
            >
              {entry ? entry.title : loading ? "読み込み中…" : "曲を選ぶ"}
            </NeuButton>
            <div role="group" aria-label="難易度" className="flex flex-wrap gap-2">
              {songDifficulties.map((d) => (
                <NeuButton key={d} className="!px-3 !py-1.5" active={entry?.difficulty === d} onClick={() => setDifficulty(d)}>
                  {DIFFICULTY_LABEL[d]}
                </NeuButton>
              ))}
            </div>
          </div>
          {judged && entry && verdict !== "split" && (
            <p role="status" className="text-sm text-slate-600">
              {gap === null
                ? "この曲は協力ライブの重みのデータが無いので、差を出せません。"
                : gap.ratio === 0
                  ? "誰が取っても 1 人あたりのスコアは同じで、差はありません。"
                  : `${verdict === "yield" ? "いちばん高い人が取ると" : "自分が取ると"}、${
                      gap.points !== null
                        ? `自分のスコアが約 ${pts(gap.points)}（${pct(gap.ratio)}）上がります（ほかの人も同じ割合）。`
                        : `1 人あたりのスコアが約 ${pct(gap.ratio)} 上がります。`
                    }`}
            </p>
          )}
          <p className="text-xs leading-relaxed text-slate-500">
            その曲のアンコールの重みで出した目安です。割合は実効値の低いほうが取ったときのスコアに対してで、ほかの 3 人もいちばん高い人と同じ実効値として出しています。
            {power !== null && power > 0
              ? `点は、編成から読んだ自分の総合力（${(power / 10_000).toFixed(1)} 万）で出しています（別の編成なら、もう一度「入力に反映」）。`
              : "設定で総合力つきの編成を登録して「入力に反映」を押すと、点でも出ます。"}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-600">譲るときは</p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
            <li>
              自分の難易度を下げる
              <Mark>プレイヤーの間で</Mark>。下げると、自分のスコアはその分下がります
              <Mark>このサイトの計算</Mark>
            </li>
            <li>
              取らせたい人に判定位置を調整してもらい（「判定プラス 20」など）、数ノーツ先に叩いてアンコールを取ってもらう手法もあります
              <Mark>走っている人の実感</Mark>
            </li>
          </ul>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          〔〕は出どころです。「このサイトの計算」はこのサイトのコードによる計算、「走っている人の実感」はこのサイトの運営者の実感、「プレイヤーの間で」はプレイヤーの間で共有されている話で、後の 2 つは公式の裏付けがありません。
        </p>
      </div>

      {picking && (
        <SongSearchModal
          musics={songs}
          aliases={NO_ALIASES}
          jacketBase={JACKET_BASE}
          onSelect={(m) => {
            setSongId(m.id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </details>
  );
}
