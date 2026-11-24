import { useState } from "react";
import { DurationInput } from "../../components/ui/DurationInput";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { cn } from "../../lib/utils";
import { fmtDuration } from "./lib/format";
import { type Segment, targetPercentOf } from "./lib/timeline";

type LengthSegment = Extract<Segment, { kind: "play" | "rest" }>;
/** auto は休憩の「自動」、end は最後の稼働の「イベ乙まで」（lib/fitToEnd.ts）。 */
type Mode = "time" | "gauge" | "auto" | "end";

const TIME_GAUGE: { value: Mode; label: string }[] = [
  { value: "time", label: "時間" },
  { value: "gauge", label: "ゲージ" },
];
const REST_OPTIONS: { value: Mode; label: string }[] = [...TIME_GAUGE, { value: "auto", label: "自動" }];
const LAST_PLAY_OPTIONS: { value: Mode; label: string }[] = [...TIME_GAUGE, { value: "end", label: "イベ乙まで" }];

const ARIA_LABEL: Record<LengthSegment["kind"], string> = {
  play: "稼働の長さの決め方",
  rest: "休憩の長さの決め方",
};

/** 稼働・休憩ブロックに書き戻す値。targetPercent・fitToEnd・untilEnd を undefined にすると時間に戻る。 */
export interface BlockLengthPatch {
  minutes?: number;
  targetPercent?: number;
  fitToEnd?: boolean;
  untilEnd?: boolean;
}

/**
 * 稼働・休憩ブロックの長さの決め方。「時間」で積むか、「ゲージ」（このブロックの終わりのゲージ%）を入れて時間を逆算するか。
 * - 稼働はちょうど入れた%で終わる。休憩は30分ごとに一段ずつ下がるので、入れた%以下になる段まで休み、休んだ後の%も出す
 * ★ 切り替えでは、時間→ゲージ はいまの終わりのゲージを、ゲージ→時間 は逆算した分を引き継ぐ。
 *   稼働はこれでプランが動かない。休憩はゲージが30分ごとの段なので、動かないのは段が下がった瞬間に終わる長さ
 *   （進捗 0 なら 30 分の倍数）のときだけ。それ以外は段が下がった所までに縮み、端数のタイマーは落ちる
 *   （例: 進捗 0 の 45 分 → 30 分・タイマー 0。10 分 → 0 分で、時間に戻しても 10 分は戻らない。検分 #285 M、この動きのまま）。
 *   休憩の%は 0.1 刻みで切り上げて渡す（切り捨てると、ちょうど段の値の少し下になり 1 段多く休む）
 */
export function BlockLength({
  seg,
  minutes,
  endPercent,
  isLast = false,
  unsolved = false,
  onChange,
}: {
  seg: LengthSegment;
  /** このブロックの長さ（ゲージ・自動・イベ乙までで決めるときは逆算した分）。 */
  minutes: number;
  /** このブロックの終わりのゲージ%。 */
  endPercent: number;
  /** 最後のブロックか。稼働の「イベ乙まで」は最後のときだけ選べる */
  isLast?: boolean;
  /** 自動・イベ乙までの長さを決められない（イベ乙の時刻が分からない・自動が 2 つ以上など）。長さを「—」にする */
  unsolved?: boolean;
  onChange: (patch: BlockLengthPatch) => void;
}) {
  const target = targetPercentOf(seg);
  const mode: Mode =
    seg.kind === "rest" && seg.fitToEnd
      ? "auto"
      : seg.kind === "play" && seg.untilEnd && isLast
        ? "end"
        : target == null
          ? "time"
          : "gauge";
  const options = seg.kind === "rest" ? REST_OPTIONS : isLast ? LAST_PLAY_OPTIONS : TIME_GAUGE;
  const clear = { targetPercent: undefined, fitToEnd: undefined, untilEnd: undefined };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "auto") return onChange({ fitToEnd: true });
    if (next === "end") return onChange({ untilEnd: true });
    if (next === "gauge") {
      const tenth = endPercent * 10;
      const rounded = seg.kind === "rest" ? Math.ceil(tenth - 1e-6) : Math.round(tenth);
      return onChange({ ...clear, targetPercent: Math.min(100, rounded / 10) });
    }
    // 時間へ: いまの長さを引き継ぐ。決められずに「—」のときは、前に時間で入れていた分のまま
    onChange({ ...clear, minutes: unsolved && (mode === "auto" || mode === "end") ? seg.minutes : Math.round(minutes) });
  };

  const length = <span className="font-num font-bold text-slate-700">{unsolved ? "—" : fmtDuration(minutes)}</span>;

  return (
    <>
      <SegmentedControl
        options={options}
        value={mode}
        onChange={switchMode}
        ariaLabel={ARIA_LABEL[seg.kind]}
        className={cn("shrink-0", options === LAST_PLAY_OPTIONS ? "w-64" : options === REST_OPTIONS ? "w-56" : "w-40")}
        buttonClassName={cn("min-h-11 whitespace-nowrap", options === LAST_PLAY_OPTIONS && "px-1")}
      />
      {mode === "auto" || mode === "end" ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          {length}
          {mode === "auto" && !unsolved && (
            <span className="font-num text-sm text-slate-500">→ {endPercent.toFixed(1)}%</span>
          )}
        </span>
      ) : target == null ? (
        <DurationInput value={seg.minutes} onChange={(v) => onChange({ minutes: v })} />
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2">
          <PercentInput value={target} onChange={(v) => onChange({ targetPercent: v })} />
          <span className="text-xs text-slate-500">%まで</span>
          <span className="font-num font-bold text-slate-700">{fmtDuration(minutes)}</span>
          {seg.kind === "rest" && (
            <span className="font-num text-sm text-slate-500">→ {endPercent.toFixed(1)}%</span>
          )}
        </span>
      )}
    </>
  );
}

/**
 * 目標のゲージ%（0〜100）。打ちかけの「37.」や空欄を消さないよう、打っている間の文字は手元に持つ（TakiInput と同じ）。
 * ★ スマホで拡大されないよう字は 16px、押せる高さは 44px。
 */
function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <NeuInput
      inputMode="decimal"
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() !== "" && Number.isFinite(n)) onChange(Math.max(0, Math.min(100, n)));
      }}
      onBlur={() => setDraft(null)}
      aria-label="目標のゲージ"
      className="w-20 px-2 text-center text-base"
    />
  );
}
