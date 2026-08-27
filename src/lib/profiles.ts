/**
 * 編成プロフィール。**総合力・イベントボーナス・スキルの内部値を1箇所に置き、
 * 全ツールがそこを既定値として読む。**
 *
 * ── なぜ要るか ────────────────────────────────────────────────
 * 同じ数字が別名でツールごとに散らばっていた（ランキングは power/bonus、
 * アナライザーは talent/bonus、実効値は inner/slots）。しかも保存していたのは
 * ランキングだけで、他は開くたびに打ち直し。9個のツールが「1つの製品」ではなく
 * 「9枚のページ」になっていた原因のひとつ。
 *
 * ── なぜ複数持てるか ──────────────────────────────────────────
 * ゲーム内でも編成を複数保存できる。イベント編成・チャレンジライブ用・
 * 別ユニット用を行き来するのが普通の使い方なので、名前を付けて並べられるようにする。
 * 保存の作法（名前付き・一覧・上書き）は周回プラン（planStorage.ts）に揃えてある。
 *
 * ── 貼るだけ入力 ──────────────────────────────────────────────
 * ゲーム内やメモからコピーした `150/710/31.3` のような文字列をそのまま食える
 *（parseProfileText）。**このプロフィールの中身がそのまま貼り付け形式**になっている。
 */
import { useSyncExternalStore } from "react";

export interface Profile {
  id: string;
  name: string;
  /** 総合力（実数。31.3万なら 313000）。 */
  power?: number;
  /** イベントボーナス(%)。 */
  bonus?: number;
  /** 先頭（リーダー）のスキル値(%)。 */
  skillLeader?: number;
  /** リーダー込み5枚のスコアアップ合計。 */
  skillTotal?: number;
  /**
   * よく使う焚き数。**`hourlyRate` の基準焚き数も兼ねる。**
   * 時速は焚き数に比例するので、どの焚き数で測ったかとセットでないと意味がない。
   */
  taki?: number;
  /**
   * 実測の点数時速（pt/時、上の `taki` で測った値）。稼働時間計算・周回プランが使う。
   *
   * ★ 他のフィールドは編成から**計算できる**値だが、これだけは**実測値**。
   *   総合力からスコアを起こすのは叩き方の精度に依存するので、計算では出せない
   *   （アナライザーの領分で、しかも精度の仮定が要る）。編成を変えたら測り直す値。
   */
  hourlyRate?: number;
  /**
   * 出所。編成ビルダーが計算して入れたものは "deck"。
   * ★ **プロフィールは全ツール共通の軽い受け口**という位置づけを変えない。
   *   各ツールが編成ビルダーのデータ（カタログ1.2MB＋計算一式）を直接読むと、
   *   どのページを開いても重くなる。ビルダー側が「生産者」として数字を書き込み、
   *   ツールは今までどおりここだけを読む（Nori と決めた 2026-08-02）。
   */
  source?: "deck";
  /** 並び順（小さいほど上）。 */
  order: number;
}

/** プロフィールが持つ数値フィールド。UI の組み立てと検証で共有する。 */
export const PROFILE_FIELDS = [
  { key: "power", label: "総合力", unit: "", max: 5_000_000 },
  { key: "bonus", label: "イベントボーナス", unit: "%", max: 1000 },
  { key: "skillLeader", label: "先頭スキル", unit: "%", max: 1000 },
  { key: "skillTotal", label: "スキル合計", unit: "", max: 5000 },
  { key: "taki", label: "焚き数", unit: "", max: 10 },
  // 時速は実測値で桁が大きい。上限は「1時間で500万pt」＝実運用ではあり得ない値に置く。
  { key: "hourlyRate", label: "点数時速", unit: "pt/時", max: 5_000_000 },
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number]["key"];

const KEY = "sekaimaster:profiles:v1";
const ACTIVE_KEY = "sekaimaster:profile-active:v1";

/* ---- 貼るだけ入力 -------------------------------------------------------- */

/**
 * 「内部値」の文字列を読む。例: `150/710/31.3` `150 710 31.3 170%`
 *
 * 並びは 先頭スキル / スキル合計 / 総合力 [/ イベントボーナス]。
 * 区切りは / 、 , 空白（全角も）どれでもよく、% は付いていても外れていてもよい。
 *
 * ★ 総合力は「万」で書かれることが多い（31.3）。実数（313000）で書く人も居るので、
 *   小さすぎる値は万として解釈する。境目を 1000 に置いているのは、
 *   総合力が1000未満ということは実運用で起こらないため。
 */
export function parseProfileText(text: string): Partial<Profile> | null {
  const nums = text
    .replace(/[／、，]/g, "/")
    // 単位は落として数字だけ見る。「31.3万」の万も落としてよい ──
    // 万で書かれた総合力は必ず 1000 未満になるので、下の判定で吸収される。
    .replace(/[%％万]|pt|点/gi, " ")
    .split(/[/\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    // 全角数字を半角へ
    .map((s) => s.replace(/[０-９．]/g, (c) => "0123456789."["０１２３４５６７８９．".indexOf(c)]))
    .filter((s) => /^\d+(\.\d+)?$/.test(s))
    .map(Number);

  if (nums.length < 3) return null;

  const [skillLeader, skillTotal, rawPower, bonus] = nums;
  const power = rawPower < 1000 ? Math.round(rawPower * 10_000) : Math.round(rawPower);

  const out: Partial<Profile> = { skillLeader, skillTotal, power };
  if (typeof bonus === "number") out.bonus = bonus;
  return clampProfile(out);
}

/** 貼り付けに使える形へ戻す（コピーして持ち歩ける）。 */
export function formatProfileText(p: Partial<Profile>): string {
  const parts = [p.skillLeader, p.skillTotal, p.power != null ? p.power / 10_000 : undefined];
  if (parts.some((v) => v == null)) return "";
  const text = parts.map((v) => String(Number(v!.toFixed(2)))).join("/");
  return p.bonus != null ? `${text}/${p.bonus}%` : text;
}

/** 範囲外・NaN を落とす。外部（貼り付け・localStorage）由来は必ず通す。 */
export function clampProfile<T extends Partial<Profile>>(p: T): T {
  const out = { ...p };
  for (const f of PROFILE_FIELDS) {
    const v = out[f.key];
    if (v == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > f.max) {
      delete out[f.key];
    }
  }
  return out;
}

/* ---- 保存 --------------------------------------------------------------- */

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** 外部由来なので1件ずつ検証する。壊れた要素が混じっても健全なものだけ残す。 */
function isProfile(v: unknown): v is Profile {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Profile>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.order === "number";
}

export function readProfiles(): Profile[] {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isProfile)
      .map((p) => clampProfile(p))
      .sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

let cache: Profile[] = readProfiles();
let activeId: string | null = (() => {
  try {
    return storage()?.getItem(ACTIVE_KEY) ?? null;
  } catch {
    return null;
  }
})();

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist(): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(cache));
    if (activeId) storage()?.setItem(ACTIVE_KEY, activeId);
    else storage()?.removeItem(ACTIVE_KEY);
  } catch {
    // 容量超過・プライベートモードは無視（保存は best-effort）。
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const getProfiles = (): Profile[] => cache;
export const getActiveId = (): string | null => activeId;

/** いま選ばれている編成。1つも無ければ null。 */
export function getActiveProfile(): Profile | null {
  return cache.find((p) => p.id === activeId) ?? cache[0] ?? null;
}

let seq = 0;
const newId = (): string => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

export function createProfile(name: string, values: Partial<Profile> = {}): Profile {
  const next: Profile = {
    ...clampProfile(values),
    id: newId(),
    name: name.trim() || `編成${cache.length + 1}`,
    order: cache.length,
  };
  cache = [...cache, next];
  activeId = next.id;
  persist();
  emit();
  return next;
}

/**
 * 名前で作成または更新する（編成ビルダーからの書き戻し用）。
 *
 * ★ 同じ名前のものがあれば**上書き**。編成ビルダー側で編成を保存し直すたびに
 *   プロフィールが増殖するのを防ぐ。名前が編成の identity になっている。
 * ★ 手で作ったプロフィールを黙って書き換えないよう、**source が違うものは
 *   別枠として新しく作る**（手入力の値を計算値で潰さない）。
 */
export function upsertProfileByName(name: string, values: Partial<Profile>): Profile {
  const trimmed = name.trim() || "編成";
  const found = cache.find((p) => p.name === trimmed && p.source === values.source);
  if (found) {
    updateProfile(found.id, values);
    setActiveProfile(found.id);
    return cache.find((p) => p.id === found.id) ?? found;
  }
  return createProfile(trimmed, values);
}

/**
 * 空欄（undefined）の項目を落とす。**入力欄が空なのは「消してくれ」ではない。**
 *
 * ★ updateProfile は patch をそのまま spread するので、`hourlyRate: undefined` を
 *   渡すと編成に入っていた時速が消える。ツールから編成へ書き戻すときは必ずここを通す
 *   （設定画面の台帳では逆に、空にする＝消すの意味で undefined を使うので通さない）。
 */
export function omitEmpty(values: Partial<Profile>): Partial<Profile> {
  const out: Partial<Profile> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function updateProfile(id: string, patch: Partial<Profile>): void {
  const { id: _ignored, order: _order, ...rest } = patch;
  // clampProfile は数値欄しか見ないので、name/source はそのまま通す。
  cache = cache.map((p) => (p.id === id ? { ...p, ...clampProfile(rest) } : p));
  persist();
  emit();
}

export function removeProfile(id: string): void {
  cache = cache.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i }));
  if (activeId === id) activeId = cache[0]?.id ?? null;
  persist();
  emit();
}

export function setActiveProfile(id: string | null): void {
  activeId = id;
  persist();
  emit();
}

/** React から購読する。参照が変わらない限り再描画しない。 */
export function useProfiles(): Profile[] {
  return useSyncExternalStore(subscribe, getProfiles, getProfiles);
}

export function useActiveProfile(): Profile | null {
  return useSyncExternalStore(subscribe, getActiveProfile, getActiveProfile);
}

/** テスト用。モジュールの状態を初期化する。 */
export function resetProfilesForTest(): void {
  cache = [];
  activeId = null;
  listeners.clear();
  try {
    storage()?.removeItem(KEY);
    storage()?.removeItem(ACTIVE_KEY);
  } catch {
    /* noop */
  }
}
