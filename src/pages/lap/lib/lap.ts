/**
 * 周回ラップ計測の中身。**状態遷移と集計をここに閉じ込める**（画面は描くだけ）。
 *
 * ── 何を測る道具か ────────────────────────────────────────────
 * イベラン中に「1周が実際に何秒かかっているか」を、曲が終わるたびのタップで測る。
 * 出したいのは平均ラップそのものより **オーバーヘッド（ラップ − 曲長）**。
 * ロード・マッチング・部屋待ち・リザルト送りの合計が、そのまま自分の環境の実力になる。
 * サイト全体の見積り（src/lib/overhead.ts）が置いている既定値と比べられるようにしてある。
 *
 * ── なぜ「マーク＋区間の周回数」なのか ────────────────────────
 * タップは押し忘れる。押し忘れを「無かったこと」にすると平均が跳ね上がるので、
 * **押した時刻の列（marks）と、その区間に実際は何周入っていたか（laps）** を分けて持つ。
 * 後から「この区間は2周ぶん」と直せば、時刻の整合を壊さずに平均だけ正しくなる。
 *
 * ── 中断（休憩・部屋落ち）────────────────────────────────────
 * 元の試作では「再開した瞬間に周回ボタン→直前を除外」という手順を人間に強いていた。
 * 順番を間違えると休憩まるごとが1周として混ざり、平均が数倍に化ける。
 * ここでは **中断／再開** を明示のボタンにして、再開時に区間を自動で除外する。
 */

import { MULTI_LIVE_SUSPENDED } from "../../../lib/liveSuspension";
import { OVERHEAD_SEC, SOLO_OVERHEAD_PROVISIONAL } from "../../../lib/overhead";

/**
 * 測るライブの種類。比べる既定のロス（src/lib/overhead.ts）と、記録に残す種類だけが変わる。
 * 集計（平均・オーバーヘッド・時速・長すぎる区間）は種類によらない。
 *
 * ★ 前はみんなでライブ決め打ちだった（種類を選ばせても誰も切り替えなかった、Nori 判断 2026-08-21）。
 *   2026-11-18 23:00 から公式がみんなでライブを止め、イベントはひとりでライブで回すことになったので、
 *   選べるようにした（Nori 2026-11-18「ラップ計測もひとりでライブモードを実装して期間中デフォルトをひとりに」）。
 */
export type LapLiveKind = "multi" | "solo";

export const LIVE_KIND_LABEL: Record<LapLiveKind, string> = {
  multi: "みんなでライブ",
  solo: "ひとりでライブ",
};

const isLiveKind = (v: unknown): v is LapLiveKind => v === "multi" || v === "solo";

/** 利用者が選んでいないときの種類。みんなでライブが止まっている間はひとりでライブ。 */
export function defaultLiveKind(suspended: boolean = MULTI_LIVE_SUSPENDED): LapLiveKind {
  return suspended ? "solo" : "multi";
}

/**
 * いまの種類。**測っている間は計測を始めたときの種類**、それ以外は選んだ種類、選んでいなければ既定。
 * ★ 既定を保存値に書き込まない。選んでいない人は、MULTI_LIVE_SUSPENDED を false に戻した時点で
 *   みんなでライブに戻る（その 1 か所で各画面の既定が戻る、という土台の約束）。
 */
export function liveKindOf(s: LapState, suspended: boolean = MULTI_LIVE_SUSPENDED): LapLiveKind {
  return s.runKind ?? s.liveKind ?? defaultLiveKind(suspended);
}

/** 比べる既定のロス（曲以外の秒数）。数字は overhead.ts にだけ置く。 */
export function modelOverheadSec(kind: LapLiveKind): number {
  return OVERHEAD_SEC[kind];
}

/**
 * 比べる既定のロスが、まだ実測していない仮の値か。
 * ★ overhead.ts の `SOLO_OVERHEAD_PROVISIONAL` だけで決める（値が 33 かどうかでは見ない。実測がたまたま
 *   同じ値でも、別の仮の値に替えても狂わないように）。Nori が測ったら overhead.ts でその印を false にする。
 */
export function isProvisionalOverhead(
  kind: LapLiveKind,
  provisional: boolean = SOLO_OVERHEAD_PROVISIONAL,
): boolean {
  return kind === "solo" && provisional;
}

export interface LapState {
  /** タップした時刻(ms)。marks[0] が計測開始。 */
  marks: number[];
  /** marks[i]→marks[i+1] の区間に入っていた周回数。長さは marks.length-1。 */
  laps: number[];
  /** 平均から外す区間の index。 */
  excluded: number[];
  /** excluded のうち「中断」由来のもの（表示の文言を変えるだけ）。 */
  breaks: number[];
  /** 選んだ曲の id（手入力なら null）。 */
  songId: string | null;
  songTitle: string;
  /** 曲の長さ(秒)。オーバーヘッドはこれを引いた値。 */
  songSec: number;
  /** 1周で得たイベントPt（0 なら時速Ptを出さない）。 */
  ptPerRun: number;
  /** 焚き数。時速Ptは焚き数とセットでないと意味がないので一緒に持つ。 */
  taki: number;
  /** 中断した時刻(ms)。null なら計測中。 */
  pausedAt: number | null;
  /** 利用者が選んだライブの種類。**null は「まだ選んでいない」**（既定に従う）。 */
  liveKind: LapLiveKind | null;
  /**
   * いま測っている計測の種類。計測開始（最初のタップ）で固め、記録が空になったら外す。
   * ★ 選んだ種類と分けるのは、選んでいない人の計測が、測っている途中で既定の切り替わり
   *   （MULTI_LIVE_SUSPENDED を戻すデプロイ）に引きずられないようにするため。
   */
  runKind: LapLiveKind | null;
}

export interface LapSegment {
  i: number;
  /** 区間の実時間(秒)。 */
  dur: number;
  /** この区間に入っていた周回数。 */
  n: number;
  /** 1周あたり(秒)。 */
  per: number;
  excluded: boolean;
  /** 除外の理由。中断由来か、手で外したか。 */
  reason: "break" | "manual" | null;
  /** 区間の終わり（＝タップした時刻）。 */
  at: number;
}

export interface LapStats {
  /** 集計に入った周回数。 */
  laps: number;
  /** 集計に入った実時間(秒)。 */
  sec: number;
  avg: number | null;
  /** 直近ぶんの平均。周回数が足りなければ null。 */
  recent: { avg: number; n: number } | null;
  /** 平均ラップ − 曲長。曲長が未設定なら null。 */
  overhead: number | null;
  runsPerHour: number | null;
  ptPerHour: number | null;
}

/** 直近平均に使う周回数。 */
export const RECENT_LAPS = 5;

/**
 * 「明らかに長すぎる区間」の判定倍率。
 * ★ 平均を基準にすると、汚染された平均が閾値ごと押し上げてしまい検出できない。
 *   曲長という**動かない値**に対する倍数で見る。
 */
export const HUGE_FACTOR = 3;

export const DEFAULT_SONG = {
  id: "074",
  title: "独りんぼエンヴィー",
  sec: 74.8,
};

export function initialState(): LapState {
  return {
    marks: [],
    laps: [],
    excluded: [],
    breaks: [],
    songId: DEFAULT_SONG.id,
    songTitle: DEFAULT_SONG.title,
    songSec: DEFAULT_SONG.sec,
    ptPerRun: 0,
    taki: 0,
    pausedAt: null,
    liveKind: null,
    runKind: null,
  };
}

/* ── 読み取り ────────────────────────────────────────────── */

export const isRunning = (s: LapState): boolean => s.marks.length > 0;
export const hugeCut = (s: LapState): number =>
  s.songSec > 0 ? s.songSec * HUGE_FACTOR : Infinity;

export function segments(s: LapState): LapSegment[] {
  const out: LapSegment[] = [];
  for (let i = 0; i < s.marks.length - 1; i++) {
    const dur = (s.marks[i + 1] - s.marks[i]) / 1000;
    const n = s.laps[i] || 1;
    const excluded = s.excluded.includes(i);
    out.push({
      i,
      dur,
      n,
      per: dur / n,
      excluded,
      reason: excluded ? (s.breaks.includes(i) ? "break" : "manual") : null,
      at: s.marks[i + 1],
    });
  }
  return out;
}

export function stats(s: LapState, recentCount = RECENT_LAPS): LapStats {
  const use = segments(s).filter((g) => !g.excluded);
  const laps = use.reduce((a, g) => a + g.n, 0);
  const sec = use.reduce((a, g) => a + g.dur, 0);
  const avg = laps > 0 ? sec / laps : null;

  // 直近ぶん。1区間に複数周が入っていることがあるので「区間」でなく「周」で数える。
  let need = recentCount;
  let d = 0;
  let n = 0;
  for (let k = use.length - 1; k >= 0 && need > 0; k--) {
    const take = Math.min(need, use[k].n);
    d += use[k].per * take;
    n += take;
    need -= take;
  }

  return {
    laps,
    sec,
    avg,
    recent: n >= 2 ? { avg: d / n, n } : null,
    overhead: avg != null && s.songSec > 0 ? avg - s.songSec : null,
    runsPerHour: avg != null && avg > 0 ? 3600 / avg : null,
    ptPerHour:
      avg != null && avg > 0 && s.ptPerRun > 0
        ? (3600 / avg) * s.ptPerRun
        : null,
  };
}

/** 長すぎる区間（休憩・部屋落ち・押し忘れの疑い）。除外済みは含めない。 */
export function suspects(s: LapState): LapSegment[] {
  const cut = hugeCut(s);
  return segments(s).filter((g) => !g.excluded && g.per > cut);
}

/* ── 状態遷移（すべて新しいオブジェクトを返す） ──────────────── */

/** 二度押しを弾く間隔(ms)。ラップは分単位なので実害が無い。 */
export const DOUBLE_TAP_MS = 400;

/** 計測開始・1周ぶんの記録。どちらも「マークを1つ打つ」で同じ。 */
export function tap(s: LapState, now: number): LapState {
  if (s.pausedAt != null) return s;
  const last = s.marks[s.marks.length - 1];
  if (last != null && now - last < DOUBLE_TAP_MS) return s;
  return {
    ...s,
    marks: [...s.marks, now],
    laps: s.marks.length ? [...s.laps, 1] : s.laps,
    // 計測開始の 1 押しで、この計測の種類を固める
    runKind: s.marks.length ? s.runKind : liveKindOf(s),
  };
}

/** 種類を選ぶ。**計測中・中断中は変えない**（測っている途中で比べる既定と記録の種類が変わるため）。 */
export function setLiveKind(s: LapState, kind: LapLiveKind): LapState {
  if (isRunning(s)) return s;
  return { ...s, liveKind: kind };
}

export function pause(s: LapState, now: number): LapState {
  if (!isRunning(s) || s.pausedAt != null) return s;
  return { ...s, pausedAt: now };
}

/**
 * 再開。**中断をまたいだ区間はここで自動的に除外する。**
 * 中断中に進んだ時計は1周ぶんではないので、混ぜると平均が壊れる。
 */
export function resume(s: LapState, now: number): LapState {
  if (s.pausedAt == null) return s;
  const i = s.marks.length - 1; // 新しく作る区間の index
  return {
    ...s,
    marks: [...s.marks, now],
    laps: [...s.laps, 1],
    excluded: [...s.excluded, i],
    breaks: [...s.breaks, i],
    pausedAt: null,
  };
}

/** 1つ戻す。中断中は押せない前提だが、来ても壊れないようにしておく。 */
export function undo(s: LapState): LapState {
  if (!s.marks.length) return s;
  const marks = s.marks.slice(0, -1);
  const laps = s.laps.slice(0, Math.max(0, marks.length - 1));
  const keep = (i: number) => i < marks.length - 1;
  return {
    ...s,
    marks,
    laps,
    excluded: s.excluded.filter(keep),
    breaks: s.breaks.filter(keep),
    pausedAt: null,
    runKind: marks.length ? s.runKind : null,
  };
}

export function toggleExclude(s: LapState, i: number): LapState {
  if (i < 0 || i >= s.marks.length - 1) return s;
  if (s.excluded.includes(i)) {
    return {
      ...s,
      excluded: s.excluded.filter((x) => x !== i),
      breaks: s.breaks.filter((x) => x !== i),
    };
  }
  return { ...s, excluded: [...s.excluded, i] };
}

/** 区間の周回数を増減する（押し忘れの後始末）。1未満にはしない。 */
export function setLapCount(s: LapState, i: number, n: number): LapState {
  if (i < 0 || i >= s.marks.length - 1) return s;
  const laps = s.laps.slice();
  laps[i] = Math.max(1, Math.round(n));
  return { ...s, laps };
}

/** 記録だけ消す。曲・単価・選んだ種類などの設定は残す（次の計測でも同じ設定を使うため）。 */
export function clearRecords(s: LapState): LapState {
  return {
    ...s,
    marks: [],
    laps: [],
    excluded: [],
    breaks: [],
    pausedAt: null,
    runKind: null,
  };
}

/* ── 保存データの検証 ───────────────────────────────────────── */

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * localStorage から読んだものを整える。
 *
 * ★ **壊れた保存をそのまま通すと NaN が統計に混ざる。**
 *   数字は出るのに間違っている、という一番たちの悪い壊れ方をするので、
 *   ここで形と型を弾く。読めない部分は捨てて、読める部分だけ生かす。
 */
export function normalize(raw: unknown): LapState {
  const base = initialState();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Record<string, unknown>;

  // 時刻は昇順でなければ区間の長さが負になる。並びが壊れていたら記録ごと捨てる。
  let marks = Array.isArray(v.marks) ? v.marks.filter(isNum) : [];
  for (let i = 1; i < marks.length; i++) {
    if (marks[i] <= marks[i - 1]) {
      marks = [];
      break;
    }
  }
  const segCount = Math.max(0, marks.length - 1);
  const rawLaps = Array.isArray(v.laps) ? v.laps : [];
  const laps = Array.from({ length: segCount }, (_, i) => {
    const n = Number(rawLaps[i]);
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
  });
  const idx = (arr: unknown): number[] =>
    Array.isArray(arr)
      ? [
          ...new Set(
            arr
              .map(Number)
              .filter((i) => Number.isInteger(i) && i >= 0 && i < segCount),
          ),
        ]
      : [];
  const excluded = idx(v.excluded);
  // break は必ず excluded の部分集合。片方だけ残っていると表示だけ食い違う。
  const breaks = idx(v.breaks).filter((i) => excluded.includes(i));

  const songSec = Number(v.songSec);
  const ptPerRun = Number(v.ptPerRun);
  const taki = Number(v.taki);
  const pausedAt = Number(v.pausedAt);

  return {
    marks,
    laps,
    excluded,
    breaks,
    songId: typeof v.songId === "string" && v.songId ? v.songId : null,
    songTitle: typeof v.songTitle === "string" ? v.songTitle : "",
    songSec:
      Number.isFinite(songSec) && songSec >= 10 && songSec <= 600
        ? songSec
        : base.songSec,
    ptPerRun:
      Number.isFinite(ptPerRun) && ptPerRun >= 0 ? Math.round(ptPerRun) : 0,
    taki:
      Number.isFinite(taki) && taki >= 0 && taki <= 10 ? Math.round(taki) : 0,
    // 中断は最後のマークより後でなければ辻褄が合わない。
    pausedAt:
      Number.isFinite(pausedAt) &&
      marks.length > 0 &&
      pausedAt >= marks[marks.length - 1]
        ? pausedAt
        : null,
    // ★ 種類を持たない古い保存は「未選択」。既定（期間中はひとりでライブ）をここで埋めない。
    liveKind: isLiveKind(v.liveKind) ? v.liveKind : null,
    // ★ 種類を持たないのに測っている保存は、この機能より前（みんなでライブ決め打ち）に始めた計測。
    runKind: marks.length ? (isLiveKind(v.runKind) ? v.runKind : "multi") : null,
  };
}

/* ── 書き出し ───────────────────────────────────────────── */

const round1 = (n: number) => Math.round(n * 10) / 10;

export function exportObj(s: LapState): Record<string, unknown> {
  const st = stats(s);
  return {
    liveKind: liveKindOf(s),
    song: s.songTitle || null,
    songId: s.songId,
    songSec: s.songSec,
    taki: s.taki || null,
    ptPerRun: s.ptPerRun || null,
    startedAt: s.marks.length ? new Date(s.marks[0]).toISOString() : null,
    endedAt: s.marks.length
      ? new Date(s.marks[s.marks.length - 1]).toISOString()
      : null,
    totalLaps: st.laps,
    measuredSec: round1(st.sec),
    avgLapSec: st.avg != null ? round1(st.avg) : null,
    overheadSec: st.overhead != null ? round1(st.overhead) : null,
    runsPerHour:
      st.runsPerHour != null ? Math.round(st.runsPerHour * 100) / 100 : null,
    ptPerHour: st.ptPerHour != null ? Math.round(st.ptPerHour) : null,
    marks: s.marks.map((m) => new Date(m).toISOString()),
    lapsPerSegment: s.laps.slice(0, Math.max(0, s.marks.length - 1)),
    excludedSegments: s.excluded.slice().sort((a, b) => a - b),
  };
}

/* ── 1回の計測を「記録」として閉じる ────────────────────────── */

/**
 * 終了して保存した1回ぶんの計測。
 *
 * ★ 集計値と**生のマーク列の両方**を持つ。集計値だけだと後から「押し忘れを直す」
 *   ことができず、生データだけだと一覧に何も出せない。どちらか一方では足りない。
 */
export interface LapRun {
  id: string;
  /** 保存した時刻(ms)。一覧の並びに使う。 */
  savedAt: number;
  /** 計測を始めた時刻＝最初のタップ。 */
  startedAt: number;
  /**
   * 計測を終えた時刻＝**最後のタップ**。
   * ★ 「終了」を押した時刻ではない。最後の1周が終わってから終了を押すまでの間は
   *   測っていないので、それを含めると記録の長さが実際より延びる。
   */
  endedAt: number;
  /**
   * 測ったライブの種類。2026-11-18 から記録する。
   * ★ それより前の記録は持たない。読むときにみんなでライブとして埋める（runs.ts の loadRuns）。
   */
  liveKind: LapLiveKind;
  songId: string | null;
  songTitle: string;
  songSec: number;
  taki: number;
  ptPerRun: number;
  /** 集計（除外した区間は入っていない）。 */
  laps: number;
  measuredSec: number;
  avgSec: number | null;
  overheadSec: number | null;
  runsPerHour: number | null;
  ptPerHour: number | null;
  /** 生の記録。 */
  marks: number[];
  lapsPerSegment: number[];
  excluded: number[];
  breaks: number[];
}

/**
 * いまの計測を記録に変換する。**区間が1つも無ければ null**
 *（開始しただけ・すぐ終了した、は記録として残す値が無い）。
 */
export function toRun(s: LapState, id: string, savedAt: number): LapRun | null {
  if (s.marks.length < 2) return null;
  const st = stats(s);
  return {
    id,
    savedAt,
    startedAt: s.marks[0],
    endedAt: s.marks[s.marks.length - 1],
    liveKind: liveKindOf(s),
    songId: s.songId,
    songTitle: s.songTitle,
    songSec: s.songSec,
    taki: s.taki,
    ptPerRun: s.ptPerRun,
    laps: st.laps,
    measuredSec: round1(st.sec),
    avgSec: st.avg != null ? round1(st.avg) : null,
    overheadSec: st.overhead != null ? round1(st.overhead) : null,
    runsPerHour: st.runsPerHour != null ? Math.round(st.runsPerHour * 100) / 100 : null,
    ptPerHour: st.ptPerHour != null ? Math.round(st.ptPerHour) : null,
    marks: s.marks.slice(),
    lapsPerSegment: s.laps.slice(0, s.marks.length - 1),
    excluded: s.excluded.slice().sort((a, b) => a - b),
    breaks: s.breaks.slice().sort((a, b) => a - b),
  };
}

/** 書き出し用。時刻を人が読める形に直したもの。 */
export function runToExport(r: LapRun): Record<string, unknown> {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    startedAt: iso(r.startedAt),
    endedAt: iso(r.endedAt),
    savedAt: iso(r.savedAt),
    liveKind: r.liveKind,
    song: r.songTitle || null,
    songId: r.songId,
    songSec: r.songSec,
    taki: r.taki || null,
    ptPerRun: r.ptPerRun || null,
    totalLaps: r.laps,
    measuredSec: r.measuredSec,
    avgLapSec: r.avgSec,
    overheadSec: r.overheadSec,
    runsPerHour: r.runsPerHour,
    ptPerHour: r.ptPerHour,
    marks: r.marks.map(iso),
    lapsPerSegment: r.lapsPerSegment,
    excludedSegments: r.excluded,
    breakSegments: r.breaks,
  };
}
