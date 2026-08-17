/**
 * 家具一覧の絞り込みと並べ替え（純関数）。UIから分離してテストできるようにする。
 *
 * このツールの主動線は「キャラを選ぶ → そのキャラが反応する家具が出る」。
 * ゲーム内のフィルタは**自分が設計図を持っている家具しか出さない**ので、
 * 持っていない家具（＝これから取りに行く候補）を見るためにここがある。
 */
import type { Fixture, ReactionKind } from "./types";

export type SortKey = "talks" | "name" | "cost" | "size";
export type PartyFilter = "any" | "solo" | "group";
/**
 * 所持で絞る。
 * ★ 持っている家具は**会話をこれから回収できる対象**で、持っていない家具は
 *   まず入手しないと何も始まらない。用途が正反対なので両方向に絞れる必要がある。
 */
export type OwnedFilter = "any" | "owned" | "unowned";

export interface FilterState {
  /** 選択中のキャラID。null は「キャラで絞らない」。 */
  charId: number | null;
  /**
   * 見たい反応の種類。空なら種類で絞らない。
   * ★ 複数選んだときは **OR**（どれかに当てはまれば出す）。
   *   他の条件（下のスイッチ・ジャンル・検索）は AND で重なる。
   *
   * ★ ここに入るのは**キャラとの関係**だけ（会話・お気に入り）。
   *   「キャラが使うモーションがある」は家具そのものの属性で粒度が違うため、
   *   `actionOnly` として分けてある。同じ列に並べると
   *   「キャラが動くと好みの家具は何が違うのか」が読み取れなくなる（Nori 指摘）。
   */
  kinds: ReactionKind[];
  /**
   * キャラが使う（座る・遊ぶ）家具だけに絞る。
   * キャラを選んでいればその子が使うものだけ（`actionChars` にデータがある）。
   */
  actionOnly: boolean;
  /** 反応がある家具だけに絞る。既定 true。 */
  reactiveOnly: boolean;
  /** 模写できる家具だけに絞る（他人のセカイに取りに行ける候補）。 */
  sketchableOnly: boolean;
  /** 所持で絞る。持っている＝会話を回収できる、持っていない＝まず入手する対象。 */
  owned: OwnedFilter;
  /**
   * 会話の人数条件。
   * - `any`   … 問わない
   * - `solo`  … ひとりでいるときに喋る（訪ねればすぐ聞ける）
   * - `group` … 複数人が揃わないと喋らない（居合わせを作る必要がある）
   * キャラを選んでいればその人について、選んでいなければ家具について判定する。
   */
  party: PartyFilter;
  mainGenreId: number | null;
  /** 名前・読みの部分一致。 */
  query: string;
  sort: SortKey;
  desc: boolean;
}

export const DEFAULT_FILTER: FilterState = {
  charId: null,
  kinds: [],
  // ★ 既定で反応ありに絞る。
  //   この表には未公開判定に使える日付欄が無く（deriveMysekaiData.mjs 参照）、
  //   反応データは実装とセットで作られるので、既定表示を反応ありにしておくと
  //   実装前の家具が既定で目に入ることを避けられる。全件は明示操作で開く。
  reactiveOnly: true,
  actionOnly: false,
  sketchableOnly: false,
  owned: "any",
  party: "any",
  mainGenreId: null,
  query: "",
  // ★ 既定は名前の昇順。会話数の降順（＝よく喋る家具が上）も考えたが、
  //   初見で並びの理由が分からない順序を既定にしない。あいうえお順なら
  //   「探しているものが今どこにあるか」を予想できる（Nori 指摘 2026-08-17）。
  sort: "name",
  desc: false,
};

/** 検索の正規化。全角英数と大文字の揺れを吸収する。 */
export function normalizeQuery(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * その家具が、指定キャラの指定種別の反応を持つか。
 * ★ 扱うのは**キャラとの関係**だけ（会話・お気に入り）。モーションの有無は
 *   家具の属性なので `actionOnly` として AND で重ねる。
 */
export function matchesChar(f: Fixture, charId: number, kinds: ReactionKind[]): boolean {
  if (kinds.length === 0) return f.charSet.has(charId);
  return kinds.some((k) =>
    k === "talk" ? f.talkChars.includes(charId) : f.likeChars.includes(charId)
  );
}

/**
 * 会話の人数条件に当てはまるか。
 *
 * ★ キャラを選んでいればその人について判定する。「司はひとりで喋るが、類は司と居ないと喋らない」
 *   のように人によって違うため、家具単位で決めると誤る（実測で38件が該当）。
 */
export function matchesParty(f: Fixture, party: PartyFilter, charId: number | null): boolean {
  if (party === "any") return true;
  if (f.talkCount === 0) return false;
  if (charId != null) {
    if (!f.talkChars.includes(charId)) return false;
    const solo = f.talkSoloBy.get(charId) ?? 0;
    const total = f.talkCountBy.get(charId) ?? 0;
    return party === "solo" ? solo > 0 : total - solo > 0;
  }
  const anySolo = f.talkChars.some((c) => (f.talkSoloBy.get(c) ?? 0) > 0);
  return party === "solo" ? anySolo : f.maxParty >= 2;
}

/** キャラを選んでいないときの種別判定。 */
function matchesKindOnly(f: Fixture, kinds: ReactionKind[]): boolean {
  if (kinds.length === 0) return true;
  return kinds.some((k) => (k === "talk" ? f.talkCount > 0 : f.likeChars.length > 0));
}

/**
 * @param owned 「持っている」と印を付けた家具ID。state.owned が any 以外のときに効く。
 */
export function applyFilter(
  fixtures: Fixture[],
  state: FilterState,
  owned: ReadonlySet<number> = new Set()
): Fixture[] {
  const q = normalizeQuery(state.query);
  const out = fixtures.filter((f) => {
    if (state.owned === "owned" && !owned.has(f.id)) return false;
    if (state.owned === "unowned" && owned.has(f.id)) return false;
    if (state.reactiveOnly && !f.reactive) return false;
    // ★ キャラを選んでいれば「その子が使う家具」に絞れる（誰が使うかのデータがある）。
    //   選んでいなければ家具の印（isGameCharacterAction）かアクションデータの有無で見る。
    if (state.actionOnly) {
      if (state.charId != null) {
        // データがあればそれで判定。無い家具は「印つき かつ その子の会話がある」
        // ときだけ拾う（座って喋る類）。印だけで誰が使うか不明なものは混ぜない。
        const uses =
          f.actionChars.includes(state.charId) ||
          (f.action && f.talkChars.includes(state.charId));
        if (!uses) return false;
      } else if (!f.action && f.actionChars.length === 0) {
        return false;
      }
    }
    if (state.party !== "any" && !matchesParty(f, state.party, state.charId)) return false;
    // 「設計図が無い家具」(null) は模写のしようが無いので、模写可のみでは落とす。
    if (state.sketchableOnly && f.sketch !== true) return false;
    if (state.mainGenreId != null && f.mainGenreId !== state.mainGenreId) return false;
    if (state.charId != null) {
      if (!matchesChar(f, state.charId, state.kinds)) return false;
    } else if (!matchesKindOnly(f, state.kinds)) {
      return false;
    }
    if (q && !normalizeQuery(f.name).includes(q) && !normalizeQuery(f.reading).includes(q)) {
      return false;
    }
    return true;
  });
  return sortFixtures(out, state.sort, state.desc, state.charId);
}

const volume = (f: Fixture) => f.size[0] * f.size[1] * f.size[2];

/** 会話本数。キャラを選んでいればその人のぶん、選んでいなければ家具全体の総数。 */
export function talksOf(f: Fixture, charId: number | null): number {
  if (charId == null) return f.talkCount;
  return f.talkCountBy.get(charId) ?? 0;
}

/**
 * 回収の単位になる顔ぶれ。キャラを選んでいればその人が出るものだけ。
 *
 * ★ **進捗の分母はこれを使うこと。** 会話本数（talksOf）を分母にすると分子と単位が
 *   食い違う——チェックは顔ぶれ単位に付くのに、同じ顔ぶれで複数の会話を持つ家具が
 *   203件あるため、全部チェックしても「90/91」のように到達しない。
 *   キャラを選んでいるときはさらにズレが大きく、実測で「90/5」のような値が出ていた。
 */
export function partiesOf(f: Fixture, charId: number | null): number[][] {
  if (charId == null) return f.parties;
  return f.parties.filter((p) => p.includes(charId));
}

export function sortFixtures(
  fixtures: Fixture[],
  sort: SortKey,
  desc: boolean,
  charId: number | null = null
): Fixture[] {
  const dir = desc ? -1 : 1;
  // 元配列を壊さない（呼び出し側が useMemo で保持しているため）。
  return [...fixtures].sort((a, b) => {
    let d = 0;
    // キャラを選んでいるときは「その人の会話数」で並べる。
    // 家具全体の総数で並べると、誰を選んでも同じ順（＝多人数で使えるソファが上）になる。
    if (sort === "talks") d = talksOf(a, charId) - talksOf(b, charId);
    else if (sort === "cost") d = (a.cost ?? 0) - (b.cost ?? 0);
    else if (sort === "size") d = volume(a) - volume(b);
    else d = a.reading.localeCompare(b.reading, "ja");
    // 同点は名前順で固定する（並びが毎回変わると差分が読めない）。
    if (d === 0) return a.reading.localeCompare(b.reading, "ja");
    return d * dir;
  });
}

/**
 * 絞り込み結果の要約。件数だけでなく「取りに行ける数」を出す。
 * ★ 会話本数は charId を渡せば**その人のぶんだけ**数える。家具の総数を足すと
 *   実数の19倍になる（一歌で 4205 本と出て、実際は 220 本だった）。
 */
export function summary(
  list: Fixture[],
  charId: number | null = null
): { total: number; sketchable: number; talks: number } {
  return {
    total: list.length,
    sketchable: list.filter((f) => f.sketch === true).length,
    talks: list.reduce((a, f) => a + talksOf(f, charId), 0),
  };
}
