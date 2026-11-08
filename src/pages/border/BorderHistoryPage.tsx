import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { NeuButton } from "../../components/ui/NeuButton";
import { Panel } from "../../components/ui/Panel";
import { Segmented } from "../../components/ui/Segmented";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ToolPage } from "../../components/ui/ToolPage";
import { eventUnitColor } from "../../lib/units";
import { formatMan } from "../../../workers/border/src/posts";
import { CHARACTERS, UNIT_ORDER, UNIT_SHORT, characterShort } from "../deck/lib/characters";
import { HistoryShapeChart } from "./HistoryShapeChart";
import {
  HISTORY_RANKS,
  HISTORY_TYPES,
  UNIT_FILTERS,
  filterLabel,
  hourGroups,
  idList,
  missingOf,
  parseBonusChars,
  parseFinals,
  pickChars,
  pickEvent,
  pickTypes,
  pickUnit,
  poolOf,
  rankRows,
  standings,
  type BonusChars,
  type HistoryEvent,
  type HistoryMode,
  type HistoryRank,
  type Place,
  type UnitFilter,
} from "./historyView";

/*
 * 歴代ボーダー（2026-10-25 Nori「ランキングと各イベントの分析体制が固まったので一つページ機能増やしても」）。
 * 2026-10-25 にボーダー予測と一緒にハブへ載せた（カテゴリ「イベント」）。
 * 並べ方は Bot の歴代ボーダーの画像と同じ（historyView.ts）。表は1回読むだけ（D1 の読み取りは1行）。
 * 200・500・2000位とワールドリンク、種別の出し入れは 2026-10-25 Nori「一部のイベントのデータがないことを明記しつつ参照可能に」
 * 「WLも入れる・チアフルを抜く、みたいな調整」。
 * 絞り込み（箱／混合・参加キャラ）を歴代ランキングの中に畳んで置き、推移のグラフを足したのは 2026-11-03 Nori
 *「比べる回の選択は歴代ランキングのソート入れ替えとかと並ぶように（間に選択中のイベントの子細が挟まるの操作しずらい）」
 *「箱イベと混合イベのフィルタ」「参加キャラでフィルタリング」「各ボーダーの遷移グラフ」。
 * キャラを複数選んだら全員そろう回、VS はユニットを問わず同じキャラ（同日 Nori）。
 */

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

/**
 * 回ごとのボーナスキャラ（編成ビルダーの配信データ bonuses.json・約300KB）。キャラで絞るとき・絞り込みを開いたときだけ読む。
 * 失敗したら null のまま（キャラでは絞らず、その旨を出す）
 */
function useBonusChars(enabled: boolean): { bonus: BonusChars | null; failed: boolean } {
  const [state, setState] = useState<{ bonus: BonusChars | null; failed: boolean }>({ bonus: null, failed: false });
  const done = state.bonus != null || state.failed;
  useEffect(() => {
    if (!enabled || done) return;
    const ctrl = new AbortController();
    fetch(`${import.meta.env.BASE_URL}CardDatas/bonuses.json`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ bonus: parseBonusChars(await res.json()), failed: false });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ bonus: null, failed: true });
      });
    return () => ctrl.abort();
  }, [enabled, done]);
  return state;
}

export default function BorderHistoryPage() {
  const { events, loading, failed } = useFinals();
  const [params, setParams] = useSearchParams();
  const target = useMemo(() => pickEvent(events, params.get("event")), [events, params]);
  const typesParam = params.get("types");
  const types = useMemo(() => pickTypes(typesParam), [typesParam]);
  const unit = pickUnit(params.get("unit"));
  const charsParam = params.get("chars");
  const chars = useMemo(() => pickChars(charsParam), [charsParam]);
  const [filterOpen, setFilterOpen] = useState(false);
  // キャラで絞っている・絞り込みを開いたときだけ読む（ふだんは 300KB を読ませない）
  const { bonus, failed: bonusFailed } = useBonusChars(chars.length > 0 || filterOpen);
  const pool = useMemo(() => poolOf(events, types, target, { unit, chars, bonus }), [events, types, target, unit, chars, bonus]);
  const label = filterLabel(types, unit, chars, characterShort);
  // キャラの条件は読み終わるまで効かない（読めなければ効かない）。位置づけと絞り込みにその旨を添える
  const charsFailed = chars.length > 0 && bonusFailed;
  const charsPending = chars.length > 0 && bonus == null && !bonusFailed;
  const charsNote = charsFailed ? "・キャラの条件は読み込めず外しています" : charsPending ? "・キャラの条件は読み込み中" : "";
  const standingRef = useRef<HTMLElement>(null);

  /**
   * URL の条件を書き換える。いまのアドレスバーの URL から作る。
   * ★ 描いたときの params からだと、続けて押したとき（「混合」→「ミク」）に描き直しが間に合わず、前の押下が消えた
   *   （2026-11-03 の画面の確認で実測。bonuses.json の読み込みと重なると起きた）。setParams に関数を渡す形も、
   *   react-router では描いたときの params が渡るので同じだった。URL の書き換え自体は押した時点で済んでいる。
   * 空の値は URL から消す（キャラを全部外した・箱／混合を「すべて」に戻した）
   */
  const update = (next: (prev: URLSearchParams) => Record<string, string> | null) => {
    const prev = new URLSearchParams(window.location.search);
    const n = next(prev);
    if (!n) return;
    setParams(Object.fromEntries(Object.entries({ ...Object.fromEntries(prev), ...n }).filter(([, v]) => v !== "")), { replace: true });
  };
  const select = (id: number, scroll = false) => {
    update(() => ({ event: String(id) }));
    // 表の行から選んだときは、結果の出る「位置づけ」まで戻す（表の下の方で押すと、上で変わったのが見えない。レビュー M2）
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      standingRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };
  const toggleType = (t: string) =>
    update((prev) => {
      const cur = pickTypes(prev.get("types"));
      const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      // 全部外すと何も比べられないので、最後の1つは外させない
      return next.length > 0 ? { types: next.join(",") } : null;
    });
  const toggleChar = (ch: number) =>
    update((prev) => {
      const cur = pickChars(prev.get("chars"));
      const next = cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch].sort((a, b) => a - b);
      return { chars: next.join(",") };
    });
  const openFilter = () => {
    setFilterOpen(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 開いて描き直してから動かす（畳んだままの高さで止まらないように）
    requestAnimationFrame(() => document.getElementById(FILTER_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
  };
  const resetFilter = () =>
    setParams(Object.fromEntries([...new URLSearchParams(window.location.search)].filter(([k]) => k !== "types" && k !== "unit" && k !== "chars")), { replace: true });
  const filter: FilterProps = {
    label,
    types,
    unit,
    chars,
    pending: charsPending,
    bonusFailed: charsFailed,
    open: filterOpen,
    onOpen: setFilterOpen,
    onType: toggleType,
    onUnit: (u) => update(() => ({ unit: u === "all" ? "" : u })),
    onChar: toggleChar,
    onReset: resetFilter,
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
          <StandingPanel
            ref={standingRef}
            all={events}
            pool={pool}
            target={target}
            filterLabel={label}
            note={charsNote}
            onSelect={(id) => select(id)}
            onOpenFilter={openFilter}
          />
          <Panel title="ボーダーの推移">
            <HistoryShapeChart eventId={target.id} hours={target.hours} />
          </Panel>
          <RankingPanel pool={pool} target={target} filter={filter} onSelect={(id) => select(id, true)} />
          <NotePanel />
        </>
      )}
    </ToolPage>
  );
}

function TypeChip({ e }: { e: HistoryEvent }) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold leading-4"
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
  filterLabel,
  note,
  onSelect,
  onOpenFilter,
}: {
  ref: Ref<HTMLElement>;
  all: HistoryEvent[];
  pool: HistoryEvent[];
  target: HistoryEvent;
  /** 比べる回の条件（歴代ランキングの「絞り込み」で変える） */
  filterLabel: string;
  /** 「・キャラの条件は読み込み中」など、条件に添える断り（無ければ空） */
  note: string;
  onSelect: (id: number) => void;
  /** 歴代ランキングの「絞り込み」を開いて、そこまで動かす */
  onOpenFilter: () => void;
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
        <p className="mt-4 text-xs leading-6 text-slate-500">
          比べる回: <span className="font-bold text-slate-600">{filterLabel}</span>（{pool.length}回
          {note}）
          <button type="button" className="ml-2 underline underline-offset-4" onClick={onOpenFilter}>
            絞り込みを変える
          </button>
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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
                      <dd>{s.same.of > 1 ? <PlaceText p={s.same} /> : <span className="font-bold text-slate-700">前例なし</span>}</dd>
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

function RankingPanel({
  pool,
  target,
  filter,
  onSelect,
}: {
  pool: HistoryEvent[];
  target: HistoryEvent;
  filter: FilterProps;
  onSelect: (id: number) => void;
}) {
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
    // id は X の告知で Bot がここまでスクロールして撮るための目印（sekaimaster-bot の page の anchor。2026-10-25）
    <section id="ranking" className="scroll-mt-20">
    <Panel title="歴代ランキング">
      <div role="group" aria-label="順位" className="mb-3">
        <Segmented options={RANK_OPTIONS} value={rank} onChange={(v) => setRank(v as HistoryRank)} />
      </div>
      <div role="group" aria-label="並べ方">
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} />
      </div>
      <FilterBox {...filter} />
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
              <th scope="col" className="hidden whitespace-nowrap px-2 py-2 text-right font-bold sm:table-cell">
                日数
              </th>
              <th scope="col" className="hidden whitespace-nowrap px-2 py-2 text-right font-bold sm:table-cell">
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
              const bar = eventUnitColor(r.event.unit);
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
                    <span className="mt-0.5 flex items-center gap-2 text-xs font-normal tabular-nums text-slate-500 sm:hidden">
                      <TypeChip e={r.event} />
                      {r.event.days}日・{r.event.hours}h
                    </span>
                  </td>
                  <td className="hidden px-2 py-1.5 sm:table-cell">
                    <TypeChip e={r.event} />
                  </td>
                  {/* 2桁の日数（10日・13日）で「13／日」と折れていた（2026-10-25 Nori）。数の列は折らない */}
                  <td className="hidden whitespace-nowrap px-2 py-1.5 text-right tabular-nums sm:table-cell">{r.event.days}日</td>
                  <td className="hidden whitespace-nowrap px-2 py-1.5 text-right tabular-nums sm:table-cell">{r.event.hours}h</td>
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
    </section>
  );
}

interface FilterProps {
  label: string;
  types: readonly string[];
  unit: UnitFilter;
  chars: readonly number[];
  pending: boolean;
  bonusFailed: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onType: (t: string) => void;
  onUnit: (u: UnitFilter) => void;
  onChar: (ch: number) => void;
  onReset: () => void;
}

const FILTER_ID = "history-filter";

const chip = (active: boolean) =>
  "rounded-full px-2.5 py-1 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)] " +
  (active ? "neu-selected" : "bg-neu text-slate-500 shadow-neu-sm");

/** 比べる回の絞り込み。ふだんは畳んでおき、見出しに今の条件を1行で出す */
function FilterBox({ label, types, unit, chars, pending, bonusFailed, open, onOpen, onType, onUnit, onChar, onReset }: FilterProps) {
  return (
    <details
      id={FILTER_ID}
      className="neu-inset mt-3 scroll-mt-20 rounded-xl px-4 py-3"
      open={open}
      onToggle={(e) => onOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm">
        <span className="font-bold text-slate-600">絞り込み</span>
        <span className="ml-2 text-xs text-slate-500">{label}</span>
      </summary>
      <div className="mt-3 space-y-4">
        <div>
          <p className="mb-2 text-xs font-bold text-slate-500">種別</p>
          <div role="group" aria-label="比べる種別" className="flex flex-wrap gap-2">
            {HISTORY_TYPES.map((t) => (
              <button key={t.value} type="button" aria-pressed={types.includes(t.value)} className={chip(types.includes(t.value))} onClick={() => onType(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">最初はワールドリンクを外しています（X の歴代ボーダーの画像と同じ数え方）。</p>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold text-slate-500">箱／混合</p>
          <div role="group" aria-label="箱イベと混合イベ" className="flex flex-wrap gap-2">
            {UNIT_FILTERS.map((u) => (
              <button key={u.value} type="button" aria-pressed={unit === u.value} className={chip(unit === u.value)} onClick={() => onUnit(u.value)}>
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold text-slate-500">参加キャラ（選んだキャラが全員ボーナスキャラの回）</p>
          <div role="group" aria-label="参加キャラ" className="space-y-1">
            {UNIT_ORDER.map((u) => (
              <div key={u} className="flex items-center gap-1">
                <span className="w-16 shrink-0 whitespace-nowrap text-xs font-bold text-slate-400">{UNIT_SHORT[u]}</span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {CHARACTERS.filter((c) => c.unit === u).map((c) => (
                    <button
                      key={c.ch}
                      type="button"
                      aria-pressed={chars.includes(c.ch)}
                      title={c.name}
                      className={`${chip(chars.includes(c.ch))} !px-2 !text-xs`}
                      onClick={() => onChar(c.ch)}
                    >
                      {characterShort(c.ch)}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {pending && !bonusFailed && <p className="mt-2 text-xs text-slate-500">キャラのデータを読み込み中…</p>}
          {bonusFailed && <p className="mt-2 text-xs text-amber-700">キャラのデータを読み込めなかったので、キャラでは絞っていません。</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NeuButton className="!px-3 !py-1.5 !text-xs" onClick={onReset}>
            条件を戻す
          </NeuButton>
          <p className="text-xs leading-5 text-slate-500">選んでいる回は、条件から外れても比べる回に入れます。</p>
        </div>
      </div>
    </details>
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
