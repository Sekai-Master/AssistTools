import { useMemo, useState, type CSSProperties } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Switch } from "../../components/ui/Switch";
// ライボの自然回復の規則は稼働時間計算が正本。定数を2箇所に持たない。
import { LB_REGEN_MIN } from "../worktime/lib/worktime";
import { TakiInput } from "../../components/ui/TakiInput";
import {
  useRankingMusics,
  DIFFICULTY_ORDER,
  DIFFICULTY_LABEL,
  DIFFICULTY_COLOR,
  type Difficulty,
} from "./useRankingMusics";
import {
  rankSongs,
  rankSongsInWindow,
  multiEffectiveSkill,
  DEFAULT_OVERHEAD_SEC,
  DEFAULT_PARAMS,
  type RankingMode,
  type EfficiencyParams,
} from "./lib/efficiency";
import { ProfileBar, SaveToProfile } from "../../components/ui/ProfileBar";
import {
  lbNeededForPlays,
  PASS_LABEL,
  PASS_LIMITS,
  playsUntilEmpty,
  type PassCourse,
} from "./lib/lbRun";
import { numOrUndef } from "../../lib/num";
import { Delta } from "../../components/ui/Delta";
import { useFlip } from "../../lib/useFlip";
import { resolvePlan } from "../../motion/plan";
import { useMotionSetting } from "../../motion/settingsStore";
import { useReducedMotion, useTouchOnly } from "../../motion/environment";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;
const STORE_KEY = "sekai-master:ranking-inputs";
const STORE_VERSION = 2;
const ROW_LIMIT = 50;

const MODE_OPTIONS: { value: RankingMode; label: string }[] = [
  { value: "manual", label: "手動周回" },
  { value: "auto", label: "オート周回" },
  { value: "challenge", label: "チャレライ" },
];

/** タブごとに「どのライブの・何を最大化しているか」を明示する。混同すると最適解が真逆になる。 */
const MODE_NOTE: Record<
  RankingMode,
  { headline: string; body: string; metricLabel: string; skillHint: string }
> = {
  manual: {
    headline: "協力ライブ・時間あたりのイベントポイント",
    body: "手で叩くので律速は時間。短い曲ほど有利になります。フィーバー込みの協力ライブの式で計算しています。",
    metricLabel: "Pt/時",
    skillHint:
      "協力ライブは1曲のなかで6回スキルが発動します（参加5人が1回ずつ＋アンコール1回）。各発動で乗るのが実効値です。強い人を呼ぶと単価が上がるのは、イベントポイントの式に他4人の合計スコアが入るからで、曲の順位そのものは部屋の顔ぶれでは変わりません。",
  },
  auto: {
    headline: "オート・1プレイあたりのイベントポイント",
    body: "放置するので時間はコストになりません。律速はライブボーナスなので、1回で多く稼げる長尺・高基礎点の曲が有利です。手動とは最適解が逆になります。",
    metricLabel: "Pt/回",
    skillHint:
      "ソロは1曲のなかで6回スキルが発動します（編成5枚が1回ずつ＋最後にリーダーがもう1回）。1〜5回目の発動順は選べないので、5枚は内部値÷5の平均で計算し、6回目だけリーダーの値を当てています。",
  },
  challenge: {
    headline: "チャレンジライブ・1プレイあたりのスコア",
    body: "1日1回なので時間もライボも関係ありません。イベント基礎点も無関係で、純粋にスコアだけを見ます。",
    metricLabel: "スコア",
    skillHint:
      "ソロは1曲のなかで6回スキルが発動します（編成5枚が1回ずつ＋最後にリーダーがもう1回）。1〜5回目の発動順は選べないので、5枚は内部値÷5の平均で計算し、6回目だけリーダーの値を当てています。",
  },
};

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");
/** ボーナスは 0.5% 刻みを取りうるので小数を許す。小数点は1つまで。 */
const decimalInput = (v: string) => v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const fmt = (n: number) => Math.round(n).toLocaleString("ja-JP");
const ALL_DIFFS = new Set<Difficulty>(DIFFICULTY_ORDER);

/** 秒を「◯時間◯分」に。周回計画は分単位で足りる。 */
function hhmm(totalSec: number): string {
  const m = Math.round(totalSec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}時間${String(m % 60).padStart(2, "0")}分` : `${m}分`;
}

/** 譜面レベルの取りうる範囲。上限が伸びてもフィルタが取りこぼさないよう広めに取る。 */
/**
 * 譜面レベルの取りうる範囲。
 *
 * ★ 固定値ではなく実データから出す。1〜40 と決め打ちしていたが、実際に存在するのは
 *   5〜38 で、両端に「選べるのに1曲も無い」レベルがぶら下がっていた。
 *   新しい譜面で上限が伸びても自動で追随する。
 */
function levelBounds(entries: { playLevel?: number | null }[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const e of entries) {
    if (typeof e.playLevel !== "number") continue;
    if (e.playLevel < min) min = e.playLevel;
    if (e.playLevel > max) max = e.playLevel;
  }
  // データが読めていないあいだの見た目が壊れないよう、素直な既定へ落とす。
  return Number.isFinite(min) ? { min, max } : { min: 1, max: 40 };
}

interface Stored {
  v?: number;
  custom?: boolean;
  power?: string;
  bonus?: string;
  taki?: number;
  skillLeader?: string;
  skillTotal?: string;
  overhead?: string;
  plays?: string;
  lvMin?: number;
  lvMax?: number;
  /** 換算に使う曲（`musicId-difficulty`）。未指定なら1位。 */
  pick?: string;
  /** ライボの自然回復を差し引くか。 */
  regen?: boolean;
  /** オートの入口。ゲームの設定と同じ2択。 */
  autoFrom?: "lb" | "plays" | "window";
  /** 「残り時間で区切る」で使う残り分数。 */
  windowMin?: string;
  /** 足りないライボを石・ドリンクで注ぎ足す前提にするか。 */
  refill?: boolean;
  /** いま持っているライブボーナス。 */
  startLB?: string;
  /** カラフルパスの course（ライボ上限とオート回数が決まる）。 */
  pass?: PassCourse;
  /** 今日まだ残っているオートの回数。 */
  autoLeft?: string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/**
 * 保存済み入力の読み出し。localStorage は旧バージョンの自分や手書きに汚染されうるので、
 * バージョンと型を見てから使う。特に taki は倍率表の添字になるため、範囲外だと
 * 倍率1に落ちて Pt が 1/25 で表示される（無言で桁が狂う）。
 */
function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const s = o as Record<string, unknown>;
    if (s.v !== STORE_VERSION) return {};
    const taki =
      typeof s.taki === "number" && Number.isInteger(s.taki) && s.taki >= 0 && s.taki <= 10
        ? s.taki
        : undefined;
    const lv = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99
        ? v
        : undefined;
    return {
      v: STORE_VERSION,
      custom: typeof s.custom === "boolean" ? s.custom : undefined,
      power: str(s.power),
      bonus: str(s.bonus),
      taki,
      skillLeader: str(s.skillLeader),
      skillTotal: str(s.skillTotal),
      overhead: str(s.overhead),
      plays: str(s.plays),
      lvMin: lv(s.lvMin),
      lvMax: lv(s.lvMax),
      pick: str(s.pick),
      regen: typeof s.regen === "boolean" ? s.regen : undefined,
      autoFrom:
        s.autoFrom === "lb" || s.autoFrom === "plays" || s.autoFrom === "window"
          ? s.autoFrom
          : undefined,
      windowMin: str(s.windowMin),
      refill: typeof s.refill === "boolean" ? s.refill : undefined,
      startLB: str(s.startLB),
      pass:
        s.pass === "none" || s.pass === "deluxe" || s.pass === "precious" ? s.pass : undefined,
      autoLeft: str(s.autoLeft),
    };
  } catch {
    return {};
  }
}

/** 難易度の色付きバッジ。表の中で難易度を見分けるための主要な手がかり。 */
function DifficultyBadge({ difficulty, level }: { difficulty: string; level: number | null }) {
  const key = difficulty as Difficulty;
  const color = DIFFICULTY_COLOR[key];
  if (!color) return <span className="text-xs text-slate-400">{difficulty}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
        style={{ backgroundColor: color, textShadow: "0 1px 1px rgba(0,0,0,.3)" }}
      >
        {DIFFICULTY_LABEL[key]}
      </span>
      {level != null && (
        <span className="text-xs font-bold tabular-nums" style={{ color }}>
          {level}
        </span>
      )}
    </span>
  );
}

/** クリックで開く補足。用語の説明を本文に混ぜず、知っている人の邪魔をしない。 */
function InfoNote({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-neu text-[10px] font-bold text-slate-500 shadow-neu-sm neu-tactile"
        title={label}
      >
        ?
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-neu p-3 text-xs leading-relaxed text-slate-500 shadow-neu-inset">
          {children}
        </div>
      )}
    </>
  );
}

/** 譜面レベルの小さな数値入力。±で1ずつ動かせる。 */
function LevelInput({
  value,
  onChange,
  label,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min: number;
  max: number;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const btn =
    "neu-raised neu-tactile flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        aria-label={`${label}を下げる`}
      >
        −
      </button>
      <input
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(clamp(Math.floor(Number(e.target.value) || min)))}
        className="w-10 rounded-lg bg-neu px-1 py-1 text-center tabular-nums text-slate-800 shadow-neu-inset outline-none"
        aria-label={`譜面レベルの${label}`}
      />
      <button
        type="button"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label={`${label}を上げる`}
      >
        ＋
      </button>
    </span>
  );
}

/**
 * 数値ひとつぶんの見出し＋値。オート周回のまとめで並べる。
 * delta に生の数値を渡すと、前回からの変化量を一瞬だけ脇に出す。
 */
function Stat({
  label,
  value,
  sub,
  delta,
  formatDelta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  formatDelta?: (n: number) => string;
}) {
  return (
    <div className="rounded-xl bg-neu p-3 shadow-neu-inset">
      <div className="text-[11px] font-bold text-slate-500">
        {label}
        {delta !== undefined && <Delta value={delta} format={formatDelta} />}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-700">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

/**
 * いまから次の 4:00 までの分数。
 * ★ **オートの回数は毎日4:00に消える**（lbRun.ts の規則3）。「残り時間」の既定値は
 *   ここに合わせるのが実際の使い方に一番近い。手で上書きできる。
 */
function minutesUntilReset(now: Date = new Date()): number {
  const reset = new Date(now);
  reset.setHours(4, 0, 0, 0);
  if (reset <= now) reset.setDate(reset.getDate() + 1);
  return Math.max(1, Math.round((reset.getTime() - now.getTime()) / 60000));
}

/** 窓モードの行に付く値（rankSongsInWindow の返り値）。 */
type WindowRow = { plays: number; limitedBy: "lb" | "plays" | "time" | "none" };

/** 窓モードの行だけが持つ値を安全に取り出す（通常モードの行には無い）。 */
function windowInfo(row: unknown): WindowRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<WindowRow>;
  return typeof r.plays === "number" && typeof r.limitedBy === "string"
    ? { plays: r.plays, limitedBy: r.limitedBy }
    : null;
}

/** 何で止まるか。**次に効く手が違う**ので、言葉で書く。 */
const LIMIT_LABEL: Record<WindowRow["limitedBy"], string> = {
  time: "時間切れ",
  lb: "ライボ切れ",
  plays: "回数上限",
  none: "止まらず",
};

export default function EfficiencyRanking() {
  const { entries, loading, error } = useRankingMusics();
  const stored = useMemo(() => loadStored(), []);

  const [mode, setMode] = useState<RankingMode>("manual");
  const [diffs, setDiffs] = useState<Set<Difficulty>>(() => new Set(ALL_DIFFS));

  // 既定は「入力なしで一般的な順位を見る」。自分の条件で計算したい人だけスイッチを入れる。
  const [custom, setCustom] = useState(stored.custom ?? false);
  const [power, setPower] = useState(stored.power ?? String(DEFAULT_PARAMS.power));
  const [bonus, setBonus] = useState(stored.bonus ?? String(DEFAULT_PARAMS.bonus));
  const [taki, setTaki] = useState(stored.taki ?? DEFAULT_PARAMS.taki);
  const [skillLeader, setSkillLeader] = useState(
    stored.skillLeader ?? String(DEFAULT_PARAMS.skillLeader),
  );
  const [skillTotal, setSkillTotal] = useState(
    stored.skillTotal ?? String(DEFAULT_PARAMS.skillTotal),
  );
  // 既定はモードで違う（オートはリザルト送りを詰められないぶん長い）。
  const [overhead, setOverhead] = useState(stored.overhead ?? String(DEFAULT_OVERHEAD_SEC.manual));
  const [plays, setPlays] = useState(stored.plays ?? "100");
  // 未保存なら「全部」= データの両端。読み込み前は 0/99 にして誰も弾かない。
  const [lvMin, setLvMin] = useState(stored.lvMin ?? 0);
  const [lvMax, setLvMax] = useState(stored.lvMax ?? 99);

  // 入力は毎回同じものを打ち直させない。次回開いたときの初期値にする。
  const persist = (patch: Stored) => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ ...loadStored(), ...patch, v: STORE_VERSION }),
      );
    } catch {
      /* プライベートモード等で書けなくても機能は落とさない */
    }
  };

  const params: EfficiencyParams = useMemo(() => {
    // 焚き数だけは custom を切っていても効かせる。オートのまとめで直接いじる値なので、
    // 「表の焚き数」と「まとめの焚き数」が食い違うと必ず誤読される。
    // ★ ロスの既定はモード別。オートを手動と同じ 20 秒で計算すると、
    //   1曲あたり13秒ぶん速く見積もってしまう（99回で20分以上ずれる）。
    if (!custom) return { ...DEFAULT_PARAMS, taki, overheadSec: DEFAULT_OVERHEAD_SEC[mode] };
    return {
      power: Number(power) || 0,
      bonus: Number(bonus) || 0,
      taki,
      skillLeader: Number(skillLeader) || 0,
      skillTotal: Number(skillTotal) || 0,
      overheadSec: Number(overhead) || 0,
    };
  }, [custom, mode, power, bonus, taki, skillLeader, skillTotal, overhead]);

  /**
   * モードを切り替える。
   *
   * ★ ロスは**まだ触っていないときだけ**新しいモードの既定へ差し替える。
   *   手で入れた値を黙って書き換えると、戻したつもりの数字が変わっていて気付けない。
   *   「触っていない」の判定は「いまのモードの既定値と同じか」で十分（実測値が
   *   たまたま既定と一致していた場合は差し替わるが、そのときも表示は正しい）。
   */
  const changeMode = (next: RankingMode) => {
    setOverhead((cur) =>
      Number(cur) === DEFAULT_OVERHEAD_SEC[mode] ? String(DEFAULT_OVERHEAD_SEC[next]) : cur
    );
    setMode(next);
  };

  // 選べるレベルは実データの範囲に合わせる（決め打ちの 1〜40 だと両端が空になる）。
  const levels = useMemo(() => levelBounds(entries), [entries]);
  // 入力の前後がひっくり返っていても素直に受ける（下限>上限で空表にしない）。
  const [loLv, hiLv] = lvMin <= lvMax ? [lvMin, lvMax] : [lvMax, lvMin];
  const levelFiltered = loLv > levels.min || hiLv < levels.max;

  /**
   * ライボの自然回復（30分に1）を消費から差し引くか。
   * ★ 定数は稼働時間計算から借りる。同じ規則を2箇所に書くと必ず片方だけ古くなる。
   */
  const [regen, setRegen] = useState(stored.regen ?? false);
  const [startLB, setStartLB] = useState(stored.startLB ?? "25");
  const [pass, setPass] = useState<PassCourse>(stored.pass ?? "none");
  const limits = PASS_LIMITS[pass];
  const [autoLeft, setAutoLeft] = useState(stored.autoLeft ?? String(PASS_LIMITS[stored.pass ?? "none"].autoPlays));

  /**
   * ★ 「残り時間で区切る」に必要な入力は、**表より前**に宣言しておく。
   *   表の並び順がこれで変わるので、下のパネルの state を参照させると
   *   宣言順で詰まる（const は巻き上がらない）。
   */
  const [autoFrom, setAutoFrom] = useState<"lb" | "plays" | "window">(stored.autoFrom ?? "lb");
  /** 残り時間（分）。既定は「いまから次の4:00まで」＝オート回数が消えるまで。 */
  const [windowMin, setWindowMin] = useState(stored.windowMin ?? String(minutesUntilReset()));
  /**
   * ライボが足りなくなったら石・ドリンクで注ぎ足す前提にするか。
   * ★ **これで答えが正反対になる**（注ぎ足さない＝長尺有利／注ぎ足す＝短尺有利）ので、
   *   既定は「注ぎ足さない」＝手持ちで走る、にしておく。
   */
  const [refill, setRefill] = useState(stored.refill ?? false);

  const ranked = useMemo(() => {
    if (diffs.size === 0) return [];
    const filtered = entries.filter(
      (e) =>
        diffs.has(e.difficulty as Difficulty) &&
        // Lv が不明な譜面は、範囲を絞っているときだけ落とす
        (e.playLevel == null ? !levelFiltered : e.playLevel >= loLv && e.playLevel <= hiLv),
    );
    // 「残り時間で区切る」ときだけ、合計Ptで並べ替える（別の指標になる）。
    if (mode === "auto" && autoFrom === "window") {
      const win = Math.max(0, Number(windowMin) || 0) * 60;
      return rankSongsInWindow(filtered, params, {
        windowSec: win,
        startLB: Number(startLB) || 0,
        lbCap: PASS_LIMITS[pass].lbCap,
        maxPlays: Number(autoLeft) || 0,
        regen,
        refill,
      }).slice(0, ROW_LIMIT);
    }
    return rankSongs(filtered, params, mode).slice(0, ROW_LIMIT);
  }, [
    entries,
    params,
    mode,
    diffs,
    loLv,
    hiLv,
    levelFiltered,
    autoFrom,
    windowMin,
    startLB,
    pass,
    autoLeft,
    regen,
    refill,
  ]);

  const toggleDiff = (d: Difficulty) =>
    setDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  /** 表が「この時間内の合計Pt」で並んでいるか。 */
  const isWindow = mode === "auto" && autoFrom === "window";
  const note = MODE_NOTE[mode];
  const playCount = Number(plays) || 0;
  const osReduce = useReducedMotion();
  const motionLevel = resolvePlan(useMotionSetting(), {
    osReduce,
    touchOnly: useTouchOnly(),
  }).level;
  /**
   * 換算に使う曲。**1位に固定していた**が、譜面の得手不得手があるので選べるようにした
   * （1位が苦手曲なら、その回数は現実の予定にならない）。
   * 選んだ曲が絞り込みから外れたら黙って1位へ戻す ── 消えた曲の数字を出し続けるより良い。
   */
  const [pickKey, setPickKey] = useState(stored.pick ?? "");
  const keyOf = (r: { musicId: string; difficulty: string }) => `${r.musicId}-${r.difficulty}`;
  const best = ranked.find((r) => keyOf(r) === pickKey) ?? ranked[0];

  /**
   * 今日まだ残っているオートの回数。
   * ★ パスの上限そのものではない。**すでに何回か消化していれば残りは減る**ので、
   *   上限を決め打ちすると「まわせる回数」を多く見積もる（Nori 指摘 2026-08-12）。
   */

  /**
   * パスを変えたときは、**まだ触っていない場合だけ**残り回数を新しい上限へ合わせる。
   * 手で入れた値を黙って書き換えると、戻したつもりの数字が変わっていて気付けない。
   */
  const changePass = (next: PassCourse) => {
    setAutoLeft((cur) =>
      Number(cur) === limits.autoPlays ? String(PASS_LIMITS[next].autoPlays) : cur
    );
    setPass(next);
    persist({ pass: next });
  };

  /**
   * オートの2つの入口ぶんの計算。**曲が決まらないと1周の秒数が出ない**ので、
   * best を待ってから走らせる（未確定のあいだは 0 のまま）。
   */
  const cycleSec = best?.cycleSec ?? 0;
  const lbRun = playsUntilEmpty({
    startLB: Number(startLB) || 0,
    taki,
    cycleSec,
    regen,
    lbCap: limits.lbCap,
    maxPlays: Math.max(0, Number(autoLeft) || 0),
  });
  const lbNeed = lbNeededForPlays({
    startLB: Number(startLB) || 0,
    taki,
    plays: playCount,
    cycleSec,
    regen,
    lbCap: limits.lbCap,
  });

  // 並び替えを目で追わせる。演出オフの人と OS の視差軽減には出さない
  //（動き自体が情報なので控えめでは出す）。
  const rowRef = useFlip(
    ranked.map((r) => `${r.musicId}-${r.difficulty}`),
    { enabled: motionLevel !== "off" && !osReduce }
  );

  return (
    <ToolPage morphKey="tool:ranking" unit="ln" title="効率曲ランキング" icon="leaderboard" wide>
      {/* このツールが使う値は編成そのもの（総合力・ボーナス・内部値・焚き数）。 */}
      <ProfileBar
        apply={(p) => {
          if (p.power != null) setPower(String(p.power));
          if (p.bonus != null) setBonus(String(p.bonus));
          if (p.skillLeader != null) setSkillLeader(String(p.skillLeader));
          if (p.skillTotal != null) setSkillTotal(String(p.skillTotal));
          if (p.taki != null) setTaki(p.taki);
          setCustom(true);
        }}
      />
      <Panel>
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={changeMode} />
        <p className="mt-4 text-sm font-bold text-slate-600">{note.headline}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{note.body}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold text-slate-500">難易度</span>
          {DIFFICULTY_ORDER.map((d) => (
            <NeuButton
              key={d}
              active={diffs.has(d)}
              onClick={() => toggleDiff(d)}
              className="px-3 py-1.5 text-xs"
              style={
                diffs.has(d) ? ({ "--unit-color": DIFFICULTY_COLOR[d] } as CSSProperties) : undefined
              }
            >
              {DIFFICULTY_LABEL[d]}
            </NeuButton>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-300/70" aria-hidden />
          <NeuButton className="px-3 py-1.5 text-xs" onClick={() => setDiffs(new Set(ALL_DIFFS))}>
            すべて
          </NeuButton>
          <NeuButton className="px-3 py-1.5 text-xs" onClick={() => setDiffs(new Set())}>
            選択を外す
          </NeuButton>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="mr-1 font-bold text-slate-500">譜面レベル</span>
          <LevelInput
            value={lvMin}
            onChange={(v) => {
              setLvMin(v);
              persist({ lvMin: v });
            }}
            label="下限"
            min={levels.min}
            max={levels.max}
          />
          <span className="text-slate-400">〜</span>
          <LevelInput
            value={lvMax}
            onChange={(v) => {
              setLvMax(v);
              persist({ lvMax: v });
            }}
            label="上限"
            min={levels.min}
            max={levels.max}
          />
          {levelFiltered && (
            <NeuButton
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                setLvMin(levels.min);
                setLvMax(levels.max);
                persist({ lvMin: levels.min, lvMax: levels.max });
              }}
            >
              解除
            </NeuButton>
          )}
          <span className="text-slate-400">
            叩けるレベルに絞ると、AP前提の理論値が実際の選曲に近づきます
          </span>
        </div>
      </Panel>

      {/*
       * ★ 読み込み中は高さを予約する（min-height）。
       *   ここはページ最後のパネルで、読み込み中は中身が1行しか無いため
       *   **フッターが画面内に見えている**。そこへ50行の表が生えると
       *   フッターが画面の高さぶん一気に下がり、**CLS 0.37（判定「悪い」）**
       *   になっていた（2026-08-10 実測）。画面1つぶん確保しておけば、
       *   表が現れても動くのは画面外の要素だけになり、CLS に計上されない。
       *   ★ 表の高さは選択条件で変わるので、正確に一致させることはできない。
       *     狙いは「一致させる」ことではなく「動きを画面の外に追い出す」こと。
       */}
      <Panel
        title={
          isWindow
            ? `ランキング（残り${Math.max(0, Number(windowMin) || 0)}分で稼げる合計Pt順・上位${ranked.length}件）`
            : `ランキング（上位${ranked.length}件）`
        }
      >
        <div className={loading ? "min-h-[80vh]" : undefined}>
        {loading && <p className="text-sm text-slate-500">楽曲データを読み込んでいます…</p>}
        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
        {!loading && !error && ranked.length === 0 && (
          <p className="text-sm text-slate-500">
            {diffs.size === 0 ? "難易度を1つ以上選んでください。" : "条件に合う楽曲がありません。"}
          </p>
        )}

        {ranked.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-2 py-2 font-bold">#</th>
                  <th className="px-2 py-2 font-bold">楽曲</th>
                  <th className="px-2 py-2 font-bold">難易度</th>
                  <th className="px-2 py-2 text-right font-bold">指数</th>
                  {custom && <th className="px-2 py-2 text-right font-bold">{note.metricLabel}</th>}
                  <th className="px-2 py-2 text-right font-bold">曲長</th>
                  <th className="px-2 py-2 text-right font-bold">ノーツ</th>
                  <th className="px-2 py-2 text-right font-bold">
                    {mode === "challenge" ? "スコア率" : "基礎点"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr
                    key={`${r.musicId}-${r.difficulty}`}
                    // 条件を変えると順位が総入れ替えになる。行が実際に動いて見えないと
                    // 「さっき見ていた曲がどこへ行ったか」が追えない。
                    ref={rowRef(`${r.musicId}-${r.difficulty}`)}
                    className="border-t border-slate-200/60">
                    <td className="px-2 py-2 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={`${JACKET_BASE}${r.jacketLink}`}
                          alt=""
                          loading="lazy"
                          className="h-8 w-8 shrink-0 rounded"
                        />
                        <span className="min-w-0 truncate font-bold text-slate-700">{r.title}</span>
                      </div>
                      {/*
                       * ★ 何で止まるかは曲ごとに変わる（短い曲は時間、長い曲はライボ）。
                       *   これを出さないと「なぜこの曲が上なのか」が読めない。
                       */}
                      {(() => {
                        const w = isWindow ? windowInfo(r) : null;
                        if (!w) return null;
                        return (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                            <span className="tabular-nums">{w.plays} 回</span>
                            <span className="rounded bg-neu px-1 py-0.5 shadow-neu-inset">
                              {LIMIT_LABEL[w.limitedBy]}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <DifficultyBadge difficulty={r.difficulty} level={r.playLevel} />
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums text-slate-700">
                      {r.index.toFixed(1)}
                    </td>
                    {custom && (
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                        {fmt(r.metric)}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                      {r.musicTime != null ? `${r.musicTime.toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                      {r.noteCount ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                      {mode === "challenge"
                        ? (r.baseScore?.toFixed(3) ?? "—")
                        : (r.eventRate ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ranked.length > 0 && (
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            <span className="font-bold text-slate-600">指数</span>は1位を100とした相対値です。
            {custom ? (
              <>下の条件で計算しています。</>
            ) : (
              <>
                {DEFAULT_PARAMS.skillLeader}/{DEFAULT_PARAMS.skillTotal}/
                {(DEFAULT_PARAMS.power / 10000).toFixed(1)}
                {mode !== "challenge" && `／ボーナス ${DEFAULT_PARAMS.bonus}%／${taki}焚き`}
                {mode !== "challenge" && `／ロス ${DEFAULT_OVERHEAD_SEC[mode]}秒`}
                {" を前提にした一般的な順位です。"}
                自分の条件に差し替えるには下の「自分の条件で計算する」を入れてください。
              </>
            )}
          </p>
        )}
        </div>
      </Panel>

      {mode === "auto" && (
        <Panel title="まとめて回すと">
          {/*
           * ★ 入口はゲームのオート設定と同じ2択にしてある（Nori 指摘 2026-08-12）。
           *   ライボがなくなるまで … 手持ちで何回まわせるか
           *   回数を指定         … 決めた回数を走るのに、石やドリンクをいくら足すか
           *   ゲーム側の言葉と揃えておけば、どちらを選ぶかで迷わない。
           */}
          <div className="mb-4">
            <SegmentedControl
              options={[
                { value: "lb", label: "ライボがなくなるまで" },
                { value: "plays", label: "回数を指定" },
                { value: "window", label: "残り時間で区切る" },
              ]}
              value={autoFrom}
              onChange={(v) => {
                setAutoFrom(v);
                persist({ autoFrom: v });
              }}
            />
          </div>
          {autoFrom === "window" && (
            <div className="mb-4 space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="残り時間（分）"
                  hint="既定は次の4:00まで。オートの回数はそこで消える"
                >
                  <NeuInput
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={windowMin}
                    onChange={(e) => {
                      setWindowMin(e.target.value);
                      persist({ windowMin: e.target.value });
                    }}
                  />
                </Field>
                <Field label="ライボが足りなくなったら" hint="どちらを選ぶかで最適な曲が変わる">
                  <SegmentedControl
                    options={[
                      { value: "stop", label: "そこで止める" },
                      { value: "refill", label: "石・ドリンクで足す" },
                    ]}
                    value={refill ? "refill" : "stop"}
                    onChange={(v) => {
                      const next = v === "refill";
                      setRefill(next);
                      persist({ refill: next });
                    }}
                  />
                </Field>
              </div>
              {/*
               * ★ この機能が正しいのは「その窓で使わなかった枠が失われる」ときだけ。
               *   オート回数は4:00で消えるが、**ライボは翌日へ持ち越せる**。
               *   イベント全体で見れば Pt/プレイ（＝上の既定の並び）が正しい軸なので、
               *   短い曲が有利という結論を無条件に持ち帰られないよう明記する。
               */}
              <p className="text-xs leading-relaxed text-slate-500">
                <b>上の表が「この時間内に稼げる合計Pt」の順に並び替わります。</b>
                何で止まるか（時間／ライボ／回数）も各行に出ます。
                <br />
                オートの回数は4:00に消えるので、締切前に使い切る計画にはこれが効きます。
                ただし<b>ライボは翌日に持ち越せる</b>ので、イベント全体で見るなら
                「ライボがなくなるまで」の並び（1回あたりの効率）の方が正しい軸です。
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="曲" hint="上の表から選ぶ（既定は1位）">
              <select
                value={best ? keyOf(best) : ""}
                onChange={(e) => {
                  setPickKey(e.target.value);
                  persist({ pick: e.target.value });
                }}
                aria-label="換算に使う曲"
                className="neu-inset w-full rounded-lg px-3 py-2 text-sm text-slate-700"
              >
                {ranked.map((r, i) => (
                  <option key={keyOf(r)} value={keyOf(r)}>
                    {i + 1}位 {r.title}（{r.difficulty}
                    {r.playLevel != null ? ` ${r.playLevel}` : ""}）
                  </option>
                ))}
              </select>
            </Field>
            <Field label="焚き数" hint="1プレイで消費するライブボーナス">
              <TakiInput
                value={taki}
                onChange={(v) => {
                  setTaki(v);
                  persist({ taki: v });
                }}
              />
            </Field>
            <Field label="いまのライブボーナス" hint={`上限 ${limits.lbCap}`}>
              <NeuInput
                inputMode="numeric"
                value={startLB}
                onChange={(e) => {
                  const v = onlyDigits(e.target.value);
                  setStartLB(v);
                  persist({ startLB: v });
                }}
              />
            </Field>
            <Field
              label="カラフルパス"
              hint={`ライボ上限 ${limits.lbCap}／オート ${limits.autoPlays}回`}
            >
              <select
                value={pass}
                onChange={(e) => changePass(e.target.value as PassCourse)}
                aria-label="カラフルパスのコース"
                className="neu-inset w-full rounded-lg px-3 py-2 text-sm text-slate-700"
              >
                {(Object.keys(PASS_LIMITS) as PassCourse[]).map((k) => (
                  <option key={k} value={k}>
                    {PASS_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            {autoFrom === "lb" && (
              <Field
                label="今日の残りオート回数"
                hint={`上限 ${limits.autoPlays}回（毎日4:00にリセット）。消化ぶんを引いた数`}
              >
                <NeuInput
                  inputMode="numeric"
                  value={autoLeft}
                  onChange={(e) => {
                    const v = onlyDigits(e.target.value);
                    setAutoLeft(v);
                    persist({ autoLeft: v });
                  }}
                />
              </Field>
            )}
            {autoFrom === "plays" && (
              <Field label="プレイ回数" hint={`オートの上限は1日 ${limits.autoPlays}回（毎日4:00にリセット）`}>
                <NeuInput
                  inputMode="numeric"
                  value={plays}
                  onChange={(e) => {
                    const v = onlyDigits(e.target.value);
                    setPlays(v);
                    persist({ plays: v });
                  }}
                />
              </Field>
            )}
          </div>

          {best && (autoFrom === "lb" ? lbRun.plays > 0 : playCount > 0) ? (
            <>
              <div className="mt-5">
                <Switch
                  checked={regen}
                  onChange={(v) => {
                    setRegen(v);
                    persist({ regen: v });
                  }}
                  label={`走っている間の自然回復（${LB_REGEN_MIN}分に1）を数える`}
                />
              </div>
              <p className="mt-4 text-sm text-slate-600">
                <span className="font-bold text-slate-700">「{best.title}」</span>
                <span className="ml-1">
                  <DifficultyBadge difficulty={best.difficulty} level={best.playLevel} />
                </span>
                {autoFrom === "lb"
                  ? ` を ${taki}焚きで、ライボ ${Number(startLB) || 0} がなくなるまで まわすと`
                  : ` を ${taki}焚きで ${fmt(playCount)}回 まわすと`}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label={autoFrom === "lb" ? "まわせる回数" : "獲得ポイント"}
                  value={autoFrom === "lb" ? fmt(lbRun.plays) : fmt(best.eventPt * playCount)}
                  sub={
                    autoFrom === "lb"
                      ? lbRun.stoppedBy === "plays"
                        ? `オートの残り ${Math.max(0, Number(autoLeft) || 0)}回を使い切って止まります`
                        : `ライボ切れまで（回復 +${lbRun.regained}）`
                      : `1回 ${fmt(best.eventPt)} Pt`
                  }
                  delta={autoFrom === "lb" ? lbRun.plays : best.eventPt * playCount}
                />
                <Stat
                  label={autoFrom === "lb" ? "獲得ポイント" : "足りないライボ"}
                  value={autoFrom === "lb" ? fmt(best.eventPt * lbRun.plays) : fmt(lbNeed.deficit)}
                  sub={
                    autoFrom === "lb"
                      ? `1回 ${fmt(best.eventPt)} Pt`
                      : lbNeed.deficit > 0
                        ? `石 ${fmt(lbNeed.crystals)}／大ドリンク ${lbNeed.drinksLarge}本`
                        : "手持ちで足ります"
                  }
                  delta={autoFrom === "lb" ? best.eventPt * lbRun.plays : undefined}
                />
                <Stat
                  label="所要時間"
                  value={hhmm(autoFrom === "lb" ? lbRun.seconds : best.cycleSec * playCount)}
                  sub={`1回 ${best.cycleSec.toFixed(0)}秒（ロス込み）`}
                  delta={Math.round(autoFrom === "lb" ? lbRun.seconds : best.cycleSec * playCount)}
                  formatDelta={(n) => hhmm(n)}
                />
                <Stat
                  label={autoFrom === "lb" ? "使い切れず残る" : "ライボ1あたり"}
                  value={
                    autoFrom === "lb"
                      ? fmt(lbRun.leftover)
                      : taki > 0
                        ? fmt(best.eventPt / taki)
                        : "—"
                  }
                  sub={
                    autoFrom === "lb"
                      ? lbRun.leftover <= 0
                        ? "きれいに使い切れます"
                        : // ★ 止まった理由で意味がまるで違う。回数上限で止まったなら
                          //   残りは「まだ回せるのに回せない」ぶんで、焚き数を上げれば使える。
                          //   ライボ切れなら「焚き数に足りない端数」で、下げれば使える。
                          lbRun.stoppedBy === "plays"
                          ? "オート回数を使い切って余りました（焚き数を上げると使えます）"
                          : `${taki}焚きに足りないので止まります`
                      : taki > 0
                        ? "Pt / ライボ1"
                        : "0焚きでは計算しない"
                  }
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                所要時間は曲長＋ロス{custom ? `（${overhead || 0}秒）` : `（${DEFAULT_OVERHEAD_SEC[mode]}秒）`}
                の単純な積み上げです。オートは放置できるので、この時間は拘束時間ではありません。
                {autoFrom === "lb" ? (
                  <>
                    {" "}
                    <span className="font-bold text-slate-600">残りが焚き数を下回ると止まります</span>
                    （5焚きで残り2なら、2焚きでは回してくれません）。自然回復は上限{limits.lbCap}
                    までで、上限に達している間は進みません。
                  </>
                ) : (
                  <>
                    {" "}
                    足りないぶんは<span className="font-bold text-slate-600">石や回復アイテムで注ぎ足す前提</span>
                    で数えています（石10でライボ1・大ドリンクは10）。
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              {autoFrom === "lb"
                ? "いまのライブボーナスと焚き数を入れると、何回まわせるかを出します。"
                : "プレイ回数を入れると、獲得ポイント・足りないライボ・所要時間をまとめて出します。"}
            </p>
          )}
        </Panel>
      )}

      <Panel>
        <Switch
          checked={custom}
          onChange={(v) => {
            setCustom(v);
            persist({ custom: v });
          }}
          label="自分の条件で計算する"
        />
        {custom && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* 呼び出しは上部にもあるが、値をいじっている場所からも届くようにする。
                行き来せずに「別の編成で試す」ができる。 */}
            <ProfileBar
              apply={(p) => {
                if (p.power != null) setPower(String(p.power));
                if (p.bonus != null) setBonus(String(p.bonus));
                if (p.skillLeader != null) setSkillLeader(String(p.skillLeader));
                if (p.skillTotal != null) setSkillTotal(String(p.skillTotal));
                if (p.taki != null) setTaki(p.taki);
              }}
            />
            <SaveToProfile
              collect={() => ({
                power: numOrUndef(power),
                bonus: numOrUndef(bonus),
                skillLeader: numOrUndef(skillLeader),
                skillTotal: numOrUndef(skillTotal),
                taki,
              })}
            />
          </div>
        )}

        {custom && (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="総合力">
                <NeuInput
                  inputMode="numeric"
                  value={power}
                  onChange={(e) => {
                    const v = onlyDigits(e.target.value);
                    setPower(v);
                    persist({ power: v });
                  }}
                />
              </Field>
              {mode !== "challenge" && (
                <Field label="イベントボーナス（%）">
                  <NeuInput
                    inputMode="decimal"
                    value={bonus}
                    onChange={(e) => {
                      const v = decimalInput(e.target.value);
                      setBonus(v);
                      persist({ bonus: v });
                    }}
                  />
                </Field>
              )}
              <Field label="リーダー（%）" hint="ついぼ表記の1つ目。編成の一番左のカード">
                <NeuInput
                  inputMode="numeric"
                  value={skillLeader}
                  onChange={(e) => {
                    const v = onlyDigits(e.target.value);
                    setSkillLeader(v);
                    persist({ skillLeader: v });
                  }}
                />
              </Field>
              <Field label="内部値" hint="ついぼ表記の2つ目。編成5枚のスコアアップ合計">
                <NeuInput
                  inputMode="numeric"
                  value={skillTotal}
                  onChange={(e) => {
                    const v = onlyDigits(e.target.value);
                    setSkillTotal(v);
                    persist({ skillTotal: v });
                  }}
                />
              </Field>
              {mode === "manual" && (
                <Field label="焚き数">
                  <TakiInput
                    value={taki}
                    onChange={(v) => {
                      setTaki(v);
                      persist({ taki: v });
                    }}
                  />
                </Field>
              )}
              {mode !== "challenge" && (
                <Field
                  label="1曲あたりのロス（秒）"
                  hint={
                    mode === "manual"
                      ? "ロード・リザルト・部屋待ちの合計"
                      : "ロード・リザルトの合計。所要時間の表示にだけ使う"
                  }
                >
                  <NeuInput
                    inputMode="numeric"
                    value={overhead}
                    onChange={(e) => {
                      const v = onlyDigits(e.target.value);
                      setOverhead(v);
                      persist({ overhead: v });
                    }}
                  />
                </Field>
              )}
            </div>

            <div className="mt-4">
              <span className="text-xs text-slate-500">
                この編成の実効値は{" "}
                <span className="font-bold text-slate-700 tabular-nums">
                  {multiEffectiveSkill(Number(skillLeader) || 0, Number(skillTotal) || 0).toFixed(1)}
                </span>
                {mode === "manual" ? "（協力ライブで発動する値）" : "（協力ライブ用。このタブでは使いません）"}
              </span>
              <InfoNote label="内部値と実効値について">
                <p>
                  ついぼの「<span className="font-bold text-slate-600">150/710/31.3</span>」表記は、
                  リーダー150%／内部値710／総合力31.3万 の意味です。
                  <span className="font-bold text-slate-600">内部値</span>
                  はリーダーを含む編成5枚のスコアアップ合計。
                </p>
                <p className="mt-2">
                  <span className="font-bold text-slate-600">実効値</span>
                  は協力ライブで実際に発動する値で、
                  <code>リーダー + (内部値 − リーダー) × 0.2</code> で出ます。
                  リーダーは100%、サブ4枚は各20%しか効かないためです。
                  この例なら 150 + 560 × 0.2 = <span className="font-bold text-slate-600">262</span>。
                </p>
                <p className="mt-2">
                  ソロ（オート・チャレライ）は別勘定で、編成5枚が1回ずつ発動するので
                  内部値 ÷ 5 が平均、最後の6回目だけリーダーがもう1回発動します。
                  そのため<span className="font-bold text-slate-600">ソロでは内部値が、協力ではリーダーが効きます</span>。
                </p>
              </InfoNote>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">{note.skillHint}</p>
            {mode !== "challenge" && (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                イベントポイントの式にスコアが入るため、
                <span className="font-bold text-slate-600">総合力によって順位が入れ替わります</span>
                。総合力が低いうちは基礎点と曲の短さがほぼ全てですが、
                高くなるほど譜面そのものの質が効いてきます。
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel title="この数字について">
        <ul className="space-y-2 text-xs leading-relaxed text-slate-500">
          <li>
            スコアは <code>(base + Σ 実効スキル% × 枠重み ÷ 100) × 総合力 × 4</code>{" "}
            で計算しています。base と枠重みは楽曲ごとの実データで、
            譜面上のスキル発動位置が反映されています。タブごとに使うデータを変えていて、
            手動周回は協力ライブ用（フィーバー加点込み）、オートはオート用、チャレライはソロ用です。
          </li>
          <li>
            イベントポイントの式は
            <span className="font-bold text-slate-600">ソロと協力で別物</span>です。ソロ・オートは{" "}
            <code>100 + floor(スコア/20000)</code>、協力は{" "}
            <code>110 + floor(自スコア/17000) + min(13, floor(他4人合計/340000))</code>。
            他4人のスコアは分からないので、ここでは自分と同格の4人（自分のスコア×4）と置いています。
            実際の部屋の顔ぶれで単価は動くので、並び順の比較に使ってください。
          </li>
          <li>
            スキルは1曲のなかで<span className="font-bold text-slate-600">6回</span>発動します。
            カードは5枚・部屋も5人ですが、最後にもう1回あるので6回です
            （ソロならリーダーがもう1回、協力ならアンコール）。
            skill_score_* のデータが長さ6の配列なのもそのためです。
          </li>
          <li>
            全ノーツPERFECT（AP）を前提にした理論値です。判定係数は GREAT で 0.7 まで落ちるので、
            <span className="font-bold text-slate-600">叩けない譜面は表より不利になります</span>。
            上の譜面レベルで自分が安定してAPできる範囲に絞ると、実際の選曲に近づきます。
          </li>
          <li>
            スキルの発動位置は楽曲ごとに決まっていますが、
            <span className="font-bold text-slate-600">1〜5回目に誰のスキルが来るかはランダム</span>
            で選べません。そのため平均で計算しており、
            発動順を厳選しても曲どうしの順位は変わりません（全曲に同じ係数が掛かるだけ）。
          </li>
          <li>
            協力ライブの活躍ボーナス（スコアに少し足される加点）は入れていません。
            どの曲にもほぼ一律に乗るぶんなので順位はほとんど動きませんが、表示Ptは実際よりわずかに低めです。
          </li>
        </ul>
      </Panel>
    </ToolPage>
  );
}
