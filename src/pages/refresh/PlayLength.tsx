import { useState } from "react";
import { DurationInput } from "../../components/ui/DurationInput";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { fmtDuration } from "./lib/format";
import { type Segment, playTargetOf } from "./lib/timeline";

type PlaySegment = Extract<Segment, { kind: "play" }>;
type Mode = "time" | "gauge";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "time", label: "時間" },
  { value: "gauge", label: "ゲージ" },
];

/** 稼働ブロックに書き戻す値。targetPercent: undefined で時間に戻す。 */
export type PlayLengthPatch = Partial<Pick<PlaySegment, "minutes" | "targetPercent">>;

/**
 * 稼働ブロックの長さの決め方。「時間」で積むか、「ゲージ」（このブロックの終わりのゲージ%）を入れて時間を逆算するか。
 * ★ 切り替えでプランが動かないようにする。時間→ゲージ はいまの終わりのゲージを、ゲージ→時間 は逆算した分を引き継ぐ。
 */
export function PlayLength({
  seg,
  minutes,
  endPercent,
  onChange,
}: {
  seg: PlaySegment;
  /** このブロックの長さ（ゲージで決めるときは逆算した分）。 */
  minutes: number;
  /** このブロックの終わりのゲージ%。 */
  endPercent: number;
  onChange: (patch: PlayLengthPatch) => void;
}) {
  const target = playTargetOf(seg);
  const mode: Mode = target == null ? "time" : "gauge";

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "gauge") {
      onChange({ targetPercent: Math.round(endPercent * 10) / 10 });
    } else {
      onChange({ minutes: Math.round(minutes), targetPercent: undefined });
    }
  };

  return (
    <>
      <SegmentedControl
        options={MODE_OPTIONS}
        value={mode}
        onChange={switchMode}
        ariaLabel="稼働の長さの決め方"
        className="w-40 shrink-0"
        buttonClassName="min-h-11 whitespace-nowrap"
      />
      {target == null ? (
        <DurationInput value={seg.minutes} onChange={(v) => onChange({ minutes: v })} />
      ) : (
        <span className="inline-flex items-center gap-2">
          <PercentInput value={target} onChange={(v) => onChange({ targetPercent: v })} />
          <span className="text-xs text-slate-500">%まで</span>
          <span className="font-num font-bold text-slate-700">{fmtDuration(minutes)}</span>
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
