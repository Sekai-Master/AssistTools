import { useEffect, useState } from "react";
import type { Snapshot } from "../border/borderView";
import { sanitizeSnapshot } from "./hubView";

/**
 * トップ用に、開催中のイベントの1行（/api/border/current）だけを読む。
 *
 * ボーダー予測のページ（useBorderData）と同じく、開いたままでも追いつくよう10分ごとに読み直し、
 * タブが裏にあるあいだは読まない。トップは答え合わせ・推移を出さないので、その2つは読まない
 * （Workers のリクエストは1回の表示で1回。上限10万/日に対して、トップは1日30回ほど）。
 *
 * ★ 前に読んだ値を持っておき、最初の描画から出す（#194 のレビュー H1）。
 *   応答を待ってから欄を差し込むと、先に出たツールの一覧が欄の高さぶん押し下げられる。
 *   ツールから戻るときは、遷移の着地の採寸とスクロールの復元が欄の無い形で走り、着地の後に跳ぶ。
 *   ページの中（モジュール）に持つのでハブへ戻るときは必ず当たり、次に開いたときはブラウザに残した値を使う。
 */
const REFRESH_MS = 10 * 60_000;
const STORE_KEY = "sekaimaster:hub-current:v1";
/** 「開催中の回が無い」と覚えておく長さ。次の回が始まっていれば、この後の読み直しで出る。 */
const NONE_TTL_MS = 30 * 60_000;

interface Memo {
  at: number;
  snap: Snapshot | null;
}

let memo: Memo | null = null;

function remembered(now: number): Memo | null {
  if (memo) return memo;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as { at?: unknown; snap?: unknown };
    if (typeof m.at !== "number") return null;
    const snap = m.snap == null ? null : sanitizeSnapshot(m.snap);
    // 古すぎるものは使わない: 終わってから1日たった回、30分より前の「無い」
    if (snap ? now > snap.event.aggregateAt + 86_400_000 : now - m.at > NONE_TTL_MS) return null;
    memo = { at: m.at, snap };
    return memo;
  } catch {
    return null;
  }
}

function remember(snap: Snapshot | null): void {
  memo = { at: Date.now(), snap };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(memo));
  } catch {
    // プライベートモードなどで書けなくても、ページの中では memo が効く
  }
}

/** テスト用: 覚えている値を捨てる。 */
export function forgetCurrentBorder(): void {
  memo = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // 無視
  }
}

export interface CurrentBorder {
  current: Snapshot | null;
  /** まだ一度も読めていない（覚えている値も無い）。欄の場所を取っておくのに使う */
  loading: boolean;
}

export function useCurrentBorder(): CurrentBorder {
  const [data, setData] = useState<CurrentBorder>(() => {
    const m = remembered(Date.now());
    return m ? { current: m.snap, loading: false } : { current: null, loading: true };
  });

  useEffect(() => {
    let ctrl = new AbortController();
    const load = () => {
      ctrl.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      fetch(`${import.meta.env.BASE_URL}api/border/current`, { signal })
        .then(async (res) => {
          if (res.status === 404) return { snap: null };
          // ★ 一時的な 500/503 で欄を消さない（消すと一覧が上へ跳ねる）。前の値を残す
          if (!res.ok) throw new Error(`current: ${res.status}`);
          return { snap: sanitizeSnapshot(await res.json()) };
        })
        .then(({ snap }) => {
          if (signal.aborted) return;
          remember(snap);
          setData({ current: snap, loading: false });
        })
        .catch(() => {
          // ★ トップでは付け足しの欄。読めなければ前の値のまま（一度も読めていなければ出さない）
          if (!signal.aborted) setData((d) => ({ ...d, loading: false }));
        });
    };
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ctrl.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return data;
}
