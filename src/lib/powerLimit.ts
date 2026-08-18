/**
 * 「発揮可能総合力」の上限。
 *
 * ★★ 何の話か ★★
 * ワールドリンク第3弾（イベント202以降）では、**編成の総合力がある値を超えても、
 * 超えたぶんはスコアに乗らない**（実測はどの回も 336,000）。スコアが頭打ちになるので、
 * スコアから出るイベントPtも頭打ちになる。協力・ソロ・オートのどれで叩いても同じ。
 *
 * ★ **「ワールドリンクなら一律で掛かる」ではない。**
 *   旧ワールドリンク（「水底に影を探して」「泡沫に抱かれて」など13回）には上限が無い。
 *   `eventType === "world_bloom"` で代用すると、上限の無い過去イベントまで巻き込んで
 *   計算を誤らせる。判定は必ずマスタ由来の powerLimits.json を引くこと。
 *
 * ★ 配信ファイルを bonuses.json（270KB）と分けている理由:
 *   上限は編成ビルダーだけでなく効率曲ランキングでも要る。しかし
 *   「各ツールが編成ビルダーのデータを直接読むとどのページも重くなる」という
 *   既存の方針（src/lib/profiles.ts）があるので、判定に要る最小限
 *   （開催期間と上限値だけ・5行 625 バイト）を切り出して配っている。
 */

import { useEffect, useState } from "react";

export interface PowerLimitEvent {
  id: number;
  name: string;
  startAt: number;
  aggregateAt: number;
  powerLimit: number;
}

function isRow(v: unknown): v is PowerLimitEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<PowerLimitEvent>;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  return (
    num(e.id) &&
    typeof e.name === "string" &&
    num(e.startAt) &&
    num(e.aggregateAt) &&
    num(e.powerLimit) &&
    (e.powerLimit as number) > 0
  );
}

/**
 * いま開催中で、総合力の上限があるイベント。無ければ null。
 *
 * ★ 判定は「開始済みかつ集計前」。ランキング集計が終われば走る意味が無いので
 *   aggregateAt を終端に使う（編成ビルダーの defaultEventId と同じ考え方）。
 */
export function activeLimit(events: PowerLimitEvent[], now: number): PowerLimitEvent | null {
  const live = events.filter((e) => e.startAt <= now && e.aggregateAt >= now);
  // 万一重なっていたら、上限が厳しい方を採る（緩い方を出すと過大なPtを見せる）。
  return live.reduce<PowerLimitEvent | null>(
    (best, e) => (!best || e.powerLimit < best.powerLimit ? e : best),
    null
  );
}

/** スコア式に渡してよい総合力。上限が無ければそのまま。 */
export function cappedPower(power: number, limit: number | null | undefined): number {
  return typeof limit === "number" && limit > 0 ? Math.min(power, limit) : power;
}

/** 上限のあるイベントのうち、いちばん新しいもの。開催中でなくてよい。 */
export function latestLimit(events: PowerLimitEvent[]): PowerLimitEvent | null {
  return events.reduce<PowerLimitEvent | null>(
    (best, e) => (!best || e.startAt > best.startAt ? e : best),
    null
  );
}

export interface PowerLimitInfo {
  /** いま開催中で上限があるイベント。無ければ null。 */
  active: PowerLimitEvent | null;
  /**
   * 開催中でなくても使える、直近の上限。
   *
   * ★ **イベント期間外にも上限つきで試したい**（次のワールドリンクの下見）という
   *   使い方があるので、開催中かどうかと、上限値が何かは分けて持つ（Nori 指摘 2026-08-18）。
   */
  latest: PowerLimitEvent | null;
}

/**
 * 上限を読む。**読めなくても画面は動かす**（上限は補助情報で、
 * これが無いとランキングが出せないという性質のものではない）。
 */
export function usePowerLimit(enabled = true): PowerLimitInfo {
  const [event, setEvent] = useState<PowerLimitInfo>({ active: null, latest: null });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}CardDatas/powerLimits.json`, {
          signal: controller.signal,
        });
        // ★ SPA のフォールバックが index.html を 200 で返すので、ok だけでは足りない。
        //   JSON として読めたうえで1行ずつ検証する。
        if (!res.ok) return;
        const raw: unknown = await res.json();
        const rows = raw && typeof raw === "object" ? (raw as { events?: unknown }).events : null;
        if (!Array.isArray(rows)) return;
        const valid = rows.filter(isRow);
        setEvent({ active: activeLimit(valid, Date.now()), latest: latestLimit(valid) });
      } catch {
        // 上限が読めないときは「上限なし」として扱う。ここで画面を止めない。
      }
    })();
    return () => controller.abort();
  }, [enabled]);

  return event;
}
