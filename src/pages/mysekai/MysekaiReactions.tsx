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
  action: "キャラが動く",
  like: "好みの家具",
};

const OWNED_OPTIONS: { value: OwnedFilter; label: string }[] = [
  { value: "any", label: "所持問わず" },
  { value: "owned", label: "持っている" },
  { value: "unowned", label: "持っていない" },
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

function FixtureRow({
  fixture,
  charId,
  charById,
  owned,
  collectedCount,
  onOpen,
  onToggleOwned,
}: {
  fixture: Fixture;
  charId: number | null;
  charById: (id: number) => MysekaiCharacter | undefined;
  owned: boolean;
  collectedCount: number;
  onOpen: (f: Fixture) => void;
  onToggleOwned: (id: number) => void;
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
  const img = thumbUrl(fixture);
  // 顔ぶれは先頭だけ出す。全部はモーダルで見る（1,500件を一覧で追えなくなるため）。
  const facesShown = fixture.talkChars.slice(0, 8);

  return (
    <li className="flex items-center gap-1 border-b border-[color:var(--neu-lo)]/40 last:border-b-0">
      {/* ★ 持っている家具を沈めない。**持っていて初めて会話を回収できる**ので、
          むしろそちらが主役。持っていないものを少し退かせる。 */}
      <button
        type="button"
        onClick={() => onOpen(fixture)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 py-2 text-left",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
          !owned && "opacity-60"
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

        <span className="min-w-0 flex-1">
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
                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white",
                    charId != null && charId !== id && "opacity-30"
                  )}
                  style={{ backgroundColor: c.color || "var(--unit-color)" }}
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

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1">
            {talks > 0 && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: "var(--unit-color)" }}
              >
                {collectedCount > 0 ? `${collectedCount}/${talks}` : talks}
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
            {fixture.action && (
              <span className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset">
                動く
              </span>
            )}
          </span>
          <SketchBadge sketch={fixture.sketch} />
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
  const { owned, collected } = progress;
  /** 詳細を開いている家具。null なら閉じている。 */
  const [openFixture, setOpenFixture] = useState<Fixture | null>(null);

  useEffect(() => saveFilter(filter), [filter]);
  useEffect(() => saveProgress(progress), [progress]);

  const toggleOwned = useCallback((id: number) => {
    setProgress((prev) => {
      const next = new Set(prev.owned);
      if (!next.delete(id)) next.add(id);
      return { ...prev, owned: next };
    });
  }, []);

  /** その家具の会話をまとめて既読／未読にする。 */
  const toggleAllCollected = useCallback((f: Fixture, mark: boolean) => {
    setProgress((prev) => {
      const next = new Set(prev.collected);
      for (const p of f.parties) {
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
    () => (data ? applyFilter(data.fixtures, effectiveFilter, owned) : []),
    [data, effectiveFilter, owned]
  );
  const stats = useMemo(
    () => summary(list, effectiveFilter.charId),
    [list, effectiveFilter.charId]
  );
  const ownedInList = useMemo(
    () => (owned.size === 0 ? 0 : list.reduce((n, f) => n + (owned.has(f.id) ? 1 : 0), 0)),
    [list, owned]
  );

  const selectedChar: MysekaiCharacter | undefined = data?.characters.find(
    (c) => c.id === effectiveFilter.charId
  );

  const toggleKind = (kind: ReactionKind) =>
    setFilter((f) => ({
      ...f,
      kinds: f.kinds.includes(kind) ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind],
    }));

  if (loading) {
    return (
      <ToolPage unit="n25" title="マイセカイ リアクション図鑑" icon="weekend" morphKey="tool:mysekai" wide>
        <Panel>
          <p className="text-slate-500">読み込み中…</p>
        </Panel>
      </ToolPage>
    );
  }

  if (error || !data) {
    return (
      <ToolPage unit="n25" title="マイセカイ リアクション図鑑" icon="weekend" morphKey="tool:mysekai" wide>
        <Panel>
          <p className="text-slate-600">{error ?? "家具データを読み込めませんでした。"}</p>
        </Panel>
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

      <Panel title="条件">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as ReactionKind[]).map((k) => (
                <NeuButton
                  key={k}
                  active={filter.kinds.includes(k)}
                  onClick={() => toggleKind(k)}
                  className="px-3 py-1.5"
                >
                  {KIND_LABEL[k]}
                </NeuButton>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {filter.kinds.length === 0
                ? "反応の種類で絞りません（どれか1つでもあれば出ます）"
                : "選んだ種類の いずれか に当てはまる家具を出します（OR）"}
              。下のスイッチ・ジャンル・検索は<b>すべて満たすもの</b>だけに絞ります（AND）。
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
            {selectedChar.name} は{data.multiUnitLikes.get(selectedChar.id)}
            つのセカイぶんの「好み」がマスタに別々に登録されています。ここではそれらをまとめて出しているので、
            <b>どのセカイの{selectedChar.name}にとっての好みかは区別できません</b>。会話のほうは影響を受けません。
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
          <p className="text-slate-500">条件に合う家具がありません。</p>
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
                  collectedCount={
                    collected.size === 0
                      ? 0
                      : f.parties.reduce((n, p) => n + (collected.has(partyKey(f.id, p)) ? 1 : 0), 0)
                  }
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
          <b>「会話 ◯」は会話パターンの本数</b>です。同じ家具でも「Aひとり」「Bひとり」「A＋B」はそれぞれ別に数えるので、複数人が使える家具ほど数が伸びます。
          <br />
          <b>「◯人以上で」「誰かと一緒に」</b>が付いた家具は、<b>ひとりで訪ねても会話が始まりません</b>。ユニットのソファなどが該当します（キャラを選んでいるときは、その子について判定します）。
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
          collected={collected}
          onToggleOwned={toggleOwned}
          onToggleCollected={toggleCollected}
          onToggleAll={toggleAllCollected}
          onClose={() => setOpenFixture(null)}
        />
      )}
    </ToolPage>
  );
}
