import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
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
  bestRowPerSong,
  multiEffectiveSkill,
  DEFAULT_OVERHEAD_SEC,
  DEFAULT_PARAMS,
  type RankingMode,
  type EfficiencyParams,
  type SoloBy,
} from "./lib/efficiency";
import { parseRankingQuery } from "./lib/rankingQuery";
import { premiseParts } from "./lib/premise";
import { filterSummary } from "./lib/filterSummary";
import { MoreSettings } from "../../components/ui/MoreSettings";
import { ProfileBar, SaveToProfile } from "../../components/ui/ProfileBar";
import {
  AUTO_MIN_TAKI,
  autoTaki,
  capAutoPlays,
  lbNeededForPlays,
  PASS_LABEL,
  PASS_LIMITS,
  playsUntilEmpty,
  type PassCourse,
} from "./lib/lbRun";
import { numOrUndef } from "../../lib/num";
import { MULTI_LIVE_SUSPENDED } from "../../lib/liveSuspension";
import { SOLO_OVERHEAD_PROVISIONAL } from "../../lib/overhead";
import { cn } from "../../lib/utils";
import { cappedPower, usePowerLimit } from "../../lib/powerLimit";
import { Delta } from "../../components/ui/Delta";
import { useFlip } from "../../lib/useFlip";
import { resolvePlan } from "../../motion/plan";
import { useMotionSetting } from "../../motion/settingsStore";
import { useReducedMotion, useTouchOnly } from "../../motion/environment";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;
const STORE_KEY = "sekai-master:ranking-inputs";
const STORE_VERSION = 2;
const ROW_LIMIT = 50;
/** 「自分の条件で計算する」の枠。表の上の前提の行から飛ぶ先。 */
const CUSTOM_ID = "ranking-custom";

const MODE_OPTIONS: { value: RankingMode; label: string }[] = [
  // ゲームの公式名「みんなでライブ」「ひとりでライブ」に合わせる（2026-11-18 に「手動周回」から改名）。
  // ★ ラベルは /compare の切り替えと同じ短い形（2026-11-19 検分 R1）。「みんなで周回」の 6 文字は、
  //   本番の字体（M PLUS Rounded 1c）だと 390px でも折れた。何のライブかは見出しの文で言う。
  { value: "manual", label: "みんなで" },
  // みんなでライブが止まったイベント（2026-11-18〜）向け。
  { value: "solo", label: "ひとりで" },
  { value: "auto", label: "オート" },
  { value: "challenge", label: "チャレライ" },
];

/**
 * 「ひとりで」タブの並べ方（2026-11-25）。ラベルは 390px で折れない 5 文字ずつ。
 * ★ みんなでライブが止まり、ひとりでライブを手で叩いて走る人が多い。ライボが律速の人には
 *   時間あたりより 1 回あたりのイベントPtが正しい軸になる（オートのタブはオートのスコアで別の数字）。
 */
const SOLO_BY_OPTIONS: { value: SoloBy; label: string }[] = [
  { value: "hour", label: "時間あたり" },
  { value: "play", label: "1回あたり" },
];

/** ソロ（ひとりでライブ・オート・チャレライ）のスキルの効き方。3つのタブで同じ文。 */
const SOLO_SKILL_HINT =
  "ソロは1曲のなかで6回スキルが発動します（編成5枚が1回ずつ＋最後にリーダーがもう1回）。1〜5回目の発動順は選べないので、5枚は内部値÷5の平均で計算し、6回目だけリーダーの値を当てています。";

/**
 * タブごとに「どのライブの・何を最大化しているか」を明示する。混同すると最適解が真逆になる。
 *
 * ★ body はタブの下に出す 1 行（26 字以内。390px の text-xs で 1 行）。何で並べているかは headline が言う。
 *   縮める前の説明（detail）はページ下の「この数字について」に 4 タブぶん並べる（2026-11-19 指揮の追加依頼）。
 */
const MODE_NOTE: Record<
  RankingMode,
  { headline: string; body: string; detail: string; metricLabel: string; skillHint: string }
> = {
  manual: {
    headline: "みんなでライブ・時間あたりのイベントポイント",
    body: "律速は時間。短い曲ほど有利（フィーバー込みの式）",
    detail:
      "手で叩くので律速は時間。短い曲ほど有利になります。フィーバー込みのみんなでライブの式で計算しています。",
    metricLabel: "Pt/時",
    skillHint:
      "みんなでライブは1曲のなかで6回スキルが発動します（参加5人が1回ずつ＋アンコール1回）。各発動で乗るのが実効値です。強い人を呼ぶと単価が上がるのは、イベントポイントの式に他4人の合計スコアが入るからで、曲の順位そのものは部屋の顔ぶれでは変わりません。",
  },
  solo: {
    headline: "ひとりでライブ・時間あたりのイベントポイント",
    body: "律速は時間。短い曲ほど有利（ひとりでライブの式）",
    detail:
      "手で叩くので律速は時間。短い曲ほど有利になります。ひとりでライブのスコアとイベントポイントの式で計算しています。",
    metricLabel: "Pt/時",
    skillHint: SOLO_SKILL_HINT,
  },
  auto: {
    headline: "オート・1プレイあたりのイベントポイント",
    body: "律速はライボ。1回で稼げる長尺・高基礎点の曲が有利",
    detail:
      "放置するので時間はコストになりません。律速はライブボーナスなので、1回で多く稼げる長尺・高基礎点の曲が有利です。手動とは最適解が逆になります。",
    metricLabel: "Pt/回",
    skillHint: SOLO_SKILL_HINT,
  },
  challenge: {
    headline: "チャレンジライブ・1プレイあたりのスコア",
    body: "1日1回。ライボも時間も関係なく、スコアだけを見る",
    detail:
      "1日1回なので時間もライボも関係ありません。イベント基礎点も無関係で、純粋にスコアだけを見ます。",
    metricLabel: "スコア",
    skillHint: SOLO_SKILL_HINT,
  },
};

type ModeNote = (typeof MODE_NOTE)[RankingMode];

/**
 * 「ひとりで」を「1回あたり」で並べるときの見出し・説明。MODE_NOTE.solo の代わりに使う。
 * ★ body は MODE_NOTE と同じく 26 字以内。detail は「この数字について」に ひとりでの次の行として出す。
 */
const SOLO_PER_PLAY_NOTE: ModeNote = {
  headline: "ひとりでライブ・1回あたりのイベントポイント",
  body: "律速はライボ。1回で稼げる曲が有利",
  detail:
    "ライボが律速なら、時間ではなく1回で稼げるイベントポイントで比べます。長尺・高基礎点の曲が上に来ます。手で叩いたAPのスコアで計算するので、同じ曲でもオートのタブより1回のポイントが高めに出ます。",
  metricLabel: "Pt/回",
  skillHint: SOLO_SKILL_HINT,
};

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");
/** ボーナスは 0.5% 刻みを取りうるので小数を許す。小数点は1つまで。 */
const decimalInput = (v: string) =>
  v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const fmt = (n: number) => Math.round(n).toLocaleString("ja-JP");
const ALL_DIFFS = new Set<Difficulty>(DIFFICULTY_ORDER);

/** 曲長を m:ss に（表の行の小さな字）。 */
function mss(sec: number | null): string {
  if (sec == null) return "—";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

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
function levelBounds(entries: { playLevel?: number | null }[]): {
  min: number;
  max: number;
} {
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
  /** みんなで周回・オート周回・チャレライの「1曲あたりのロス」（3つで共有。2026-08 からの値）。 */
  overhead?: string;
  /**
   * ひとりで周回の「1曲あたりのロス」。**ほかのタブとは別に持つ**（2026-11-18）。
   * ★ 共有にすると、みんなで周回のために入れた値（部屋待ち込み）が、
   *   ひとりで周回に黙って持ち込まれる。未入力なら OVERHEAD_SEC.solo の既定を使う。
   */
  overheadSolo?: string;
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
  /** 開催中のイベントの総合力上限を効かせるか（既定 ON）。 */
  applyLimit?: boolean;
  /** 表を難易度ごとに全部並べるか。既定（false）は1曲1行（2026-11-19）。 */
  allDiffs?: boolean;
  /** 「ひとりで」の並べ方。既定（未保存）は時間あたり（2026-11-25）。 */
  soloBy?: SoloBy;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

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
      typeof s.taki === "number" &&
      Number.isInteger(s.taki) &&
      s.taki >= 0 &&
      s.taki <= 10
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
      overheadSolo: str(s.overheadSolo),
      plays: str(s.plays),
      lvMin: lv(s.lvMin),
      lvMax: lv(s.lvMax),
      pick: str(s.pick),
      regen: typeof s.regen === "boolean" ? s.regen : undefined,
      applyLimit: typeof s.applyLimit === "boolean" ? s.applyLimit : undefined,
      allDiffs: typeof s.allDiffs === "boolean" ? s.allDiffs : undefined,
      soloBy: s.soloBy === "hour" || s.soloBy === "play" ? s.soloBy : undefined,
      autoFrom:
        s.autoFrom === "lb" || s.autoFrom === "plays" || s.autoFrom === "window"
          ? s.autoFrom
          : undefined,
      windowMin: str(s.windowMin),
      refill: typeof s.refill === "boolean" ? s.refill : undefined,
      startLB: str(s.startLB),
      pass:
        s.pass === "none" || s.pass === "deluxe" || s.pass === "precious"
          ? s.pass
          : undefined,
      autoLeft: str(s.autoLeft),
    };
  } catch {
    return {};
  }
}

/** 難易度の色付きバッジ。表の中で難易度を見分けるための主要な手がかり。 */
function DifficultyBadge({
  difficulty,
  level,
}: {
  difficulty: string;
  level: number | null;
}) {
  const key = difficulty as Difficulty;
  const color = DIFFICULTY_COLOR[key];
  if (!color)
    return <span className="text-xs text-slate-400">{difficulty}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="rounded px-1.5 py-0.5 text-xs font-bold leading-none text-white"
        style={{
          backgroundColor: color,
          textShadow: "0 1px 1px rgba(0,0,0,.3)",
        }}
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
function InfoNote({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-neu text-xs font-bold text-slate-500 shadow-neu-sm neu-tactile"
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
        onChange={(e) =>
          onChange(clamp(Math.floor(Number(e.target.value) || min)))
        }
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
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  formatDelta?: (n: number) => string;
  /** "warn" は「財布から出ていく数字」用。**他と同じ見た目にすると見落とされる。** */
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl bg-neu p-3 shadow-neu-inset">
      <div className="text-xs font-bold text-slate-500">
        {label}
        {delta !== undefined && <Delta value={delta} format={formatDelta} />}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-bold tabular-nums",
          tone === "warn" ? "text-amber-700" : "text-slate-700",
        )}
      >
        {value}
      </div>
      {sub && (
        <div
          className={cn(
            "text-xs",
            tone === "warn" ? "text-amber-700" : "text-slate-400",
          )}
        >
          {sub}
        </div>
      )}
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

/** サマリ用。**次に何をすれば伸びるか**まで書く。 */
const WINDOW_STOP_NOTE: Record<WindowRow["limitedBy"], string> = {
  time: "時間を使い切ります（短い曲にすると回数が伸びます）",
  lb: "ライボ切れで止まります（注ぎ足すか焚き数を下げると伸びます）",
  plays: "オートの残り回数を使い切ります（焚き数を上げると1回が濃くなります）",
  none: "制約に当たりません",
};

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
  /**
   * URL の指定（?tab=solo&by=play など。2026-11-25）。投稿のリンクから一発で並びを開くため、
   * **最初の描画のときだけ**読み、保存値より優先する。URL へは書き戻さず、保存もしない。
   */
  const [searchParams] = useSearchParams();
  const [query] = useState(() => parseRankingQuery(searchParams));

  /**
   * ★ タブは保存しない（毎回ここから開く）。みんなでライブが止まっている間は、
   *   使えないタブを最初に見せないよう「ひとりで周回」で開く（2026-11-18 Nori 決定。再開したら印を戻すだけで元に戻る）。
   *   URL で指定があればそのタブで開く。
   */
  const initialMode: RankingMode =
    query.tab ?? (MULTI_LIVE_SUSPENDED ? "solo" : "manual");
  const [mode, setMode] = useState<RankingMode>(initialMode);
  /** 「ひとりで」の並べ方。URL の指定 → 保存値 → 時間あたり（今までの並び）の順。 */
  const [soloBy, setSoloBy] = useState<SoloBy>(
    query.by ?? stored.soloBy ?? "hour",
  );
  const soloPerPlay = mode === "solo" && soloBy === "play";
  const [diffs, setDiffs] = useState<Set<Difficulty>>(() => new Set(ALL_DIFFS));
  /**
   * 表を難易度ごとに全部並べるか。**既定は1曲1行**（選んだ難易度・レベルの中で、その曲の一番上の行だけ）。
   * ★ 同じ曲が難易度違いで並ぶと上位が1曲で埋まる（ひとりで周回の上位7行のうち5行が独りんぼエンヴィー。2026-11-19）。
   */
  const [allDiffs, setAllDiffs] = useState(stored.allDiffs ?? false);

  // 既定は「入力なしで一般的な順位を見る」。自分の条件で計算したい人だけスイッチを入れる。
  const [custom, setCustom] = useState(stored.custom ?? false);
  const [power, setPower] = useState(
    stored.power ?? String(DEFAULT_PARAMS.power),
  );
  /**
   * 総合力の上限（ワールドリンク第3弾のみ）。
   * ★ 読めなくても画面は動く。上限は補助情報で、順位を出す前提条件ではない。
   */
  const { active: activeLimitEvent, latest: latestLimitEvent } =
    usePowerLimit();
  /**
   * 上限を効かせるか。
   *
   * ★ **未設定なら「開催中かどうか」に従う**（開催中は ON・期間外は OFF）。
   *   そのうえで手で切り替えられる。**イベント期間外にも上限つきで確かめたい**
   *   （次のワールドリンクの下見）という使い方があるため（Nori 指摘 2026-08-18）。
   *   undefined を保つのが肝で、true/false に固めると
   *   「イベントが始まったのに OFF のまま」という置き去りが起きる。
   */
  const [applyLimit, setApplyLimit] = useState<boolean | undefined>(
    stored.applyLimit,
  );
  /**
   * ★ **チャレンジライブはイベントの外**なので上限が掛からない。
   *   編成ビルダー側では最初から除外していたのに、ここで漏らしていた（破壊者指摘 2026-08-18）。
   *   漏らすとチャレライのスコアを16% 低く出すうえ、
   *   「上限を入れてください」と**正しい値を出している人を誤りへ誘導する**警告まで出ていた。
   */
  const limitApplies = mode !== "challenge";
  const limitOn = limitApplies && (applyLimit ?? activeLimitEvent != null);
  /** 期間外に効かせるときは直近の上限値を使う（上限そのものは毎回同じ値）。 */
  const limitEvent = activeLimitEvent ?? latestLimitEvent;
  /** 入力した総合力が上限を超えているか（切っているかどうかは問わない）。 */
  const overCap =
    limitApplies &&
    limitEvent != null &&
    custom &&
    (Number(power) || 0) > limitEvent.powerLimit;
  /** 実際に頭打ちにして計算している。 */
  const powerOverCap = overCap && limitOn;
  /**
   * ★ **開催中なのに上限を切っている。**
   *   一度切ると設定が残るので、次のワールドリンクが始まっても切れたままになる。
   *   黙っていると「警告も出ないまま過大なPtを見続ける」ことになるので、
   *   切っている側にもちゃんと知らせる。
   */
  const capIgnored = overCap && !limitOn && activeLimitEvent != null;
  /**
   * ★ **逆向きの置き去り。** 一度スイッチを入れると設定が残るので、
   *   ワールドリンクが終わって通常のイベントになっても上限が掛かり続け、
   *   **実際より低いPtと違う順位**を警告なしに見ることになる。
   *   OFF固着（capIgnored）だけ塞いで ON固着を放置していた（破壊者指摘 2026-08-18）。
   */
  const capPreview = overCap && limitOn && activeLimitEvent == null;
  const [bonus, setBonus] = useState(
    stored.bonus ?? String(DEFAULT_PARAMS.bonus),
  );
  const [taki, setTaki] = useState(stored.taki ?? DEFAULT_PARAMS.taki);
  /**
   * いまのタブで計算に使い・欄に出す焚き数。
   * ★ **オートは0焚きができない**（下限1。Nori 指摘 2026-11-21）。焚き数の state はタブ間で共有なので、
   *   ひとりで・みんなでで入れた0がオートに持ち込まれる。state は書き換えず（戻したら0のまま）、
   *   オートの間だけ1として扱う。
   */
  const effTaki = mode === "auto" ? autoTaki(taki) : taki;
  const [skillLeader, setSkillLeader] = useState(
    stored.skillLeader ?? String(DEFAULT_PARAMS.skillLeader),
  );
  const [skillTotal, setSkillTotal] = useState(
    stored.skillTotal ?? String(DEFAULT_PARAMS.skillTotal),
  );
  /**
   * 共有の欄（overhead）が最初に合わせるタブ。ふだんはみんなでの既定で、URL でオート・チャレライを
   * 指定して開いたときだけそのタブ（タブを押して切り替えたのと同じ欄の値で開く）。
   */
  const initialOverheadMode: Exclude<RankingMode, "solo"> =
    initialMode === "solo" ? "manual" : initialMode;
  // 既定はモードで違う（オートはリザルト送りを詰められないぶん長い）。
  // ★ この欄はみんなで周回・オート周回・チャレライの3つで共有する。ひとりで周回は下の overheadSolo。
  // ★ 保存値がみんなでの既定と同じ（＝触っていない）なら、changeMode と同じく開いたタブの既定へ差し替える。
  const [overhead, setOverhead] = useState(() =>
    stored.overhead != null &&
    Number(stored.overhead) !== DEFAULT_OVERHEAD_SEC.manual
      ? stored.overhead
      : String(DEFAULT_OVERHEAD_SEC[initialOverheadMode]),
  );
  /**
   * 共有の欄（overhead）がいまどのタブの既定に合わせているか。ひとりで周回を挟んでも、
   * 3つのタブの間の「触っていなければ既定へ差し替える」は今までどおりに動かすために持つ。
   */
  const [overheadMode, setOverheadMode] =
    useState<Exclude<RankingMode, "solo">>(initialOverheadMode);
  /** ひとりで周回のロス。未入力ならそのタブの既定（OVERHEAD_SEC.solo）。 */
  const [overheadSolo, setOverheadSolo] = useState(
    stored.overheadSolo ?? String(DEFAULT_OVERHEAD_SEC.solo),
  );
  /** いまのタブで使う・欄に出す値。 */
  const overheadValue = mode === "solo" ? overheadSolo : overhead;
  /**
   * ひとりで周回の既定のロスに「仮」と添えるか。**印（SOLO_OVERHEAD_PROVISIONAL）だけで決める**
   * （値が 33 かどうかでは決めない。Nori が測って印を下ろしたら消える）。
   */
  const soloLossProvisional = mode === "solo" && SOLO_OVERHEAD_PROVISIONAL;
  /**
   * 「回数を指定」のプレイ回数。★ オートの1日の上限（パスで決まる）を超えない。
   * 保存値が上限を超えていても（旧版の既定 100 など）、読んだときに上限へ収める。
   */
  const [plays, setPlays] = useState(() => {
    const cap = PASS_LIMITS[stored.pass ?? "none"].autoPlays;
    return capAutoPlays(stored.plays ?? String(cap), cap);
  });
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
    if (!custom)
      return {
        ...DEFAULT_PARAMS,
        taki: effTaki,
        overheadSec: DEFAULT_OVERHEAD_SEC[mode],
      };
    return {
      /**
       * ★ 開催中のイベントに総合力の上限があるなら、そこで頭打ちにする。
       *   上限帯では総合力を伸ばしても1点も増えないので、入力どおりに計算すると
       *   **曲の順位そのものが変わる**（総合力はスコアの線形係数で、定数項の
       *   効き方が変わるため並びがずれる）。
       *   「入力値をそのまま尊重する」より「実際に出る順位を出す」を優先する。
       */
      power: limitOn
        ? cappedPower(Number(power) || 0, limitEvent?.powerLimit)
        : Number(power) || 0,
      bonus: Number(bonus) || 0,
      taki: effTaki,
      skillLeader: Number(skillLeader) || 0,
      skillTotal: Number(skillTotal) || 0,
      overheadSec: Number(overheadValue) || 0,
    };
  }, [
    custom,
    mode,
    power,
    bonus,
    effTaki,
    skillLeader,
    skillTotal,
    overheadValue,
    limitOn,
    limitEvent,
  ]);

  /**
   * モードを切り替える。
   *
   * ★ ロスは**まだ触っていないときだけ**新しいモードの既定へ差し替える。
   *   手で入れた値を黙って書き換えると、戻したつもりの数字が変わっていて気付けない。
   *   「触っていない」の判定は「いまのモードの既定値と同じか」で十分（実測値が
   *   たまたま既定と一致していた場合は差し替わるが、そのときも表示は正しい）。
   * ★ ひとりで周回は別の欄（overheadSolo）なので、行き来しても共有の欄には触らない。
   *   比べる相手は「共有の欄がいま合わせているタブ」（overheadMode）の既定。
   */
  const changeMode = (next: RankingMode) => {
    if (next !== "solo") {
      setOverhead((cur) =>
        Number(cur) === DEFAULT_OVERHEAD_SEC[overheadMode]
          ? String(DEFAULT_OVERHEAD_SEC[next])
          : cur,
      );
      setOverheadMode(next);
    }
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
  /**
   * 今日の残りオート回数。★ パスの1日の上限を超えない（保存値が超えていても読んだときに収める）。
   */
  const [autoLeft, setAutoLeft] = useState(() => {
    const cap = PASS_LIMITS[stored.pass ?? "none"].autoPlays;
    return capAutoPlays(stored.autoLeft ?? String(cap), cap);
  });
  /** 計算に使う残り回数。欄は上限に収めてあるが、計算でも上限を超えさせない。 */
  const autoLeftNum = Math.min(limits.autoPlays, Math.max(0, Number(autoLeft) || 0));

  /**
   * ★ 「残り時間で区切る」に必要な入力は、**表より前**に宣言しておく。
   *   表の並び順がこれで変わるので、下のパネルの state を参照させると
   *   宣言順で詰まる（const は巻き上がらない）。
   */
  const [autoFrom, setAutoFrom] = useState<"lb" | "plays" | "window">(
    stored.autoFrom ?? "lb",
  );
  /** 残り時間（分）。既定は「いまから次の4:00まで」＝オート回数が消えるまで。 */
  const [windowMin, setWindowMin] = useState(
    stored.windowMin ?? String(minutesUntilReset()),
  );
  /**
   * ライボが足りなくなったら石・ドリンクで注ぎ足す前提にするか。
   *
   * ★ **既定は ON。** 注ぎ足さない設定だと、この機能は通常のオートタブと
   *   同じ順位しか返さない——手持ちだけで走ると全曲が同じ回数（所持÷焚き数）で
   *   止まり、並びが Pt/回 と一致するため。10炊き・ライボ50 なら境界は18分で、
   *   それを超えたらどれだけ長い窓を入れても答えが変わらない。
   *   **「ライボを度外視してでも時間効率を取りに行く」のがこの機能を使う場面**
   *  （Nori 指摘 2026-08-18）なので、既定をそちらに合わせる。
   */
  const [refill, setRefill] = useState(stored.refill ?? true);

  const ranked = useMemo(() => {
    if (diffs.size === 0) return [];
    const filtered = entries.filter(
      (e) =>
        diffs.has(e.difficulty as Difficulty) &&
        // Lv が不明な譜面は、範囲を絞っているときだけ落とす
        (e.playLevel == null
          ? !levelFiltered
          : e.playLevel >= loLv && e.playLevel <= hiLv),
    );
    /**
     * ★ 1曲1行への間引きは**上位◯件に切る前**に掛ける。先に切ると、同じ曲の難易度違いで枠が埋まって曲数が減る。
     *   rankSongs・rankSongsInWindow の出力そのものは変えない（間引きは後から掛ける純粋関数）。
     */
    const top = <R extends { musicId: string }>(rows: R[]) =>
      (allDiffs ? rows : bestRowPerSong(rows)).slice(0, ROW_LIMIT);
    // 「残り時間で区切る」ときだけ、合計Ptで並べ替える（別の指標になる）。
    if (mode === "auto" && autoFrom === "window") {
      const win = Math.max(0, Number(windowMin) || 0) * 60;
      return top(
        rankSongsInWindow(filtered, params, {
          windowSec: win,
          startLB: Number(startLB) || 0,
          lbCap: PASS_LIMITS[pass].lbCap,
          maxPlays: autoLeftNum,
          regen,
          refill,
        }),
      );
    }
    return top(rankSongs(filtered, params, mode, { soloBy }));
  }, [
    entries,
    params,
    mode,
    soloBy,
    diffs,
    allDiffs,
    loLv,
    hiLv,
    levelFiltered,
    autoFrom,
    windowMin,
    startLB,
    pass,
    autoLeftNum,
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
  const note = soloPerPlay ? SOLO_PER_PLAY_NOTE : MODE_NOTE[mode];
  const playCount = Math.min(limits.autoPlays, Number(plays) || 0);
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
  const keyOf = (r: { musicId: string; difficulty: string }) =>
    `${r.musicId}-${r.difficulty}`;
  /**
   * ★ 探す順は「同じキー → 同じ曲の表の行 → 1位」（検分 T1、2026-11-19）。1曲1行で選んだ難易度が隠れたときに
   *   黙って別の曲の1位へ替えない（曲は表に残っているので、その曲の表の行を使う）。保存値は書き換えない。
   */
  const pickMusic = pickKey.slice(0, pickKey.lastIndexOf("-"));
  const best =
    ranked.find((r) => keyOf(r) === pickKey) ??
    ranked.find((r) => r.musicId === pickMusic) ??
    ranked[0];

  /**
   * 今日まだ残っているオートの回数。
   * ★ パスの上限そのものではない。**すでに何回か消化していれば残りは減る**ので、
   *   上限を決め打ちすると「まわせる回数」を多く見積もる（Nori 指摘 2026-08-12）。
   */

  /**
   * パスを変えたときは、**まだ触っていない場合だけ**残り回数を新しい上限へ合わせる。
   * 手で入れた値を黙って書き換えると、戻したつもりの数字が変わっていて気付けない。
   * ★ ただし**新しい上限を超える値は上限に収める**（PRECIOUS の 50 回のまま なし に下げると、
   *   1日 10 回までのパスで 50 回まわす計算になる。Nori 指摘 2026-11-21）。プレイ回数も同じ。
   */
  const changePass = (next: PassCourse) => {
    const cap = PASS_LIMITS[next].autoPlays;
    setAutoLeft((cur) =>
      capAutoPlays(Number(cur) === limits.autoPlays ? String(cap) : cur, cap),
    );
    setPlays((cur) => capAutoPlays(cur, cap));
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
    taki: effTaki,
    cycleSec,
    regen,
    lbCap: limits.lbCap,
    maxPlays: autoLeftNum,
  });
  const lbNeed = lbNeededForPlays({
    startLB: Number(startLB) || 0,
    taki: effTaki,
    plays: playCount,
    cycleSec,
    regen,
    lbCap: limits.lbCap,
  });

  /**
   * 窓モードの走行。**必要な石まで出す。**
   * ★ 「注ぎ足す」を選んだ推奨は、コストを出さないと採否を判断できない
   *   （同じ時間を手動で回した方が Pt が高い場合があり、それでも選ぶかは
   *     石をいくら払うか次第）。ここを出さずに順位だけ見せてはいけない。
   */
  const windowRun = useMemo(() => {
    if (!isWindow || !best) return null;
    const windowSec = Math.max(0, Number(windowMin) || 0) * 60;
    const run = playsUntilEmpty({
      startLB: refill ? Number.MAX_SAFE_INTEGER : Number(startLB) || 0,
      taki: refill ? 0 : effTaki,
      cycleSec: best.cycleSec,
      regen,
      lbCap: limits.lbCap,
      maxPlays: autoLeftNum,
      windowSec,
    });
    // 実際に回した回数ぶんの消費を、手持ちから数え直す（refill でも本当の焚き数で）。
    const need = lbNeededForPlays({
      startLB: Number(startLB) || 0,
      taki: effTaki,
      plays: run.plays,
      cycleSec: best.cycleSec,
      regen,
      lbCap: limits.lbCap,
    });
    /**
     * 時間が効き始める境目（分）。
     *
     * ★ 「どの曲でも回り切る」＝ 窓 ≧ 回数 × **一番長い曲の1周**。
     *   これを下回って初めて曲ごとに回数が変わり、時間による最適化が意味を持つ。
     *   一番**短い**曲で測ると「まだ効く」と嘘をつくので、必ず長い方で測る。
     */
    const maxCycle = ranked.reduce((m, r) => Math.max(m, r.cycleSec), 0);
    const tightMin = (run.plays * maxCycle) / 60;
    return { run, need, windowSec, tightMin };
  }, [
    isWindow,
    best,
    windowMin,
    refill,
    startLB,
    effTaki,
    regen,
    limits.lbCap,
    autoLeftNum,
    ranked,
  ]);

  // 並び替えを目で追わせる。演出オフの人と OS の視差軽減には出さない
  //（動き自体が情報なので控えめでは出す）。
  const rowRef = useFlip(
    ranked.map((r) => `${r.musicId}-${r.difficulty}`),
    { enabled: motionLevel !== "off" && !osReduce },
  );

  /**
   * 表のすぐ上の前提の 1 行。**既定でも絶対値を出すので、何を前提にした数字かを表の上で言う**（2026-11-19）。
   * 数字は計算に使っている params から作る（既定なら DEFAULT_PARAMS と DEFAULT_OVERHEAD_SEC の値）。
   * ★ ロスは表の数字を動かすタブ（みんなで・ひとりで・オートの区間モード）でだけ書く。
   * ★ 「（仮）」は、印が立っていて、ひとりでのロスを利用者が書き換えていない間（既定と同じ値の間）は付ける
   *   （検分 T2。自分の総合力だけ入れた人のスクショにも残す）。比べる相手は DEFAULT_OVERHEAD_SEC.solo で、数字を直書きしない。
   * ★ 表の数字を大きく動かす前提だけを短く足す（検分 T5・T6。「余分な情報は削る」ので最小限）:
   *   みんなでは他4人を自分と同格と置いた数字、区間モードは注ぎ足すか・オートの残り回数で合計が何倍も変わる。
   */
  const premise = [
    ...premiseParts(params, mode, {
      showLoss: mode === "manual" || mode === "solo" || isWindow,
      provisionalLoss:
        soloLossProvisional &&
        (!custom || Number(overheadSolo) === DEFAULT_OVERHEAD_SEC.solo),
    }),
    ...(mode === "manual" ? ["他4人は同格"] : []),
    ...(isWindow
      ? [
          refill ? "注ぎ足す前提" : "注ぎ足さない",
          `残り${autoLeftNum}回`,
        ]
      : []),
  ].join("・");
  /**
   * 閉じた段「絞り込み」の見出しに出す今の条件の要約と、既定から変えた数。
   * ★ 読み込み中は譜面レベルの範囲がまだ仮（1〜40）なので、保存したレベルを「絞っている」と数えない
   *  （数えると見出しが一瞬「レベル5〜38（1 項目を変更中）」に跳ねてから戻る）。
   */
  const filterNote = filterSummary({
    all: DIFFICULTY_ORDER.map((d) => DIFFICULTY_LABEL[d]),
    selected: DIFFICULTY_ORDER.filter((d) => diffs.has(d)).map((d) => DIFFICULTY_LABEL[d]),
    levelFiltered: !loading && levelFiltered,
    // ★ 入力の初期値（0／99）はデータの外なので、見出しにはデータの範囲に収めて出す（検分 T3）
    lo: Math.max(levels.min, loLv),
    hi: Math.min(levels.max, hiLv),
    allDiffs,
  });
  /** 表の主役の数字の単位。★ 窓モードの metric は「窓内の合計Pt」。Pt/回 のままだと嘘になる。 */
  const unitLabel = isWindow ? "合計Pt" : note.metricLabel;

  /** 前提の行から「自分の条件で計算する」の枠を開いて、そこまで動かす。 */
  const openCustom = () => {
    if (!custom) {
      setCustom(true);
      persist({ custom: true });
    }
    const smooth = motionLevel !== "off" && !osReduce;
    // 開いて描き直してから動かす（畳んだままの高さで止まらないように）。jsdom には scrollIntoView が無い
    requestAnimationFrame(() => {
      const target = document.getElementById(CUSTOM_ID);
      target?.scrollIntoView?.({ behavior: smooth ? "smooth" : "auto", block: "start" });
      // ★ フォーカスもスイッチへ移す（検分 T8）。ボタンに残ると、読み上げの利用者に欄が開いたことが伝わらない
      target?.querySelector("input")?.focus({ preventScroll: true });
    });
  };

  return (
    <ToolPage
      morphKey="tool:ranking"
      title="効率曲ランキング"
      icon="leaderboard"
      wide
    >
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
        {/* ★ 4択で「チャレライ」が5文字あるので詰めて描く（既定の大きさだと 390px で折れる）。
              320px では詰めても「チャレラ／イ」と1字だけ落ちたので、折らない（ボタンの左右の余白に収まる）。
              min-w-0 は等幅を保つため（無いと折らない字の幅でボタンが広がり、つまみの位置とずれる）。 */}
        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={changeMode}
          compact
          buttonClassName="min-w-0 whitespace-nowrap"
        />
        {/* ★ 見出し（何で並べているか）＋説明 1 行。余白は 12px・行の高さは text-xs の既定に詰め、
              390px のひとりでで最初の画面に表が 5 行入るようにした（2026-11-19） */}
        <p className="mt-3 text-sm font-bold text-slate-600">{note.headline}</p>
        <p className="mt-1 text-xs text-slate-500">{note.body}</p>
        {/* ★ 「ひとりで」だけの並べ方（2026-11-25）。開いてすぐ見えるよう、閉じた段「絞り込み」には入れない。
              見出し（何で並べているか）がこれで替わるので、見出しのすぐ下に置く。 */}
        {mode === "solo" && (
          <SegmentedControl
            options={SOLO_BY_OPTIONS}
            value={soloBy}
            onChange={(v) => {
              setSoloBy(v);
              persist({ soloBy: v });
            }}
            ariaLabel="ひとりでの並べ方"
            className="mt-2 max-w-xs"
          />
        )}
        {/**
         * ★★ **この順位が何を含んでいないかを先に言う。** ★★
         * スコアの式はスキルの発動位置を**平均（期待値）**で置いている。したがって
         * 1枠だけが得る「1枠補正」（発動が固定で遅延しないぶん、区間の始点にある強い
         * ノーツを拾える）と、始点を遅perfect・終点を早perfectで取る「巻き込み」は
         * 入っていない。
         *
         * コミュニティで共有されている「効率難易度」（テルユアは赤・シャルルは緑 等）は
         * **1枠かつ巻き込み成功を前提にした理想値**で、こちらとは前提が違う。
         * 黙っていると、知っている人からは順位が間違って見えるし、
         * 知らない人は低難易度が強いと誤解する。**どちらにも嘘になる。**
         *
         * ★ 枠は 1 行に縮め、要る事実（含まないもの・2〜5枠の実感に近い）だけ表の前に残す。
         *   「効率難易度」との違いの詳しい話は、ページ下の「この数字について」へ移した（UX 監査 2026-11-12、PR-4）。
         * ★ 「2〜5枠」はみんなでライブの部屋の枠のこと。ひとりで・オート・チャレライには枠が無いので、
         *   みんなでのタブにだけ出す（2026-11-19 検分 R5）。
         */}
        {mode === "manual" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
            <b>1枠補正・巻き込みは含まず</b>、2〜5枠の実感に近い値
          </p>
        )}

        {/**
         * ★ 難易度・譜面レベル・並べ方は 4 タブ共通で閉じた段「絞り込み」に畳む（2026-11-19 指揮の追加依頼）。
         *   開いたままだと表の上で約 200px を使い、390px の最初の画面に表が 2 行しか入らなかった。
         *   畳んでも表に効くので、見出しに今の条件の要約と既定から変えた数を出す（MoreSettings・countChanged の作法）。
         *   開閉は保存しない（ほかの閉じた段と同じ）。
         */}
        <MoreSettings
          title="絞り込み"
          contents={filterNote.text}
          changed={filterNote.changed}
          className="mt-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold text-slate-500">難易度</span>
            {DIFFICULTY_ORDER.map((d) => (
              <NeuButton
                key={d}
                active={diffs.has(d)}
                onClick={() => toggleDiff(d)}
                className="px-3 py-1.5 text-xs"
                style={
                  diffs.has(d)
                    ? ({ "--unit-color": DIFFICULTY_COLOR[d] } as CSSProperties)
                    : undefined
                }
              >
                {DIFFICULTY_LABEL[d]}
              </NeuButton>
            ))}
            <span className="mx-1 h-5 w-px bg-slate-300/70" aria-hidden />
            <NeuButton
              className="px-3 py-1.5 text-xs"
              onClick={() => setDiffs(new Set(ALL_DIFFS))}
            >
              すべて
            </NeuButton>
            <NeuButton
              className="px-3 py-1.5 text-xs"
              onClick={() => setDiffs(new Set())}
            >
              選択を外す
            </NeuButton>
            {/* ★ 表の上には置かない（スマホの最初の画面に入る行が減る）。難易度の絞り込みと一緒に畳む */}
            <Switch
              checked={allDiffs}
              onChange={(v) => {
                setAllDiffs(v);
                persist({ allDiffs: v });
              }}
              label="難易度ごとに全部並べる"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
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
        </MoreSettings>
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
          {loading && (
            <p className="text-sm text-slate-500">
              楽曲データを読み込んでいます…
            </p>
          )}
          {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
          {!loading && !error && ranked.length === 0 && (
            <p className="text-sm text-slate-500">
              {diffs.size === 0
                ? "難易度を1つ以上選んでください。"
                : "条件に合う楽曲がありません。"}
            </p>
          )}

          {ranked.length > 0 && (
            <>
              {/*
               * ★ 前提は表のすぐ上に 1 行で（既定でも絶対値を出すので、数字より先に読ませる）。
               *   以前は表の下の注にしか無く、スクショした表だけが前提なしで出回る形だった。
               */}
              {/* ★ 行の高さは text-xs の既定（16px）・下の余白 4px。390px で最初の画面に 2 行入る高さに詰めた */}
              <p className="mb-1 text-xs text-slate-500">
                {/* 間は前提の側の右の余白で取る（ボタンが次の行へ折り返したとき、行頭が字下げにならないように） */}
                <span className="mr-2">{custom ? `自分の条件で計算：${premise}` : `${premise}の場合`}</span>
                <button
                  type="button"
                  className="whitespace-nowrap font-bold text-slate-600 underline underline-offset-4"
                  onClick={openCustom}
                >
                  {custom ? "条件を変える" : "自分の編成で計算する"}
                </button>
              </p>
              {/*
               * ★ 電話の幅が先（2026-11-19 表の直し）。1 行に「順位・ジャケット＋曲名（札・曲長）・主役の数字」だけを置き、
               *   横スクロールを出さない（以前は min-w-[600px] の表で、326px の枠を横にずらさないと数字が出なかった）。
               *   指数・ノーツ・基礎点の列は削った。主役の数字はそのタブが並べている量の絶対値。
               * ★ 2 段目は曲の札・曲長（左）と、数字の内訳（右）。狭いと内訳だけ次の行へ折り返す。
               */}
              <div data-ranking-table>
                <div
                  aria-hidden
                  className="flex items-end gap-2 border-b border-slate-300 pb-1 text-xs font-bold text-slate-500"
                >
                  <span className="w-6 shrink-0 text-right">#</span>
                  <span className="flex-1">楽曲</span>
                  <span data-ranking-unit>{unitLabel}</span>
                </div>
                <ol>
                  {ranked.map((r, i) => {
                    const key = `${r.musicId}-${r.difficulty}`;
                    // ★ 何で止まるかは曲ごとに変わる（短い曲は時間、長い曲はライボ）。これを出さないと「なぜこの曲が上なのか」が読めない。
                    const w = isWindow ? windowInfo(r) : null;
                    const perHour =
                      (mode === "manual" || mode === "solo") && r.cycleSec > 0
                        ? 3600 / r.cycleSec
                        : null;
                    return (
                      <li
                        key={key}
                        data-ranking-row={key}
                        // 条件を変えると順位が総入れ替えになる。行が実際に動いて見えないと
                        // 「さっき見ていた曲がどこへ行ったか」が追えない。
                        ref={rowRef(key)}
                        // py-1.5 は表のセルの例外（docs/design-system.md 3 節）。一覧の長さを詰める
                        className="flex items-start gap-2 border-t border-slate-300 py-1.5 first:border-t-0"
                      >
                        <span className="w-6 shrink-0 text-right text-sm leading-8 tabular-nums text-slate-400">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <img
                              src={`${JACKET_BASE}${r.jacketLink}`}
                              alt=""
                              loading="lazy"
                              className="h-8 w-8 shrink-0 rounded"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">
                              {r.title}
                            </span>
                            <span
                              data-main-number
                              className="shrink-0 font-num text-lg font-bold leading-8 tabular-nums text-slate-800 min-[360px]:text-2xl"
                            >
                              {fmt(r.metric)}
                            </span>
                            <span className="sr-only">{unitLabel}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <DifficultyBadge
                              difficulty={r.difficulty}
                              level={r.playLevel}
                            />
                            <span className="font-num tabular-nums">
                              {mss(r.musicTime)}
                            </span>
                            {perHour != null && (
                              <span
                                data-sub
                                className="ml-auto text-right font-num tabular-nums"
                              >
                                {/*
                                 * ★ 主役の数字と同じ量を小さな字で繰り返さない。1回あたりなら Pt/時 を回す。
                                 *   回/時 も並べると本番の字体で 390px の行に収まらず、内訳だけ次の行へ折れて
                                 *   1 行が高くなる（2026-11-25 撮影で確認）ので、1回あたりでは Pt/時 だけにする。
                                 */}
                                {soloPerPlay ? (
                                  <span className="whitespace-nowrap">
                                    1時間 {fmt(r.ptPerHour)}Pt
                                  </span>
                                ) : (
                                  <>
                                    <span className="whitespace-nowrap">
                                      {perHour.toFixed(1)}回/時
                                    </span>
                                    ・
                                    <span className="whitespace-nowrap">
                                      1回 {fmt(r.eventPt)}Pt
                                    </span>
                                  </>
                                )}
                              </span>
                            )}
                            {w && (
                              <span
                                data-sub
                                className="ml-auto flex items-center gap-1"
                              >
                                <span className="font-num tabular-nums">
                                  {w.plays}回
                                </span>
                                <span className="rounded bg-neu px-1 py-0.5 shadow-neu-inset">
                                  {LIMIT_LABEL[w.limitedBy]}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
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
                { value: "window", label: "この時間で最大化" },
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
                  label="放置できる時間（分）"
                  hint="既定は次の4:00まで（オートの回数がそこで消えるため）"
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
                <Field
                  label="ライボが足りなくなったら"
                  hint="手持ちを使い切れる長さの時間だと、「そこで止める」は「1回あたりのPt」順と同じ順位になります"
                >
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
                <b>
                  上の表が「この時間内に稼げる合計Pt」の順に並び替わります。
                </b>
                何で止まるか（時間／ライボ／回数）も各行に出ます。
                <br />
                オートの回数は4:00に消えるので、締切前に使い切る計画にはこれが効きます。
                ただし<b>ライボは翌日に持ち越せる</b>
                ので、イベント全体で見るなら
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
            <Field label="焚き数" hint="1プレイで消費するライブボーナス。オートは1焚きから">
              <TakiInput
                value={effTaki}
                min={AUTO_MIN_TAKI}
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
            {(autoFrom === "lb" || autoFrom === "window") && (
              <Field
                label="今日の残りオート回数"
                hint={`上限 ${limits.autoPlays}回（毎日4:00にリセット）。消化ぶんを引いた数`}
              >
                <NeuInput
                  inputMode="numeric"
                  value={autoLeft}
                  onChange={(e) => {
                    const v = capAutoPlays(onlyDigits(e.target.value), limits.autoPlays);
                    setAutoLeft(v);
                    persist({ autoLeft: v });
                  }}
                />
              </Field>
            )}
            {autoFrom === "plays" && (
              <Field
                label="プレイ回数"
                hint={`オートの上限は1日 ${limits.autoPlays}回（毎日4:00にリセット）`}
              >
                <NeuInput
                  inputMode="numeric"
                  value={plays}
                  onChange={(e) => {
                    const v = capAutoPlays(onlyDigits(e.target.value), limits.autoPlays);
                    setPlays(v);
                    persist({ plays: v });
                  }}
                />
              </Field>
            )}
          </div>

          {best && isWindow && windowRun ? (
            <>
              {/*
                ★ **この機能が退化している状態を黙って出さない。**
                  放置時間が長いと、どの曲でも残りオート回数を回り切ってしまい、
                  合計Pt = 回数 × Pt/回 になって**並びが通常のオート周回と同じ**になる。
                  既定（次の4:00まで＝十数時間）ではほぼ必ずこうなるので、
                  「時間で最適化した答え」だと誤解される（破壊者指摘 2026-08-18）。
                  時間が効き始める境目も一緒に出して、次に何をすればいいか分かるようにする。
              */}
              {windowRun.run.stoppedBy === "plays" && (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                  この時間なら
                  <b>
                    どの曲でも残りオート{windowRun.run.plays}回を回り切ります
                  </b>
                  。 そのため並びは<b>「1回あたりのPt」順と同じ</b>
                  で、時間による最適化は効いていません。 時間が効くのは
                  <b>
                    およそ{Math.max(1, Math.round(windowRun.tightMin))}
                    分より短いとき
                  </b>
                  です。
                </p>
              )}
              <p className="mt-4 text-sm text-slate-600">
                <span className="font-bold text-slate-700">
                  「{best.title}」
                </span>
                <span className="ml-1">
                  <DifficultyBadge
                    difficulty={best.difficulty}
                    level={best.playLevel}
                  />
                </span>
                {` を ${effTaki}焚きで ${Math.max(0, Number(windowMin) || 0)}分 まわすと`}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label="まわせる回数"
                  value={fmt(windowRun.run.plays)}
                  sub={WINDOW_STOP_NOTE[windowRun.run.stoppedBy]}
                  delta={windowRun.run.plays}
                />
                <Stat
                  label="獲得ポイント"
                  value={fmt(best.eventPt * windowRun.run.plays)}
                  sub={`1回 ${fmt(best.eventPt)} Pt`}
                  delta={best.eventPt * windowRun.run.plays}
                />
                {/* ★ 注ぎ足す前提の推奨は、この数字が無いと採否を決められない。 */}
                {/* ★ 4つの Stat のうち、ここだけが**財布から出ていく数字**。
                    同じ見た目で並べると見落とされる（破壊者指摘 2026-08-18）。 */}
                <Stat
                  label="足りないライボ"
                  value={fmt(windowRun.need.deficit)}
                  tone={windowRun.need.deficit > 0 ? "warn" : undefined}
                  sub={
                    windowRun.need.deficit > 0
                      ? `石 ${fmt(windowRun.need.crystals)} 個を使う前提です`
                      : "手持ちで足ります"
                  }
                />
                <Stat
                  label="実際に使う時間"
                  value={hhmm(windowRun.run.seconds)}
                  sub={`1回 ${best.cycleSec.toFixed(0)}秒（ロス込み）`}
                  delta={Math.round(windowRun.run.seconds)}
                  formatDelta={(n) => hhmm(n)}
                />
              </div>
              <div className="mt-4">
                <Switch
                  checked={regen}
                  onChange={(v) => {
                    setRegen(v);
                    persist({ regen: v });
                  }}
                  label={`走っている間の自然回復（${LB_REGEN_MIN}分に1）を数える`}
                />
              </div>
            </>
          ) : best && (autoFrom === "lb" ? lbRun.plays > 0 : playCount > 0) ? (
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
                <span className="font-bold text-slate-700">
                  「{best.title}」
                </span>
                <span className="ml-1">
                  <DifficultyBadge
                    difficulty={best.difficulty}
                    level={best.playLevel}
                  />
                </span>
                {autoFrom === "lb"
                  ? ` を ${effTaki}焚きで、ライボ ${Number(startLB) || 0} がなくなるまで まわすと`
                  : ` を ${effTaki}焚きで ${fmt(playCount)}回 まわすと`}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label={autoFrom === "lb" ? "まわせる回数" : "獲得ポイント"}
                  value={
                    autoFrom === "lb"
                      ? fmt(lbRun.plays)
                      : fmt(best.eventPt * playCount)
                  }
                  sub={
                    autoFrom === "lb"
                      ? lbRun.stoppedBy === "plays"
                        ? `オートの残り ${autoLeftNum}回を使い切って止まります`
                        : `ライボ切れまで（回復 +${lbRun.regained}）`
                      : `1回 ${fmt(best.eventPt)} Pt`
                  }
                  delta={
                    autoFrom === "lb" ? lbRun.plays : best.eventPt * playCount
                  }
                />
                <Stat
                  label={autoFrom === "lb" ? "獲得ポイント" : "足りないライボ"}
                  value={
                    autoFrom === "lb"
                      ? fmt(best.eventPt * lbRun.plays)
                      : fmt(lbNeed.deficit)
                  }
                  sub={
                    autoFrom === "lb"
                      ? `1回 ${fmt(best.eventPt)} Pt`
                      : lbNeed.deficit > 0
                        ? `石 ${fmt(lbNeed.crystals)}／大ドリンク ${lbNeed.drinksLarge}本`
                        : "手持ちで足ります"
                  }
                  delta={
                    autoFrom === "lb" ? best.eventPt * lbRun.plays : undefined
                  }
                />
                <Stat
                  label="所要時間"
                  value={hhmm(
                    autoFrom === "lb"
                      ? lbRun.seconds
                      : best.cycleSec * playCount,
                  )}
                  sub={`1回 ${best.cycleSec.toFixed(0)}秒（ロス込み）`}
                  delta={Math.round(
                    autoFrom === "lb"
                      ? lbRun.seconds
                      : best.cycleSec * playCount,
                  )}
                  formatDelta={(n) => hhmm(n)}
                />
                <Stat
                  label={autoFrom === "lb" ? "使い切れず残る" : "ライボ1あたり"}
                  value={
                    autoFrom === "lb"
                      ? fmt(lbRun.leftover)
                      : effTaki > 0
                        ? fmt(best.eventPt / effTaki)
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
                          : `${effTaki}焚きに足りないので止まります`
                      : effTaki > 0
                        ? "Pt / ライボ1"
                        : "0焚きでは計算しない"
                  }
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                所要時間は曲長＋ロス
                {custom
                  ? `（${overheadValue || 0}秒）`
                  : `（${DEFAULT_OVERHEAD_SEC[mode]}秒）`}
                の単純な積み上げです。オートは放置できるので、この時間は拘束時間ではありません。
                {autoFrom === "lb" ? (
                  <>
                    {" "}
                    <span className="font-bold text-slate-600">
                      残りが焚き数を下回ると止まります
                    </span>
                    （5焚きで残り2なら、2焚きでは回してくれません）。自然回復は上限
                    {limits.lbCap}
                    までで、上限に達している間は進みません。
                  </>
                ) : (
                  <>
                    {" "}
                    足りないぶんは
                    <span className="font-bold text-slate-600">
                      石や回復アイテムで注ぎ足す前提
                    </span>
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
        {/* 表の上の前提の行（「自分の編成で計算する」）から飛ぶ先 */}
        <div id={CUSTOM_ID} className="scroll-mt-20">
          <Switch
            checked={custom}
            onChange={(v) => {
              setCustom(v);
              persist({ custom: v });
            }}
            label="自分の条件で計算する"
          />
        </div>
        {custom && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* 呼び出しは上部にもあるが、値をいじっている場所からも届くようにする。
                行き来せずに「別の編成で試す」ができる。 */}
            <ProfileBar
              apply={(p) => {
                if (p.power != null) setPower(String(p.power));
                if (p.bonus != null) setBonus(String(p.bonus));
                if (p.skillLeader != null)
                  setSkillLeader(String(p.skillLeader));
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

        {/* ★ aria-live は「中身入りで DOM に挿入」されると読み上げが不安定なので、
            空のまま常設して中身だけ差し替える（破壊者指摘 2026-08-18）。 */}
        <p role="status" className="sr-only">
          {capIgnored
            ? "開催中のイベントには総合力の上限がありますが、いま上限を切っています。"
            : capPreview
              ? "いま開催中のイベントに総合力の上限はありません。下見の計算をしています。"
              : powerOverCap
                ? "入力した総合力が上限を超えたので、上限で頭打ちにして計算しています。"
                : ""}
        </p>
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
                {/* ★ 上限つきのイベントが存在するときだけ出す。関係ない時期に
                    見せても意味が分からないだけなので。 */}
                {limitApplies && limitEvent && (
                  <div className="mt-2">
                    <Switch
                      checked={limitOn}
                      onChange={(v) => {
                        setApplyLimit(v);
                        persist({ applyLimit: v });
                      }}
                      label={`総合力の上限 ${limitEvent.powerLimit.toLocaleString()} を効かせる`}
                    />
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {activeLimitEvent
                        ? `開催中の「${activeLimitEvent.name}」は発揮できる総合力が頭打ちです。`
                        : `いまは対象のイベント期間外です。次のワールドリンクを見越して試すときに入れてください。`}
                    </p>
                    {/* ★ 警告は**スイッチの直下**に置く。以前は入力グリッドの上に出していたが、
                        本文が指す「上限のスイッチ」が画面の下にあって参照が遠く、しかも
                        総合力を打って上限を超えた瞬間に入力欄の上へ box が挿入されて
                        欄が下に跳んでいた（破壊者指摘 2026-08-18）。 */}
                    {capIgnored && activeLimitEvent && (
                      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">
                        開催中の「{activeLimitEvent.name}」は総合力が{" "}
                        {activeLimitEvent.powerLimit.toLocaleString()}{" "}
                        で頭打ちですが、
                        <b>
                          上限を切っているので実際より高いポイントが出ています
                        </b>
                        。
                        いま走るための順位を見るなら、上のスイッチを入れてください。
                      </p>
                    )}
                    {capPreview && limitEvent && (
                      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">
                        <b>いま開催中のイベントに総合力の上限はありません。</b>
                        {limitEvent.powerLimit.toLocaleString()} で頭打ちにした
                        「次のワールドリンクの下見」の順位を出しています。
                        いま走るための順位を見るなら、上のスイッチを切ってください。
                      </p>
                    )}
                    {powerOverCap && limitEvent && activeLimitEvent && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                        入力した総合力が上限を超えているので、
                        <b>
                          {limitEvent.powerLimit.toLocaleString()}{" "}
                          として計算しています
                        </b>
                        。 この帯では総合力を伸ばしても1点も増えないため、
                        <b>並ぶ曲の順番も上限なしのときとは変わります</b>。
                      </p>
                    )}
                  </div>
                )}
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
              <Field
                label="リーダー（%）"
                hint="ついぼ表記の1つ目。編成の一番左のカード"
              >
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
              <Field
                label="内部値"
                hint="ついぼ表記の2つ目。編成5枚のスコアアップ合計"
              >
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
              {(mode === "manual" || mode === "solo") && (
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
                      : // ★ ひとりで周回はロスが順位を動かすので「表示にだけ使う」とは書かない。
                        mode === "solo"
                        ? soloLossProvisional
                          ? `ロード・リザルトの合計。既定の${DEFAULT_OVERHEAD_SEC.solo}秒はまだ測っていない仮の値`
                          : "ロード・リザルトの合計"
                        : // ★ 区間モードではロスで回せる回数が変わり、順位も変わる（検分 T5）
                          isWindow
                          ? "ロード・リザルトの合計。区間で回せる回数が変わる"
                          : "ロード・リザルトの合計。所要時間の表示にだけ使う"
                  }
                >
                  <NeuInput
                    inputMode="numeric"
                    value={overheadValue}
                    onChange={(e) => {
                      const v = onlyDigits(e.target.value);
                      // ひとりで周回だけ別の欄に書く（みんなで周回の値を持ち込まない・持ち出さない）
                      if (mode === "solo") {
                        setOverheadSolo(v);
                        persist({ overheadSolo: v });
                      } else {
                        setOverhead(v);
                        persist({ overhead: v });
                      }
                    }}
                  />
                </Field>
              )}
            </div>

            <div className="mt-4">
              <span className="text-xs text-slate-500">
                この編成の実効値は{" "}
                <span className="font-bold text-slate-700 tabular-nums">
                  {multiEffectiveSkill(
                    Number(skillLeader) || 0,
                    Number(skillTotal) || 0,
                  ).toFixed(1)}
                </span>
                {mode === "manual"
                  ? "（みんなでライブで発動する値）"
                  : "（みんなでライブ用。このタブでは使いません）"}
              </span>
              <InfoNote label="内部値と実効値について">
                <p>
                  ついぼの「
                  <span className="font-bold text-slate-600">150/710/31.3</span>
                  」表記は、 リーダー150%／内部値710／総合力31.3万 の意味です。
                  <span className="font-bold text-slate-600">内部値</span>
                  はリーダーを含む編成5枚のスコアアップ合計。
                </p>
                <p className="mt-2">
                  <span className="font-bold text-slate-600">実効値</span>
                  はみんなでライブで実際に発動する値で、
                  <code>リーダー + (内部値 − リーダー) × 0.2</code> で出ます。
                  リーダーは100%、サブ4枚は各20%しか効かないためです。
                  この例なら 150 + 560 × 0.2 ={" "}
                  <span className="font-bold text-slate-600">262</span>。
                </p>
                <p className="mt-2">
                  ソロ（ひとりで・オート・チャレライのタブ）は別勘定で、編成5枚が1回ずつ発動するので
                  内部値 ÷ 5
                  が平均、最後の6回目だけリーダーがもう1回発動します。 そのため
                  <span className="font-bold text-slate-600">
                    ソロでは内部値が、みんなでライブではリーダーが効きます
                  </span>
                  。
                </p>
              </InfoNote>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {note.skillHint}
            </p>
            {mode !== "challenge" && (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                イベントポイントの式にスコアが入るため、
                <span className="font-bold text-slate-600">
                  総合力によって順位が入れ替わります
                </span>
                。総合力が低いうちは基礎点と曲の短さがほぼ全てですが、
                高くなるほど譜面そのものの質が効いてきます。
              </p>
            )}
          </>
        )}
      </Panel>

      {/* ★ 開いたままだった（約 730 字）。閉じた段にし、見出しだけで中身が分かるようにする（UX 監査 2026-11-12、PR-4） */}
      <details className="neu-panel p-4 sm:p-6">
        <summary className="cursor-pointer text-base font-bold text-slate-700">
          <span>この数字について</span>
          <span className="ml-2 text-xs font-normal text-slate-500">
            タブの考え方・スコアとPtの式・AP 前提・入れていないもの・効率難易度との違い
          </span>
        </summary>
        <ul className="mt-4 space-y-2 text-xs leading-relaxed text-slate-500">
          {/* ★ タブの下の説明は 1 行に縮めたので、元の説明はここに 4 タブぶん並べる（2026-11-19。消さない） */}
          <li>
            <span className="font-bold text-slate-600">タブの考え方</span>
            <ul className="mt-1 space-y-1">
              {/* ひとりでの「1回あたり」は、ひとりでの次の行に出す（2026-11-25） */}
              {MODE_OPTIONS.flatMap((o) =>
                o.value === "solo"
                  ? [MODE_NOTE.solo, SOLO_PER_PLAY_NOTE]
                  : [MODE_NOTE[o.value]],
              ).map((n) => (
                <li key={n.headline}>
                  <span className="font-bold text-slate-600">{n.headline}</span>
                  ：{n.detail}
                </li>
              ))}
            </ul>
          </li>
          <li>
            この順位は<span className="font-bold text-slate-600">1枠補正と巻き込みを含みません</span>
            。スキルの発動位置を平均で置いた計算なので、2〜5枠での実感に近い数字です。
            1枠を取って巻き込みまで決める場合は低い難易度がもっと強くなることがあり、
            コミュニティで見かける「効率難易度」はそちらの理想値を指しています。
          </li>
          <li>
            スコアは{" "}
            <code>(base + Σ 実効スキル% × 枠重み ÷ 100) × 総合力 × 4</code>{" "}
            で計算しています。base と枠重みは楽曲ごとの実データで、
            譜面上のスキル発動位置が反映されています。タブごとに使うデータを変えていて、
            「みんなで」のタブはみんなでライブ用（フィーバー加点込み）、「オート」はオート用、「ひとりで」と「チャレライ」はソロ用です。
          </li>
          <li>
            イベントポイントの式は
            <span className="font-bold text-slate-600">ソロとみんなでライブで別物</span>
            です。ソロ・オートは <code>100 + floor(スコア/20000)</code>、みんなでライブは{" "}
            <code>
              110 + floor(自スコア/17000) + min(16, floor(他4人合計/340000))
            </code>
            。
            他4人のスコアは分からないので、ここでは自分と同格の4人（自分のスコア×4）と置いています。
            表の Pt/時 はその前提の値で、実際の部屋の顔ぶれで上下します（他4人が強ければ上がり、弱ければ下がります）。
          </li>
          <li>
            スキルは1曲のなかで
            <span className="font-bold text-slate-600">6回</span>発動します。
            カードは5枚・部屋も5人ですが、最後にもう1回あるので6回です
            （ソロならリーダーがもう1回、みんなでライブならアンコール）。 skill_score_*
            のデータが長さ6の配列なのもそのためです。
          </li>
          <li>
            全ノーツPERFECT（AP）を前提にした理論値です。判定係数は GREAT で 0.7
            まで落ちるので、
            <span className="font-bold text-slate-600">
              叩けない譜面は表より不利になります
            </span>
            。
            上の「絞り込み」の譜面レベルで自分が安定してAPできる範囲に絞ると、実際の選曲に近づきます。
          </li>
          <li>
            スキルの発動位置は楽曲ごとに決まっていますが、
            <span className="font-bold text-slate-600">
              1〜5回目に誰のスキルが来るかはランダム
            </span>
            で選べません。そのため平均で計算しており、
            発動順を厳選しても曲どうしの順位は変わりません（全曲に同じ係数が掛かるだけ）。
          </li>
          <li>
            みんなでライブの活躍ボーナス（スコアに少し足される加点）は入れていません。
            どの曲にもほぼ一律に乗るぶんなので順位はほとんど動きませんが、表示Ptは実際よりわずかに低めです。
          </li>
        </ul>
      </details>
    </ToolPage>
  );
}
