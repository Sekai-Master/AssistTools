/**
 * トップ（ハブ）の計算。表示から切り離してテストする。
 * 開催中のイベント（EventHero）・ツールの検索（ToolDirectory）・更新履歴（LatestChanges）。
 */
import { TOOL_CATEGORIES, TOOLS, type ToolDef } from "../../tools";
import type { Release } from "../legal/changelogParser";
import type { Snapshot } from "../border/borderView";

type Rank = Snapshot["ranks"][number];

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (num(v) ? v : null);

/**
 * /api/border/current の応答を、トップで使える形に整える。使えなければ null。
 * ★ 形の崩れた順位（null・数でない値）は捨てて残りで出す。1つの崩れでトップ全体
 *   （ツールの一覧ごと）を失敗の表示にしない（#194 のレビュー M1）。
 */
export function sanitizeSnapshot(v: unknown): Snapshot | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<Snapshot>;
  const e = s.event as Partial<Snapshot["event"]> | undefined;
  if (!e || !num(e.id) || !num(e.startAt) || !num(e.aggregateAt) || typeof e.name !== "string" || !Array.isArray(s.ranks)) return null;
  const ranks: Rank[] = [];
  for (const r of s.ranks as unknown[]) {
    if (!r || typeof r !== "object") continue;
    const x = r as Partial<Rank>;
    if (!num(x.rank) || !num(x.current)) continue;
    ranks.push({
      ...(x as Rank),
      predicted: numOrNull(x.predicted),
      low: numOrNull(x.low),
      high: numOrNull(x.high),
      visible: x.visible === true,
    });
  }
  if (ranks.length === 0) return null;
  return { ...(s as Snapshot), event: { ...(e as Snapshot["event"]), unit: typeof e.unit === "string" ? e.unit : "" }, ranks, sampleAt: num(s.sampleAt) ? s.sampleAt : NaN };
}

/** 終わりの時刻（集計の 20:59:59 の次の分）。ボーダー予測のページと同じく aggregateAt + 1分で書く。 */
export const endAt = (ev: { aggregateAt: number }) => ev.aggregateAt + 60_000;

/**
 * 下の行の書き方。
 * - predicted: 予測を出している順位がある
 * - current: 開催中で予測がまだ無い（予測を出す前・マラソン以外）。出しているのはいまの値
 * - final: 終わった回。出しているのは最後に集めた値
 * ★ 予測を出していないのに「予測」と書かない（#194 のレビュー M4）
 */
export function captionKind(snap: Snapshot, running: boolean): "predicted" | "current" | "final" {
  if (!running) return "final";
  return snap.ranks.some((r) => r.visible && r.predicted != null) ? "predicted" : "current";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 集計までの残り時間。1日以上は「3日 04:05」、1日未満は「04:05:06」。
 * ★ 1日以上あるあいだは秒を出さない（大きな数字が毎秒変わると目障り）。最終日は秒が要る
 *   （集計直前の最後の1曲の判断に使う）。秒未満は切り捨てる。終わっていれば空文字。
 */
export function formatCountdown(ms: number): string {
  if (!(ms > 0)) return "";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const hm = `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}`;
  return d > 0 ? `${d}日 ${hm}` : `${hm}:${pad2(s % 60)}`;
}

/**
 * 秒を出すあいだは1秒ごと、出さないあいだは15秒ごとに描き直せば足りる。
 * 終わった後は「終了」のままなので、1分ごとで足りる（次の回まで1秒ごとに描き直さない）。
 */
export function tickMs(msLeft: number): number {
  if (msLeft <= -60_000) return 60_000;
  return msLeft < 86_400_000 ? 1000 : 15_000;
}

/** 始まりから集計までの、いまの位置（0〜1）。 */
export function elapsedRatio(ev: { startAt: number; aggregateAt: number }, now: number): number {
  const span = ev.aggregateAt - ev.startAt;
  if (!(span > 0)) return 1;
  return Math.min(1, Math.max(0, (now - ev.startAt) / span));
}

/**
 * ロゴの URL（サイトが既に配っている /CardDatas/logo/<asset>.webp）。
 * ★ API は D1 の値を検査せずに返すので、URL に組む前にここで弾く（歴代ボーダーの historyView.ts と同じ規則）。
 */
export function logoSrc(asset: unknown): string | null {
  if (typeof asset !== "string" || !/^[a-z0-9_]+$/.test(asset)) return null;
  return `${import.meta.env.BASE_URL}CardDatas/logo/${asset}.webp`;
}

export interface RankBar {
  /** いまの値の位置（%）。 */
  current: number;
  /** 8割の幅の左端（%）。 */
  low: number;
  /** 8割の幅の長さ（%）。 */
  band: number;
  /** 予測の位置（%）。 */
  predicted: number;
}

/** 右端は幅の上端より少しだけ先に置く。上端がバーの端に貼り付くと、帯の終わりが読めない。 */
const HEADROOM = 1.08;

/**
 * 順位ごとのバー。いま・8割の幅・予測を、その順位の幅の上端を基準にした割合で出す。
 * 順位ごとに右端が違う（50位と2000位を同じ物差しにすると、2000位が潰れて読めない）。
 * 予測か幅が無い順位は出さない。
 */
export function rankBar(r: { current: number; predicted: number | null; low: number | null; high: number | null }): RankBar | null {
  if (r.predicted == null || r.low == null || r.high == null || !(r.high > 0)) return null;
  const top = r.high * HEADROOM;
  const at = (v: number) => Math.min(100, Math.max(0, (v / top) * 100));
  return {
    current: at(r.current),
    low: at(r.low),
    band: at(r.high) - at(r.low),
    predicted: at(r.predicted),
  };
}

/** この語尾の前でだけ折る（ツールの名前）。 */
const NAME_SUFFIXES = ["ジェネレーター", "アナライザー", "ランキング", "計算機"];

/**
 * ツールの名前を、折ってよい所で区切る。表示は区切りの間に <wbr> を入れ、ほかでは折らない。
 * ★ ブラウザに任せると「ついぼジェネレータ／ー」「ポイント調整アナラ／イザー」と語の途中で折れた
 *   （2026-11-05 の撮影。文節で折る auto-phrase もカタカナの続きを1つの文節と見て効かなかった）。
 */
export function nameParts(name: string): string[] {
  for (const s of NAME_SUFFIXES) {
    const i = name.lastIndexOf(s);
    if (i > 0 && i + s.length === name.length) return [name.slice(0, i), s];
  }
  return [name];
}

/** 全角・半角と大文字・小文字の違いを無くす。 */
function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/**
 * ツールの検索。名前・略称・説明・分類の名前と説明のどれかに、空白で区切った語がすべて含まれるものを返す。
 * 空のときは null（一覧を分類ごとに出す）。
 */
export function searchTools(query: string, tools: readonly ToolDef[] = TOOLS): ToolDef[] | null {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return tools.filter((t) => {
    const cat = TOOL_CATEGORIES.find((c) => c.id === t.category);
    const hay = normalize([t.name, t.shortName, t.description, cat?.label, cat?.note].filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/** YYYY-MM-DD → 「10/31」。 */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : iso;
}

/** 版の説明。無い版は最初の項目で代える。 */
export function summaryOf(r: Release): string {
  return r.summary || r.groups[0]?.items[0] || "";
}
