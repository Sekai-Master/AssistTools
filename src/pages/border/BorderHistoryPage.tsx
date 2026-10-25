import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { NeuButton } from "../../components/ui/NeuButton";
import { Panel } from "../../components/ui/Panel";
import { Segmented } from "../../components/ui/Segmented";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ToolPage } from "../../components/ui/ToolPage";
import { UNIT_COLOR_VAR, type UnitKey } from "../../lib/units";
import { formatMan } from "../../../workers/border/src/posts";
import {
  HISTORY_RANKS,
  HISTORY_TYPES,
  hourGroups,
  idList,
  missingOf,
  parseFinals,
  pickEvent,
  pickTypes,
  poolOf,
  rankRows,
  standings,
  type HistoryEvent,
  type HistoryMode,
  type HistoryRank,
  type Place,
} from "./historyView";

/*
 * 歴代ボーダー（2026-10-25 Nori「ランキングと各イベントの分析体制が固まったので一つページ機能増やしても」）。
 * 2026-10-25 にボーダー予測と一緒にハブへ載せた（カテゴリ「イベント」）。
 * 並べ方は Bot の歴代ボーダーの画像と同じ（historyView.ts）。表は1回読むだけ（D1 の読み取りは1行）。
 * 200・500・2000位とワールドリンク、種別の出し入れは 2026-10-25 Nori「一部のイベントのデータがないことを明記しつつ参照可能に」
 * 「WLも入れる・チアフルを抜く、みたいな調整」。
 */

/** events の unit → サイトのユニットのキー（混合・バーチャル・シンガーはバーチャル・シンガーの色） */
const UNIT_KEY: Record<string, UnitKey> = {
  light_sound: "ln",
  idol: "mmj",
  street: "vbs",
  theme_park: "wxs",
  school_refusal: "n25",
  piapro: "vs",
};

/** 種別の札の色。ダーク表示の値も持たせる（index.css の remap に無い色なので light-dark で書く） */
const TYPE_CHIP: Record<string, CSSProperties> = {
  marathon: { color: "light-dark(#0369a1, #7dd3fc)", background: "light-dark(#f0f9ff, #1c2c3a)" },
  cheerful_carnival: { color: "light-dark(#b45309, #f0b45f)", background: "light-dark(#fffbeb, #332b1c)" },
  memories: { color: "light-dark(#6d28d9, #c4b5fd)", background: "light-dark(#f5f3ff, #2e2640)" },
  world_bloom: { color: "light-dark(#be123c, #ff7d99)", background: "light-dark(#fff1f2, #3a2129)" },
};

// 外から来た文字列で引くので、素のオブジェクトの持ち物（constructor など）を拾わない
const own = <T,>(rec: Record<string, T>, key: string): T | undefined => (Object.hasOwn(rec, key) ? rec[key] : undefined);

const MODE_OPTIONS: { value: HistoryMode; label: string }[] = [
  { value: "final", label: "終値" },
  { value: "daily", label: "日速" },
  { value: "same", label: "同じ長さ" },
];
const RANK_OPTIONS = HISTORY_RANKS.map((r) => ({ value: r, label: `${r}位` }));

const logoSrc = (asset: string) => `${import.meta.env.BASE_URL}CardDatas/logo/${encodeURIComponent(asset)}.webp`;

function useFinals(): { events: HistoryEvent[]; loading: boolean; failed: boolean } {
  const [state, setState] = useState({ events: [] as HistoryEvent[], loading: true, failed: false });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${import.meta.env.BASE_URL}api/border/finals`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ events: parseFinals(await res.json()), loading: false, failed: false });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setState({ events: [], loading: false, failed: true });
      });
    return () => ctrl.abort();
  }, []);
  return state;
}

export default function BorderHistoryPage() {
  const { events, loading, failed } = useFinals();
  const [params, setParams] = useSearchParams();
  const target = useMemo(() => pickEvent(events, params.get("event")), [events, params]);
  const typesParam = params.get("types");
  const types = useMemo(() => pickTypes(typesParam), [typesParam]);
  const pool = useMemo(() => poolOf(events, types, target), [events, types, target]);
  const standingRef = useRef<HTMLElement>(null);

  const update = (next: Record<string, string>) => setParams({ ...Object.fromEntries(params), ...next }, { replace: true });
  const select = (id: number, scroll = false) => {
    update({ event: String(id) });
    // 表の行から選んだときは、結果の出る「位置づけ」まで戻す（表の下の方で押すと、上で変わったのが見えない。レビュー M2）
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      standingRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };
  const toggleType = (t: string) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    // 全部外すと何も比べられないので、最後の1つは外させない
    if (next.length > 0) update({ types: next.join(",") });
  };

  return (
    <ToolPage morphKey="tool:border-history" title="歴代ボーダー" icon="military_tech">
      <p className="text-sm leading-7 text-slate-600">
        終わったイベントの最終ボーダー（終値）を、全部の回と並べて比べます。
        長さの違う回は終値では比べにくいので、1日あたり（日速）に直した順位と、同じ長さの回だけの順位も出します。
      </p>
      <p className="mt-1 text-sm">
        <Link to="/border" className="font-bold text-slate-600 underline underline-offset-4">
          開催中のイベントのボーダー予測へ
        </Link>
      </p>

      {loading && (
        <Panel>
          <p role="status" className="text-sm text-slate-500">
            読み込み中…
          </p>
        </Panel>
      )}
      {!loading && (failed || !target) && (
        <Panel>
          <p role="alert" className="text-sm text-slate-600">
            {failed
              ? "データを読み込めませんでした。時間をおいて開き直してください。"
              : "まだ表に回がありません。イベントが終わると、翌日までにここに足されます。"}
          </p>
        </Panel>
      )}
      {!loading && !failed && target && (
        <>
          <Panel title="比べる回">
            <div role="group" aria-label="比べる種別" className="flex flex-wrap gap-2">
              {HISTORY_TYPES.map((t) => (
                <NeuButton key={t.value} active={types.includes(t.value)} onClick={() => toggleType(t.value)}>
                  {t.label}
                </NeuButton>
              ))}
            </div>
            <p className="mt-3 text-xs leading-6 text-slate-500">
              押すと出し入れできます（最初はワールドリンクを外しています。X の歴代ボーダーの画像と同じ数え方です）。
              選んでいる回は、種別を外しても比べる回に入れます。
            </p>
          </Panel>
          <StandingPanel ref={standingRef} all={events} pool={pool} target={target} onSelect={(id) => select(id)} />
          <RankingPanel pool={pool} target={target} onSelect={(id) => select(id, true)} />
          <NotePanel />
        </>
      )}
    </ToolPage>
  );
}

function TypeChip({ e }: { e: HistoryEvent }) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold leading-4"
      style={own(TYPE_CHIP, e.type) ?? TYPE_CHIP.marathon}
    >
      {e.typeLabel}
    </span>
  );
}

function PlaceText({ p }: { p: Place }) {
  return (
    <span className="tabular-nums">
      <span className="text-base font-bold text-slate-800">{p.pos}位</span>
      <span className="ml-0.5 text-xs text-slate-500">/{p.of}回</span>
    </span>
  );
}

function StandingPanel({
  ref,
  all,
  pool,
  target,
  onSelect,
}: {
  ref: Ref<HTMLElement>;
  all: HistoryEvent[];
  pool: HistoryEvent[];
  target: HistoryEvent;
  onSelect: (id: number) => void;
}) {
  // 読めなかったロゴの素材名（回を選び直せば、別の素材名なので出し直す）
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const logoOk = target.asset !== failedLogo;
  const rows = useMemo(() => standings(pool, target), [pool, target]);
  const newestFirst = useMemo(() => [...all].sort((a, b) => b.id - a.id), [all]);
  return (
    <section ref={ref} className="scroll-mt-20">
      <Panel title="位置づけ">
        <label className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-bold">イベント</span>
          <select
            className="neu-inset min-w-0 max-w-full flex-1 rounded-lg bg-transparent px-3 py-2 text-sm text-slate-700"
            value={target.id}
            onChange={(ev) => onSelect(Number(ev.target.value))}
          >
            {newestFirst.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {target.asset && logoOk && (
            <img src={logoSrc(target.asset)} alt="" className="h-20 w-auto drop-shadow-md" onError={() => setFailedLogo(target.asset)} />
          )}
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800">{target.name}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <TypeChip e={target} />
              <span className="tabular-nums">
                {target.days}日（{target.hours}時間）・{target.start} 開始
              </span>
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {rows.map((s) => (
            <div key={s.rank} className="neu-inset rounded-xl p-4">
              <p className="text-xs font-bold text-slate-500">{s.rank}位</p>
              {s.final == null ? (
                <p className="mt-2 text-xs leading-6 text-slate-500">この回は {s.rank}位の記録がありません。</p>
              ) : (
                <>
                  <p className="text-xl font-bold tabular-nums text-slate-800">{formatMan(s.final)}</p>
                  <dl className="mt-2 space-y-1 text-xs text-slate-500">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <dt>全体（終値）</dt>
                      <dd>
                        <PlaceText p={s.total} />
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <dt>同じ{target.hours}時間の回</dt>
                      <dd>{s.same.of > 1 ? <PlaceText p={s.same} /> : <span className="font-bold text-slate-700">はじめての長さ</span>}</dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <dt>日速に換算</dt>
                      <dd>
                        <PlaceText p={s.daily} />
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <dt>日速</dt>
                      <dd className="font-bold tabular-nums text-slate-700">{s.perDay != null ? formatMan(s.perDay) : "—"}</dd>
                    </div>
                  </dl>
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function RankingPanel({ pool, target, onSelect }: { pool: HistoryEvent[]; target: HistoryEvent; onSelect: (id: number) => void }) {
  const [rank, setRank] = useState<HistoryRank>("50");
  const [mode, setMode] = useState<HistoryMode>("final");
  const groups = useMemo(() => hourGroups(pool), [pool]);
  // 長さを選んだときの回の id と一緒に覚える。回を選び直したら、その回の長さに戻す
  const [picked, setPicked] = useState<{ id: number; hours: number } | null>(null);
  const hours = picked?.id === target.id ? picked.hours : target.hours;
  const setHours = (h: number) => setPicked({ id: target.id, hours: h });
  const rows = useMemo(() => rankRows(pool, rank, mode, hours), [pool, rank, mode, hours]);
  const missing = useMemo(() => missingOf(pool, rank, mode, hours), [pool, rank, mode, hours]);
  // 並べる値の列は太く。スマホでは並べる値の列だけ出す（2列並べると横にはみ出す）
  const daily = mode === "daily";
  const finalCol = daily ? "hidden sm:table-cell" : "font-bold text-slate-800";
  const dailyCol = daily ? "font-bold text-slate-800" : "hidden sm:table-cell";
  const modeLabel = MODE_OPTIONS.find((m) => m.value === mode)?.label ?? "";

  // 選んだ回の行を、表の枠の中で真ん中あたりに出す（ページ全体はスクロールさせない）
  const box = useRef<HTMLDivElement>(null);
  const mine = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (box.current && mine.current) box.current.scrollTop = mine.current.offsetTop - box.current.clientHeight / 2;
  }, [target.id, rank, mode, hours, pool]);

  return (
    <Panel title="歴代ランキング">
      <div role="group" aria-label="順位" className="mb-3">
        <Segmented options={RANK_OPTIONS} value={rank} onChange={(v) => setRank(v as HistoryRank)} />
      </div>
      <div role="group" aria-label="並べ方">
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} />
      </div>
      {mode === "same" && (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <span className="font-bold">長さ</span>
          <select className="neu-inset rounded-lg bg-transparent px-3 py-2 text-sm text-slate-700" value={hours} onChange={(ev) => setHours(Number(ev.target.value))}>
            {groups.map((g) => (
              <option key={g.hours} value={g.hours}>
                {g.hours}時間（{g.count}回）
              </option>
            ))}
          </select>
        </label>
      )}
      {missing.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-700">
          {rank}位は {missing.length}回ぶんの記録がありません（{idList(missing)}回）。この表には入れていません。
        </p>
      )}
      <div
        ref={box}
        tabIndex={0}
        role="region"
        aria-label={`${rank}位の歴代ランキング（${modeLabel}）`}
        className="relative mt-4 max-h-[70vh] overflow-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
      >
        {/* スマホでは 種別・日数・時間 の列を畳んで、イベント名の下に小さく出す（横にはみ出させない） */}
        <table className="w-full text-sm">
          <caption className="sr-only">
            {rank}位の歴代ランキング（{modeLabel}の大きい順・{rows.length}回）
          </caption>
          <thead className="sticky top-0 z-10 bg-neu">
            <tr className="text-left text-xs text-slate-500">
              <th scope="col" className="px-2 py-2 font-bold">
                #
              </th>
              <th scope="col" className="px-2 py-2 font-bold">
                イベント
              </th>
              <th scope="col" className="hidden px-2 py-2 font-bold sm:table-cell">
                種別
              </th>
              <th scope="col" className="hidden px-2 py-2 text-right font-bold sm:table-cell">
                日数
              </th>
              <th scope="col" className="hidden px-2 py-2 text-right font-bold sm:table-cell">
                時間
              </th>
              <th scope="col" className={`px-2 py-2 text-right font-bold ${daily ? "hidden sm:table-cell" : ""}`}>
                終値
              </th>
              <th scope="col" className={`px-2 py-2 text-right font-bold ${daily ? "" : "hidden sm:table-cell"}`}>
                日速
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const me = r.event.id === target.id;
              const bar = UNIT_COLOR_VAR[own(UNIT_KEY, r.event.unit) ?? "vs"];
              return (
                <tr
                  key={r.event.id}
                  ref={me ? mine : undefined}
                  className={me ? "bg-slate-100 font-bold text-slate-800" : "text-slate-600"}
                  style={me ? { boxShadow: `inset 4px 0 0 ${bar}` } : undefined}
                >
                  <td className="px-2 py-1.5 align-top tabular-nums text-slate-500 sm:align-middle">{r.pos}</td>
                  <td className="px-2 py-1.5">
                    {/* ★ word-break:auto-phrase（文節で折る）は試して外した。文節が長い名前で列が広がり、スマホで値の列が切れた（2026-10-25） */}
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => onSelect(r.event.id)}
                      aria-current={me ? "true" : undefined}
                    >
                      {r.event.name}
                    </button>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-normal tabular-nums text-slate-500 sm:hidden">
                      <TypeChip e={r.event} />
                      {r.event.days}日・{r.event.hours}h
                    </span>
                  </td>
                  <td className="hidden px-2 py-1.5 sm:table-cell">
                    <TypeChip e={r.event} />
                  </td>
                  <td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell">{r.event.days}日</td>
                  <td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell">{r.event.hours}h</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${finalCol}`}>{formatMan(r.final)}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${dailyCol}`}>{formatMan(r.perDay)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-4 text-sm text-slate-500">この条件の回はありません。</p>}
      </div>
    </Panel>
  );
}

function NotePanel() {
  return (
    <Panel title="この表について">
      <ul className="list-disc space-y-1 pl-5 text-xs leading-6 text-slate-500">
        <li>テストイベントは除いています。ワールドリンクは全体のランキングの終値です（章ごとのランキングではありません）。</li>
        <li>200・500・2000位は、87〜123回の一部で記録が見つかっていません。その回はその順位の表に入れず、表の上に回の番号を書いています。</li>
        <li>日速＝終値÷時間×24。短い回ほど日速は高く出やすいので、長さの違う回どうしの比べは目安です。</li>
        <li>終値は sekai.best と Moesekai の公開データから取り、順位の確定（集計終了の約10分後）より後の値だけを使っています。イベントが終わると、翌日までにここに足されます。</li>
      </ul>
    </Panel>
  );
}
