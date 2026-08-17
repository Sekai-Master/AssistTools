import { useCallback, useEffect, useMemo, useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { Panel } from "../../components/ui/Panel";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Switch } from "../../components/ui/Switch";
import { ToolPage } from "../../components/ui/ToolPage";
import { cn } from "../../lib/utils";
import { applyFilter, summary, talksOf, type FilterState, type SortKey } from "./lib/filter";
import { loadFilter, saveFilter } from "./lib/filterStorage";
import { loadOwned, saveOwned } from "./lib/ownedStorage";
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

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "talks", label: "会話数" },
  { value: "name", label: "名前" },
  { value: "cost", label: "コスト" },
  { value: "size", label: "大きさ" },
];

const SITE_LABEL: Record<string, string> = {
  room: "部屋",
  home: "屋外",
  any: "どこでも",
};

/** 設置の向き。マスタの語彙をそのまま出すと英語が混じるので日本語にする。 */
const LAYOUT_LABEL: Record<string, string> = {
  floor: "床",
  wall: "壁",
  rug: "ラグ",
  road: "道",
  floor_appearance: "地面",
  wall_appearance: "外壁",
};

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
  characterName,
  owned,
  onToggleOwned,
}: {
  fixture: Fixture;
  charId: number | null;
  characterName: (id: number) => string;
  owned: boolean;
  onToggleOwned: (id: number) => void;
}) {
  // キャラを選んでいるときは、その人がどう反応するかだけ出す（全員分は多すぎる）。
  const talksHere = charId != null && fixture.talkChars.includes(charId);
  const likesHere = charId != null && fixture.likeChars.includes(charId);
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
  const size = fixture.size.some((n) => n > 0) ? fixture.size.join("×") : null;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[color:var(--neu-lo)]/40 py-2.5 last:border-b-0",
        // 持っているものは沈ませる。消さずに残すのは、印の付け間違いに気づけるようにするため。
        owned && "opacity-45"
      )}
    >
      <label className="flex shrink-0 cursor-pointer items-center" title="持っている家具に印を付ける">
        <input
          type="checkbox"
          checked={owned}
          onChange={() => onToggleOwned(fixture.id)}
          className="h-4 w-4 accent-[color:var(--unit-color)]"
          aria-label={`${fixture.name} を持っている`}
        />
      </label>
      <span className="min-w-0 flex-1 font-bold text-slate-700">{fixture.name}</span>

      <span className="flex flex-wrap items-center gap-1.5">
        {talks > 0 && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-bold",
              talksHere ? "text-white" : "bg-neu text-slate-500 shadow-neu-inset"
            )}
            style={talksHere ? { backgroundColor: "var(--unit-color)" } : undefined}
            title={
              charId != null
                ? `この家具の会話は全部で ${fixture.talkCount} 本`
                : "会話パターンの本数（キャラの組み合わせごとに1本）"
            }
          >
            会話 {talks}
          </span>
        )}
        {/* ★ ひとりで喋るか、誰かと居ないと始まらないかは家具を置く動機がまるで違う。
            ソロが無い家具（ユニットのソファ等16件）は、その子ひとりを訪ねても何も起きない。 */}
        {needsCompany && (
          <span
            className="rounded bg-neu px-1.5 py-0.5 text-xs font-bold text-slate-500 shadow-neu-inset"
            title={
              charId != null
                ? "この家具では、ひとりでいるときの会話がありません（誰かと一緒に居る必要があります）"
                : "ひとりで喋る会話がない家具です（複数人が揃うと会話します）"
            }
          >
            {fixture.maxParty >= 2 ? `${fixture.maxParty}人以上で` : "誰かと一緒に"}
          </span>
        )}
        {fixture.action && (
          <span className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset">
            動く
          </span>
        )}
        {(likesHere || (charId == null && fixture.likeChars.length > 0)) && (
          <span className="rounded bg-neu px-1.5 py-0.5 text-xs text-slate-500 shadow-neu-inset">
            {likesHere ? "お気に入り" : `好み ${fixture.likeChars.length}人`}
          </span>
        )}
        <SketchBadge sketch={fixture.sketch} />
      </span>

      <span className="w-full text-xs text-slate-500 sm:w-auto sm:text-right">
        {[
          SITE_LABEL[fixture.site] ?? fixture.site,
          LAYOUT_LABEL[fixture.layout] ?? fixture.layout,
          size,
          fixture.cost != null ? `${fixture.cost}` : null,
        ]
          .filter(Boolean)
          .join(" / ")}
      </span>

      {/* キャラ未選択のときだけ、会話に出る顔ぶれを軽く見せる（誰向けの家具か分かるように）。 */}
      {charId == null && fixture.talkChars.length > 0 && (
        <span className="w-full text-xs text-slate-400">
          {fixture.talkChars.slice(0, 6).map(characterName).filter(Boolean).join("・")}
          {fixture.talkChars.length > 6 && ` ほか${fixture.talkChars.length - 6}人`}
        </span>
      )}
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

  /** 持っている家具の印。端末にだけ残す。 */
  const [owned, setOwned] = useState(loadOwned);

  useEffect(() => saveFilter(filter), [filter]);
  useEffect(() => saveOwned(owned), [owned]);

  const toggleOwned = useCallback((id: number) => {
    setOwned((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const charName = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of data?.characters ?? []) map.set(c.id, c.name);
    return (id: number) => map.get(id) ?? "";
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
            <Switch
              checked={filter.hideOwned}
              onChange={(v) => setFilter((f) => ({ ...f, hideOwned: v }))}
              label="持っているものを隠す"
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
              ／ 持っている印 {owned.size} 件
              {!filter.hideOwned && ownedInList > 0 && <>（この一覧に {ownedInList} 件）</>}
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
                  characterName={charName}
                  owned={owned.has(f.id)}
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
    </ToolPage>
  );
}
