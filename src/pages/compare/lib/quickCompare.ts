/**
 * 編成かんたん比較の入力まわり（純粋関数）。
 *
 * ★ 計算は持たない。スコア → イベントPt は編成ビルダーの比較と同じ compareDecks
 *   （src/pages/deck/lib/compare.ts → 効率曲ランキングの calcScore / eventPtFor）に流す。
 *   ここでやるのは「打ち込んだ文字を、比較にかけられる編成に直す」ことだけ。
 */
import type { DeckCandidate } from "../../deck/lib/compare";
import { multiEffectiveSkill, type LiveType } from "../../ranking/lib/efficiency";
import type { Difficulty } from "../../ranking/useRankingMusics";

/** 画面で選べる難易度（編成ビルダーの比較と同じ3つ）。保存した値もこの中だけ通す */
export const COMPARE_DIFFICULTIES = ["master", "append", "expert"] as const satisfies readonly Difficulty[];

/** 1行ぶんの入力。**文字のまま持つ**（打ちかけの「351,」や空欄を壊さないため） */
export interface QuickRow {
  id: string;
  name: string;
  power: string;
  bonus: string;
  leader: string;
  total: string;
}

let seq = 0;
export function emptyRow(name: string): QuickRow {
  seq += 1;
  return { id: `r${Date.now().toString(36)}-${seq}`, name, power: "", bonus: "", leader: "", total: "" };
}

/** 使っていない一番前の英字（A, B, C…）。全部使っていれば番号 */
export function nextName(rows: readonly QuickRow[]): string {
  const used = new Set(rows.map((r) => r.name));
  for (let i = 0; i < 26; i += 1) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  return `編成${rows.length + 1}`;
}

/** 「351,149」「３５１１４９」「 425 」→ 数。空や数でないものは null */
export function parseNum(s: string): number | null {
  const t = s.normalize("NFKC").replace(/[,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type RowCheck =
  | { ok: true; candidate: DeckCandidate; effective: number }
  /** reason が null なのは「まだ何も入れていない」（黙って待つ） */
  | { ok: false; reason: string | null };

export function checkRow(r: QuickRow, fallbackName: string): RowCheck {
  const raw = [r.power, r.bonus, r.leader, r.total];
  const nums = raw.map(parseNum);
  if (raw.some((s, i) => s.trim() !== "" && nums[i] == null)) return { ok: false, reason: "数字で入れてください" };
  const [power, bonus, leader, total] = nums;
  if (power == null || bonus == null || leader == null || total == null) {
    return { ok: false, reason: raw.every((s) => s.trim() === "") ? null : "4つとも入れると計算します" };
  }
  if (power <= 0) return { ok: false, reason: "総合力は0より大きい数で" };
  if (bonus < 0 || leader < 0) return { ok: false, reason: "マイナスは入れられません" };
  if (total < leader) return { ok: false, reason: "内部値はリーダーを含む5枚の合計です（リーダー以上）" };
  return {
    ok: true,
    candidate: { name: r.name.trim() || fallbackName, power, bonus, skillLeader: leader, skillTotal: total },
    effective: multiEffectiveSkill(leader, total),
  };
}

/**
 * 同じ名前が2つ以上あれば、2つ目から「 (2)」「 (3)」を付ける。付けた名前とも重ならないようにする。
 * ★ 同じ名前が並ぶと、表と「ボーナスが低い方が勝っています」の文でどれのことか分からない
 */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((base) => {
    let name = base;
    for (let k = 2; used.has(name); k += 1) name = `${base} (${k})`;
    used.add(name);
    return name;
  });
}

/** 最良に対して何割下か（0 なら最良と同じ）。計算できなければ null */
export function lossFromBest(pt: number | null, bestPt: number | null): number | null {
  if (pt == null || bestPt == null || bestPt <= 0) return null;
  return pt / bestPt - 1;
}

/** 最大の行数（スマホで比べきれる数） */
export const MAX_ROWS = 8;

export interface QuickState {
  rows: QuickRow[];
  songId: string;
  difficulty: Difficulty;
  live: LiveType;
  taki: number;
}

const LIVES: readonly LiveType[] = ["multi", "solo", "auto"];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isRow = (v: unknown): v is QuickRow =>
  isRecord(v) && ["id", "name", "power", "bonus", "leader", "total"].every((k) => typeof v[k] === "string");

/**
 * 保存してあった値を読み直す。**形が合うものだけ通す**（壊れていれば既定値に任せる）。
 * localStorage は他のタブ・古い版が書いた値かもしれない。
 */
export function parseState(raw: unknown): Partial<QuickState> {
  if (!isRecord(raw)) return {};
  const out: Partial<QuickState> = {};
  if (Array.isArray(raw.rows)) {
    // id が重なった行は最初の1つだけ（行の書き換え・削除は id で探すので、重なると1回の操作が2行に効く）
    const ids = new Set<string>();
    const rows = raw.rows
      .filter(isRow)
      .filter((r) => !ids.has(r.id) && Boolean(ids.add(r.id)))
      .slice(0, MAX_ROWS)
      .map((r) => ({ ...r }));
    if (rows.length > 0) out.rows = rows;
  }
  if (typeof raw.songId === "string" && raw.songId !== "") out.songId = raw.songId;
  if (typeof raw.difficulty === "string" && (COMPARE_DIFFICULTIES as readonly string[]).includes(raw.difficulty)) {
    out.difficulty = raw.difficulty as Difficulty;
  }
  if (typeof raw.live === "string" && (LIVES as readonly string[]).includes(raw.live)) out.live = raw.live as LiveType;
  if (typeof raw.taki === "number" && Number.isInteger(raw.taki) && raw.taki >= 0 && raw.taki <= 10) out.taki = raw.taki;
  return out;
}

const STORAGE_KEY = "quickCompare:v1";

/** 前回の入力（1人ぶんの便利機能。読めなければ空） */
export function loadState(): Partial<QuickState> {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? parseState(JSON.parse(s)) : {};
  } catch {
    return {};
  }
}

export function saveState(s: QuickState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // プライベートブラウズ等で書けなくても、比較そのものは動く
  }
}
