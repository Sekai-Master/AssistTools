/**
 * お題を選ぶ小窓（OdaiPicker）の一覧・並び・検索。入れたいお題（作るカードに必ず入れるお題）と、
 * 作ったカードの 1 マスの差し替えで同じものを使う。
 * カードへの入れ方は odaiLogic.ts の resolvePinnedOdais・buildOdaiCard、差し替えは replaceOdaiCell、保存は odaiPinStorage.ts。
 */
import { CHARACTERS } from "../deck/lib/characters";
import type { BingoMusic } from "./bingoLogic";
import { sameCreatorKey } from "./creatorMembers";
import { type Odai, type OdaiKind, allOdaiDefs, toHiragana } from "./odaiDefs";

/** 選ぶ小窓の 1 行。楽曲データで 1 曲以上当てはまるお題（割合の範囲・1 マスに収まるかでは絞らない）。 */
export interface PickableOdai extends Odai {
  /** 当てはまる曲数。 */
  count: number;
  /** 検索で見る文字（札・文言・キャラのフルネーム。小文字・ひらがなにしてある）。 */
  search: string;
}

/** 選ぶ小窓の種類の絞り込み。今の kind をまとめたもの。並びは小窓の見出しの順。 */
export const PICK_GROUPS: readonly { key: string; label: string; kinds: readonly OdaiKind[] }[] = [
  { key: "vocal", label: "ボーカル", kinds: ["singer", "vocal"] },
  { key: "unit", label: "ユニット", kinds: ["unit"] },
  { key: "origin", label: "曲の種類", kinds: ["origin"] },
  { key: "creator", label: "作者", kinds: ["creator", "maker"] },
  { key: "title", label: "曲名", kinds: ["title", "word"] },
  { key: "reading", label: "読み・長さ", kinds: ["row", "reading", "length"] },
  { key: "chart", label: "譜面", kinds: ["chart"] },
  { key: "mv", label: "MV", kinds: ["mv"] },
  { key: "added", label: "追加", kinds: ["added"] },
];

const normalize = (s: string) => toHiragana(s.toLowerCase());

/** ボーカルのお題の鍵（s<キャラ id>）→ キャラのフルネーム（「星乃」でも「一歌」でも引けるように）。 */
const FULL_NAME_BY_KEY = new Map(CHARACTERS.map((c) => [`s${c.ch}`, c.name]));

/** 選ぶ小窓に出すお題（allOdaiDefs のうち 1 曲以上当てはまるもの）。 */
export function listPickableOdais(musics: readonly BingoMusic[]): PickableOdai[] {
  if (musics.length === 0) return [];
  return allOdaiDefs(musics).flatMap((def) => {
    const count = musics.reduce((acc, m) => acc + (def.test(m) ? 1 : 0), 0);
    if (count === 0) return [];
    const search = normalize([def.caption, def.text, FULL_NAME_BY_KEY.get(def.key) ?? ""].join(" "));
    return [{ ...def, rate: count / musics.length, count, search }];
  });
}

/**
 * 保存した入れたいお題の鍵を、今の選べるお題に合わせる。表記違いの作者の鍵（c49 和田たけあき(くらげP)）は
 * 同じ人の鍵（c36 和田たけあき）に置き換え、選べない鍵（楽曲データに無い）は落とす。重なれば 1 つに。
 */
export function resolveSavedPins(keys: readonly string[], pickable: ReadonlyMap<string, unknown>): string[] {
  const resolved = keys.map((k) => {
    const same = sameCreatorKey(k);
    return same !== null && pickable.has(same) ? same : k;
  });
  return [...new Set(resolved.filter((k) => pickable.has(k)))];
}

export interface PickSection {
  key: string;
  label: string;
  /** 曲数の多い順（同じなら文言の順）。 */
  items: PickableOdai[];
}

/**
 * 選ぶ小窓の並び: 種類ごとの見出しの下に、曲数の多い順。query（札・文言・キャラ名。大文字小文字・ひらがなカタカナを問わない）と
 * 種類（group。null ならすべて）で絞る。当てはまるお題が無い種類は出さない。
 */
export function pickSections(items: readonly PickableOdai[], query: string, group: string | null): PickSection[] {
  const q = normalize(query.trim());
  return PICK_GROUPS.filter((g) => group === null || g.key === group).flatMap((g) => {
    const hit = items
      .filter((o) => g.kinds.includes(o.kind) && (!q || o.search.includes(q)))
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "ja"));
    return hit.length > 0 ? [{ key: g.key, label: g.label, items: hit }] : [];
  });
}
