import { useCallback, useEffect, useMemo, useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { Panel } from "../../components/ui/Panel";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Switch } from "../../components/ui/Switch";
import { ToolPage } from "../../components/ui/ToolPage";
import { cn } from "../../lib/utils";
import {
  applyFilter,
  DEFAULT_FILTER,
  partiesOf,
  summary,
  talksOf,
  type FilterState,
  type OwnedFilter,
  type PartyFilter,
  type SortKey,
} from "./lib/filter";
import { loadFilter, saveFilter } from "./lib/filterStorage";
import { FixtureModal } from "./FixtureModal";
import { loadProgress, partyKey, saveProgress } from "./lib/ownedStorage";
import { readWishFromUrl, wishUrl } from "./lib/wishlist";
import { CHIP_SHADOW, chipBg } from "./lib/charaColor";
import { thumbUrl } from "./lib/thumb";
import {
  UNIT_NAME,
  UNIT_ORDER,
  type Fixture,
  type MysekaiCharacter,
  type ReactionKind,
} from "./lib/types";
import { useMysekaiFixtures } from "./useMysekaiFixtures";

/**
 * マイセカイ リアクション図鑑。
 *
 * ゲーム内の「リアクションあり」フィルタは**自分が設計図を持っている家具しか出さない**。
 * だから「まだ持っていない家具」「他人のセカイへ模写しに行く候補」が見えない。
 * この画面はマスタ側から全件を並べて、そこを埋める。
 *
 * ★ 会話の本文は扱わない（Nori 判断 2026-08-17・ネタバレ回避）。
 *   出すのは「誰の会話が何本あるか」まで。本文は配信もされていない。
 */

const KIND_LABEL: Record<ReactionKind, string> = {
  talk: "固有会話",
  like: "気に入っている",
};

const OWNED_OPTIONS: { value: OwnedFilter; label: string }[] = [
  { value: "any", label: "所持問わず" },
  { value: "owned", label: "持っている" },
  { value: "unowned", label: "持っていない" },
  { value: "wish", label: "ほしい" },
];

const PARTY_OPTIONS: { value: PartyFilter; label: string }[] = [
  { value: "any", label: "人数問わず" },
  { value: "solo", label: "ひとりで" },
  { value: "group", label: "複数人で" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "talks", label: "会話数" },
  { value: "name", label: "名前" },
  { value: "cost", label: "コスト" },
  { value: "size", label: "大きさ" },
];

/** 素の select にニューモーフィズムの見た目を与える。ネイティブUIのままにしたいので置換はしない。 */
const SELECT_CLASS =
  "rounded-lg bg-neu px-3 py-2.5 text-slate-700 shadow-neu-inset outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

/** 模写可否のバッジ。null（設計図が無い）と false（模写不可）を混ぜない。 */
function SketchBadge({ sketch }: { sketch: boolean | null }) {
  if (sketch === true) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: "var(--unit-color)" }}>
        模写可
      </span>
    );
  }
  return (
    <span className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset">
      {sketch === false ? "模写不可" : "設計図なし"}
    </span>
  );
}

/** 相手のリストに入っていて、自分が持っている＝置いてあげられる家具。 */
function OfferBadge() {
  return (
    <span className="ml-1.5 inline-flex shrink-0 items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
      置いてあげられる
    </span>
  );
}

function FixtureRow({
  fixture,
  charId,
  charById,
  owned,
  wished,
  wanted,
  seen,
  total,
  onOpen,
  onToggleOwned,
  onToggleWish,
}: {
  fixture: Fixture;
  charId: number | null;
  charById: (id: number) => MysekaiCharacter | undefined;
  owned: boolean;
  /** 自分のほしいものリストに入れているか。 */
  wished: boolean;
  /** 共有リンクで渡された相手のリストに入っているか。 */
  wanted: boolean;
  /** 見た顔ぶれの数。分母(total)と必ず同じ単位で渡すこと。 */
  seen: number;
  /** 回収の分母。キャラを選んでいればその人が出る顔ぶれの数。 */
  total: number;
  onOpen: (f: Fixture) => void;
  onToggleOwned: (id: number) => void;
  onToggleWish: (id: number) => void;
}) {
  // ★ 表示する本数は**選んだ人のぶん**。家具の総数を出すと実数の19倍になる。
  const talks = talksOf(fixture, charId);
  /**
   * ひとりで喋る会話が無い＝誰かと一緒に居ないと始まらない。
   * キャラを選んでいればその人について、選んでいなければ家具全体について見る。
   */
  const needsCompany =
    talks > 0 &&
    (charId != null
      ? (fixture.talkSoloBy.get(charId) ?? 0) === 0
      : fixture.talkChars.every((c) => (fixture.talkSoloBy.get(c) ?? 0) === 0));
  const likesHere = charId != null && fixture.likeChars.includes(charId);
  const img = thumbUrl(fixture);
  // 顔ぶれは先頭だけ出す。全部はモーダルで見る（1,500件を一覧で追えなくなるため）。
  // キャラを選んでいるときは、その人が会話に出るときだけ顔ぶれを見せる（他人の薄いチップは混乱の元）。
  const facesShown =
    charId == null
      ? fixture.talkChars.slice(0, 6)
      : fixture.talkChars.includes(charId)
        ? [charId]
        : [];

  return (
    <li className="flex items-center gap-1 border-b border-[color:var(--neu-lo)]/40 last:border-b-0">
      {/* ★ 持っている家具を沈めない。**持っていて初めて会話を回収できる**ので、
          むしろそちらが主役。持っていないものを少し退かせる。 */}
      <button
        type="button"
        onClick={() => onOpen(fixture)}
        className={cn(
          // ★ 狭い画面では縦積みにする。横一列だと家具名が truncate で2〜9文字まで
          //   削られ、既定表示の49%が先頭8文字重複のため識別できなくなる（実測）。
          "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left sm:flex-nowrap",
          "cursor-pointer rounded-lg transition-colors",
          "hover:bg-[color:color-mix(in_srgb,var(--unit-color)_8%,transparent)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
          // 持っていない方を退かせるが、既定（印ゼロ）で全行が沈まない程度に留める。
          !owned && "opacity-75"
        )}
      >
        {img ? (
          <img
            src={img}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            className="h-10 w-10 shrink-0 rounded-lg bg-neu object-contain shadow-neu-inset"
          />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-lg bg-neu shadow-neu-inset" />
        )}

        <span className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
          <span className="block truncate font-bold text-slate-700">{fixture.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {facesShown.map((id) => {
              const c = charById(id);
              if (!c) return null;
              return (
                <span
                  key={id}
                  title={c.name}
                  className={cn(
                    "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold",
                    // 選択中の人を沈めない。他は退かせるが、消えるほど薄くはしない。
                    charId != null && charId !== id && "opacity-45"
                  )}
                  style={{
                    // ★ 生のメンバーカラーに白文字を載せると26色中25色が AA を割る
                    //   （最悪 1.20:1）。色相を保ったまま読める濃さへ沈める（lib/charaColor.ts）。
                    backgroundColor: c.color ? chipBg(c.color) : "var(--unit-color)",
                    color: "#ffffff",
                    textShadow: CHIP_SHADOW,
                  }}
                >
                  {c.initial}
                </span>
              );
            })}
            {fixture.talkChars.length > facesShown.length && (
              <span className="text-[10px] text-slate-400">
                +{fixture.talkChars.length - facesShown.length}
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:flex-col sm:items-end">
          <span className="flex items-center gap-1">
            {total > 0 && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.38)]"
                style={{ backgroundColor: "var(--unit-color)" }}
                title={`会話が起きる顔ぶれ ${total} 通り${seen > 0 ? `（見た ${seen}）` : ""}`}
              >
                会話 {seen > 0 ? `${seen}/${total}` : total}
              </span>
            )}
            {needsCompany && (
              <span
                className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset"
                title="ひとりでは会話が始まりません"
              >
                揃うと
              </span>
            )}
            {/* ★ 好みで一致した行に根拠が出ないと「なぜこの行が居るのか」が読めない
                （実測で一歌265件中69件、瑞希314件中127件が無根拠だった）。 */}
            {likesHere && (
              <span className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset">
                気に入っている
              </span>
            )}
            {charId == null && fixture.likeChars.length > 0 && (
              <span className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset">
気に入り {fixture.likeChars.length}
              </span>
            )}
            {/* ★ 誰が使うかのデータ（actionChars）があるので、キャラ選択中も出せる。
                データが無くて家具の印だけのものは、キャラ未選択のときだけ出す。 */}
            {(charId != null ? fixture.actionChars.includes(charId) : fixture.action || fixture.actionChars.length > 0) && (
              <span
                className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset"
                title={
                  charId != null
                    ? "この家具を使います（座る・遊ぶなど）"
                    : fixture.actionChars.length > 0
                      ? `${fixture.actionChars.length}人が使います`
                      : "キャラのアクション対象です（誰が使うかはデータにありません）"
                }
              >
                使う{charId == null && fixture.actionChars.length > 0 && ` ${fixture.actionChars.length}`}
              </span>
            )}
          </span>
          <SketchBadge sketch={fixture.sketch} />
          {wanted && owned && <OfferBadge />}
        </span>
      </button>

      {/* 一覧のまま所持を切り替える。開いて閉じてを繰り返さずに済む。
          行を開くボタンとは別の当たり判定にして、押し間違いを防ぐ。 */}
      <button
        type="button"
        onClick={() => onToggleOwned(fixture.id)}
        aria-pressed={owned}
        title={owned ? "持っている（押すと外す）" : "持っていない（押すと印を付ける）"}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
          owned ? "neu-selected" : "bg-neu text-slate-400 shadow-neu-sm neu-tactile"
        )}
      >
        <span aria-hidden className="material-icons text-[20px] leading-none">
          {owned ? "inventory_2" : "add"}
        </span>
        <span className="sr-only">{fixture.name} を持っている</span>
      </button>

      {/* ★ ほしいもの印。持っていない家具は他人のセカイへ模写しに行くしかないので、
          「どれが要るか」を相手に渡せる形で溜める場所が要る。 */}
      <button
        type="button"
        onClick={() => onToggleWish(fixture.id)}
        aria-pressed={wished}
        title={wished ? "ほしいものリストに入れている（押すと外す）" : "ほしいものリストに入れる"}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
          wished ? "neu-selected" : "bg-neu text-slate-400 shadow-neu-sm neu-tactile"
        )}
      >
        <span aria-hidden className="material-icons text-[20px] leading-none">
          {wished ? "favorite" : "favorite_border"}
        </span>
        <span className="sr-only">{fixture.name} をほしいものリストに入れる</span>
      </button>
    </li>
  );
}

export default function MysekaiReactions() {
  const { data, loading, error } = useMysekaiFixtures();
  const [filter, setFilterState] = useState(loadFilter);
  // 表示件数。1,500件を一度に描くと重いので、押した分だけ伸ばす。
  const [limit, setLimit] = useState(100);

  /**
   * 条件を変えたら表示件数も先頭に戻す（前の位置のまま増えていると見落とす）。
   * ★ effect で setLimit すると cascading render になり lint も鳴るので、
   *   変更の起点でまとめてやる。以降は setFilter 経由で条件を変えること。
   */
  const setFilter = useCallback((fn: (f: FilterState) => FilterState) => {
    setFilterState(fn);
    setLimit(100);
  }, []);

  /**
   * 進み具合。端末にだけ残す。
   * - owned     … 設計図を持っている（家具単位）
   * - collected … その顔ぶれの会話を見た（家具×顔ぶれ単位）
   * 別物なので分けて持つ（持っていても全部見たとは限らない）。
   */
  const [progress, setProgress] = useState(loadProgress);
  const { owned, collected, wish } = progress;
  /**
   * 共有リンクで渡された「相手のほしいものリスト」。
   * ★ URL にしか無い（サーバにも端末にも保存しない）。読み取りは一度だけ。
   */
  const [shared] = useState<Set<number>>(() =>
    typeof window === "undefined" ? new Set() : readWishFromUrl(window.location.search)
  );
  /** 共有リストのうち、自分が持っているもの＝**置いてあげられるもの**。 */
  const canOffer = useMemo(
    () => [...shared].filter((id) => owned.has(id)),
    [shared, owned]
  );
  const [copied, setCopied] = useState(false);
  /** 詳細を開いている家具。null なら閉じている。 */
  const [openFixture, setOpenFixture] = useState<Fixture | null>(null);

  useEffect(() => saveFilter(filter), [filter]);
  useEffect(() => saveProgress(progress), [progress]);

  // ★ 毎レンダー新しい関数を渡すと useModalA11y の effect が張り直され、
  //   チェックを押すたびにフォーカスがダイアログ本体へ飛ぶ。安定化する。
  const closeModal = useCallback(() => setOpenFixture(null), []);

  const toggleOwned = useCallback((id: number) => {
    setProgress((prev) => {
      const next = new Set(prev.owned);
      if (!next.delete(id)) next.add(id);
      return { ...prev, owned: next };
    });
  }, []);

  const toggleWish = useCallback((id: number) => {
    setProgress((prev) => {
      const next = new Set(prev.wish);
      if (!next.delete(id)) next.add(id);
      return { ...prev, wish: next };
    });
  }, []);

  /** その家具の会話をまとめて既読／未読にする。 */
  const toggleAllCollected = useCallback((f: Fixture, parties: number[][], mark: boolean) => {
    setProgress((prev) => {
      const next = new Set(prev.collected);
      for (const p of parties) {
        const k = partyKey(f.id, p);
        if (mark) next.add(k);
        else next.delete(k);
      }
      return { ...prev, collected: next };
    });
  }, []);

  const toggleCollected = useCallback((key: string) => {
    setProgress((prev) => {
      const next = new Set(prev.collected);
      if (!next.delete(key)) next.add(key);
      return { ...prev, collected: next };
    });
  }, []);

  const charById = useMemo(() => {
    const map = new Map<number, MysekaiCharacter>();
    for (const c of data?.characters ?? []) map.set(c.id, c);
    return (id: number) => map.get(id);
  }, [data]);

  /** 選択肢をユニットで束ねる。26人を1列に並べると選びにくい。 */
  const byUnit = useMemo(() => {
    const groups = new Map<string, MysekaiCharacter[]>();
    for (const c of data?.characters ?? []) {
      const key = c.unit || "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    const known = UNIT_ORDER.filter((u) => groups.has(u));
    // マスタに新しい unit が増えても落とさない（末尾に回す）。
    const rest = [...groups.keys()].filter((u) => !UNIT_ORDER.includes(u));
    return [...known, ...rest].map((unit) => ({ unit, members: groups.get(unit)! }));
  }, [data]);

  /**
   * 保存されていた選択が今のデータに無いことがある（手で書き換えた／キャラ一覧が縮んだ）。
   * ★ そのまま使うと「どのボタンも押されていない見た目で0件」になり、
   *   画面から原因が分からなくなる。存在しない選択は無かったことにする。
   */
  const effectiveFilter = useMemo(() => {
    if (!data) return filter;
    const charOk = filter.charId == null || data.characters.some((c) => c.id === filter.charId);
    const genreOk =
      filter.mainGenreId == null || data.mainGenres.some((g) => g.id === filter.mainGenreId);
    if (charOk && genreOk) return filter;
    return {
      ...filter,
      charId: charOk ? filter.charId : null,
      mainGenreId: genreOk ? filter.mainGenreId : null,
    };
  }, [data, filter]);

  const list = useMemo(
    () => (data ? applyFilter(data.fixtures, effectiveFilter, owned, wish) : []),
    [data, effectiveFilter, owned, wish]
  );

  const selectedChar: MysekaiCharacter | undefined = data?.characters.find(
    (c) => c.id === effectiveFilter.charId
  );

  /** いま効いている絞り込みを日本語で並べる（0件の理由を画面で説明するため）。 */
  const activeConditions = useMemo(() => {
    const f = effectiveFilter;
    const out: string[] = [];
    if (f.charId != null) out.push(`キャラ: ${selectedChar?.name ?? "?"}`);
    if (f.kinds.length > 0) out.push(`種類: ${f.kinds.map((k) => KIND_LABEL[k]).join("・")}`);
    if (f.owned !== "any") out.push(f.owned === "owned" ? "持っている" : "持っていない");
    if (f.party !== "any") out.push(f.party === "solo" ? "ひとりで" : "複数人で");
    if (f.sketchableOnly) out.push("模写できるものだけ");
    if (f.reactiveOnly) out.push("反応がある家具だけ");
    if (f.mainGenreId != null) {
      out.push(`ジャンル: ${data?.mainGenres.find((g) => g.id === f.mainGenreId)?.name ?? "?"}`);
    }
    if (f.query.trim()) out.push(`検索: ${f.query.trim()}`);
    return out;
  }, [effectiveFilter, selectedChar, data]);

  const resetFilter = useCallback(() => setFilter(() => DEFAULT_FILTER), [setFilter]);

  const stats = useMemo(
    () => summary(list, effectiveFilter.charId),
    [list, effectiveFilter.charId]
  );
  const ownedInList = useMemo(
    () => (owned.size === 0 ? 0 : list.reduce((n, f) => n + (owned.has(f.id) ? 1 : 0), 0)),
    [list, owned]
  );


  const toggleKind = (kind: ReactionKind) =>
    setFilter((f) => ({
      ...f,
      kinds: f.kinds.includes(kind) ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind],
    }));

  // ★ 読み込み中もパネル1枚に縮めない。データ到着で 6,000px 伸びると CLS を踏む
  //   （このリポジトリは EfficiencyRanking で 0.37、DeckBuilder で 0.31 を実測して
  //     対策済み。同じ轍を踏まない）。高さを予約し、状態は sr-only で伝える。
  if (loading || error || !data) {
    return (
      <ToolPage unit="n25" title="マイセカイ リアクション図鑑" icon="weekend" morphKey="tool:mysekai" wide>
        <div className="min-h-[80vh]">
          <Panel>
            {error || !data ? (
              <div role="alert" className="space-y-3">
                <p className="font-bold text-rose-600">
                  {error ?? "家具データを読み込めませんでした。"}
                </p>
                <NeuButton onClick={() => window.location.reload()} className="min-h-11">
                  再読み込み
                </NeuButton>
              </div>
            ) : (
              <p role="status" className="sr-only">
                読み込み中
              </p>
            )}
          </Panel>
        </div>
      </ToolPage>
    );
  }

  return (
    <ToolPage unit="n25" title="マイセカイ リアクション図鑑" icon="weekend" morphKey="tool:mysekai" wide>
      <Panel title="誰の反応を見るか">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={effectiveFilter.charId ?? ""}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                charId: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            aria-label="キャラで絞る"
            className={SELECT_CLASS}
          >
            <option value="">全員（絞らない）</option>
            {byUnit.map(({ unit, members }) => (
              <optgroup key={unit} label={UNIT_NAME[unit] ?? unit}>
                {members.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedChar && (
            <NeuButton
              onClick={() => setFilter((f) => ({ ...f, charId: null }))}
              className="px-3 py-1.5"
            >
              解除
            </NeuButton>
          )}
        </div>
      </Panel>

      {/* ★★ 共有リンクで開かれたとき。★★
          相手が「これがほしい」と渡してきたリストを、こちらの所持と突き合わせる。
          **置いてあげられるものが分かって初めて意味がある**ので、そこを主役にする。 */}
      {shared.size > 0 && (
        <Panel title="受け取ったほしいものリスト">
          <p className="text-sm leading-relaxed text-slate-600">
            <b>{shared.size}件</b>のリストを受け取りました。そのうち
            <b className="text-[color:var(--unit-color)]"> あなたが持っているのは {canOffer.length}件</b>です。
            {canOffer.length > 0 ? (
              <>
                {" "}
                これをマイセカイに置いておけば、相手が来て模写できます。
                一覧では<b>「置いてあげられる」</b>の印が付いています。
              </>
            ) : (
              <> 残念ながら、いま置いてあげられるものはありません。</>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <NeuButton
              onClick={() =>
                setFilter((f) => ({ ...f, owned: "any", reactiveOnly: false, charId: null, kinds: [] }))
              }
              className="min-h-11 px-3 py-1.5"
            >
              条件を外して全部見る
            </NeuButton>
            <NeuButton
              onClick={() => {
                const u = new URL(window.location.href);
                u.searchParams.delete("wish");
                window.location.replace(u.toString());
              }}
              className="min-h-11 px-3 py-1.5"
            >
              リストを閉じる
            </NeuButton>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            このリストは<b>URL にだけ入っています</b>。サイトには保存されないので、
            リンクを閉じれば消えます。<b>あなたの所持や進み具合は相手に伝わりません。</b>
          </p>
        </Panel>
      )}

      {/* ★ 自分のほしいものリストを渡す。持っていない家具は他人のセカイに
          行って模写するしかないので、「何が要るか」を伝えられないと始まらない。 */}
      {wish.size > 0 && (
        <Panel title="ほしいものリストを渡す">
          <p className="text-sm leading-relaxed text-slate-600">
            <b>{wish.size}件</b>を入れています。リンクを渡すと、相手の画面で
            <b>「自分が持っていて、あなたが欲しいもの」</b>に印が付きます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <NeuButton
              onClick={async () => {
                const u = wishUrl(wish, window.location.origin + window.location.pathname);
                if (!u) return;
                try {
                  await navigator.clipboard.writeText(u);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2600);
                } catch {
                  // クリップボードが使えない環境では、選べる形で出す
                  window.prompt("このリンクをコピーしてください", u);
                }
              }}
              className="min-h-11 px-3 py-1.5"
            >
              {copied ? "コピーしました" : "共有リンクをコピー"}
            </NeuButton>
            <NeuButton
              onClick={() => setFilter((f) => ({ ...f, owned: "wish", reactiveOnly: false }))}
              className="min-h-11 px-3 py-1.5"
            >
              入れたものだけ見る
            </NeuButton>
            <NeuButton
              onClick={() => {
                if (window.confirm("ほしいものリストを空にします。よろしいですか。")) {
                  setProgress((prev) => ({ ...prev, wish: new Set() }));
                }
              }}
              className="min-h-11 px-3 py-1.5"
            >
              空にする
            </NeuButton>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            リンクには<b>ほしいものだけ</b>が入ります。持っている家具・見た会話・絞り込みの設定は
            <b>一切含まれません</b>。サーバにも保存されないので、リンクを渡した相手以外には見えません。
          </p>
        </Panel>
      )}

      <Panel title="条件">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as ReactionKind[]).map((k) => (
                <NeuButton
                  key={k}
                  active={filter.kinds.includes(k)}
                  onClick={() => toggleKind(k)}
                  className="min-h-11 px-3 py-1.5"
                >
                  {KIND_LABEL[k]}
                </NeuButton>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {filter.kinds.length === 0
                ? "そのキャラとの関わり方で絞りません"
                : "選んだ種類の いずれか に当てはまる家具を出します（OR）"}
              。下のスイッチ・ジャンル・検索は<b>すべて満たすもの</b>だけに絞ります（AND）。
              <br />
              <b>固有会話</b>＝その家具を置くと専用の会話が起きる。<b>気に入っている</b>＝置くと
              「わあ……！これいいなー！」のような反応をする（<b>会話数には含まれません</b>）。
              どちらも<b>キャラごと</b>に決まっています。
            </p>
          </div>

          <div>
            <SegmentedControl
              options={OWNED_OPTIONS}
              value={filter.owned}
              onChange={(v) => setFilter((f) => ({ ...f, owned: v }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {filter.owned === "owned"
                ? "持っている家具だけ。ここから会話を回収していきます"
                : filter.owned === "unowned"
                  ? "持っていない家具だけ。まず入手する対象です"
                  : "所持で絞りません。一覧の右端のボタンで印を付けられます"}
            </p>
          </div>

          <div>
            <SegmentedControl
              options={PARTY_OPTIONS}
              value={filter.party}
              onChange={(v) => setFilter((f) => ({ ...f, party: v }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {filter.party === "solo"
                ? "ひとりでいるときに喋る家具だけ。訪ねればすぐ聞けます"
                : filter.party === "group"
                  ? "複数人が揃わないと喋らない家具だけ。居合わせを作る必要があります"
                  : "会話の人数で絞りません"}
              {effectiveFilter.charId != null && "（選んだキャラについて判定します）"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Switch
              checked={filter.reactiveOnly}
              onChange={(v) => setFilter((f) => ({ ...f, reactiveOnly: v }))}
              label="反応がある家具だけ"
            />
            <Switch
              checked={filter.actionOnly}
              onChange={(v) => setFilter((f) => ({ ...f, actionOnly: v }))}
              label="キャラが使う家具だけ"
            />
            <Switch
              checked={filter.sketchableOnly}
              onChange={(v) => setFilter((f) => ({ ...f, sketchableOnly: v }))}
              label="模写できるものだけ"
            />

          </div>

          <div className="flex flex-wrap items-center gap-3">
            <NeuInput
              value={filter.query}
              onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
              placeholder="家具の名前で検索"
              className="max-w-xs"
              aria-label="家具の名前で検索"
            />
            <select
              value={effectiveFilter.mainGenreId ?? ""}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  mainGenreId: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              aria-label="ジャンルで絞る"
              className={SELECT_CLASS}
            >
              <option value="">ジャンル: すべて</option>
              {data.mainGenres
                .filter((g) => g.name !== "すべて")
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              options={SORT_OPTIONS}
              value={filter.sort}
              onChange={(v) => setFilter((f) => ({ ...f, sort: v }))}
            />
            <NeuButton
              onClick={() => setFilter((f) => ({ ...f, desc: !f.desc }))}
              className="px-3 py-1.5"
            >
              {filter.desc ? "降順" : "昇順"}
            </NeuButton>
          </div>
        </div>
      </Panel>

      <Panel
        title={
          selectedChar ? `${selectedChar.name} が反応する家具` : "リアクションのある家具"
        }
      >
        {/* 好みが複数セカイぶんの定義から合成されているキャラ（実データではミク）。
            「好み」の行が本人のどのセカイの話かは区別できないので、そう書く。 */}
        {selectedChar && data.multiUnitLikes.has(selectedChar.id) && (
          <p className="mb-3 rounded-lg bg-neu p-3 text-xs text-slate-500 shadow-neu-inset">
            {selectedChar.name} はセカイごとに別々のデータを持っています（
            {data.multiUnitLikes.get(selectedChar.id)}つ）。ここではまとめて出しているので、
            <b>どのセカイの{selectedChar.name}の話かは区別できません</b>。
            好みだけでなく<b>会話も同じ</b>で、セカイごとの会話は1つの顔ぶれに畳まれています。
          </p>
        )}

        <p className="mb-3 text-sm text-slate-500">
          {stats.total} 件
          {stats.sketchable > 0 && <> ／ 模写できる {stats.sketchable} 件</>}
          {stats.talks > 0 && <> ／ 固有会話 {stats.talks} 本</>}
          {owned.size > 0 && (
            <>
              {" "}
              ／ この一覧で持っている {ownedInList} 件
            </>
          )}
        </p>

        {list.length === 0 ? (
          <div className="space-y-3">
            <p className="text-slate-600">
              {effectiveFilter.owned === "owned" && owned.size === 0
                ? "まだ「持っている」印を付けた家具がありません。一覧の右端のボタン（＋）で印を付けられます。"
                : "条件に合う家具がありません。"}
            </p>
            {/* ★ 何が効いて0件なのかを並べ、その場で解除できるようにする。
                絞り込みは保存されるので、次に開いたときも0件のまま始まってしまう。 */}
            {activeConditions.length > 0 && (
              <>
                <p className="text-xs text-slate-500">
                  いま効いている条件: {activeConditions.join(" / ")}
                </p>
                <NeuButton onClick={resetFilter} className="min-h-11">
                  条件をすべて解除する
                </NeuButton>
              </>
            )}
          </div>
        ) : (
          <>
            <ul>
              {list.slice(0, limit).map((f) => (
                <FixtureRow
                  key={f.id}
                  fixture={f}
                  charId={effectiveFilter.charId}
                  charById={charById}
                  owned={owned.has(f.id)}
                  wished={wish.has(f.id)}
                  wanted={shared.has(f.id)}
                  seen={
                    collected.size === 0
                      ? 0
                      : partiesOf(f, effectiveFilter.charId).reduce(
                          (n, p) => n + (collected.has(partyKey(f.id, p)) ? 1 : 0),
                          0
                        )
                  }
                  total={partiesOf(f, effectiveFilter.charId).length}
                  onToggleWish={toggleWish}
                  onOpen={setOpenFixture}
                  onToggleOwned={toggleOwned}
                />
              ))}
            </ul>
            {list.length > limit && (
              <div className="mt-4 text-center">
                <NeuButton onClick={() => setLimit((n) => n + 200)}>
                  もっと見る（残り {list.length - limit} 件）
                </NeuButton>
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel>
        <p className="text-xs leading-relaxed text-slate-500">
          ゲーム内のリアクション絞り込みは自分が設計図を持っている家具しか出ないため、この一覧はマスタ側から全件を並べています。
          会話の本文は載せていません（発生するかどうかと、登場するキャラまで）。
          <br />
          <b>「使う」</b>は、その家具に座る・遊ぶといった動作をするという意味です（ブランコ・すべり台・ソファなど）。<b>84種類の家具については誰が使うかまで分かります</b>。それ以外は「アクション対象」という家具側の印だけがあり、誰が使うかは不明です。
          <br />
          <b>「会話 ◯」は会話が起きる顔ぶれの通り数</b>です。「Aひとり」「Bひとり」「A＋B」はそれぞれ別に数えます。回収のチェックもこの単位で付きます（同じ顔ぶれに複数の会話がある家具では、実際の本数の方が多くなります）。
          <br />
          <b>「揃うと」</b>が付いた家具は、<b>ひとりで訪ねても会話が始まりません</b>。ユニットのソファなどが該当します（キャラを選んでいるときは、その子について判定します）。
          <br />
          「模写できるもの」は他人のマイセカイで設計図を写せる家具です。「設計図なし」は模写以外の入手方法しかない家具を指します。
          <br />
          「持っている」の印とフィルタの状態は<b>この端末にだけ</b>保存されます（設定画面から書き出し・削除できます）。
        </p>
      </Panel>
      {openFixture && (
        <FixtureModal
          fixture={openFixture}
          charById={charById}
          highlight={effectiveFilter.charId}
          owned={owned.has(openFixture.id)}
          wished={wish.has(openFixture.id)}
          onToggleWish={toggleWish}
          collected={collected}
          onToggleOwned={toggleOwned}
          onToggleCollected={toggleCollected}
          onToggleAll={toggleAllCollected}
          highlightName={selectedChar?.name}
          onClose={closeModal}
        />
      )}
    </ToolPage>
  );
}
