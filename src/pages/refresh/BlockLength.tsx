import { useState } from "react";
import { DurationInput } from "../../components/ui/DurationInput";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { fmtDuration } from "./lib/format";
import { type Segment, targetPercentOf } from "./lib/timeline";

type LengthSegment = Extract<Segment, { kind: "play" | "rest" }>;
type Mode = "time" | "gauge";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "time", label: "時間" },
  { value: "gauge", label: "ゲージ" },
];

const ARIA_LABEL: Record<LengthSegment["kind"], string> = {
  play: "稼働の長さの決め方",
  rest: "休憩の長さの決め方",
};

/** 稼働・休憩ブロックに書き戻す値。targetPercent: undefined で時間に戻す。 */
export type BlockLengthPatch = Partial<Pick<LengthSegment, "minutes" | "targetPercent">>;

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
  onChange,
}: {
  seg: LengthSegment;
  /** このブロックの長さ（ゲージで決めるときは逆算した分）。 */
  minutes: number;
  /** このブロックの終わりのゲージ%。 */
  endPercent: number;
  onChange: (patch: BlockLengthPatch) => void;
}) {
  const target = targetPercentOf(seg);
  const mode: Mode = target == null ? "time" : "gauge";

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "gauge") {
      const tenth = endPercent * 10;
      const rounded = seg.kind === "rest" ? Math.ceil(tenth - 1e-6) : Math.round(tenth);
      onChange({ targetPercent: Math.min(100, rounded / 10) });
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
        ariaLabel={ARIA_LABEL[seg.kind]}
        className="w-40 shrink-0"
        buttonClassName="min-h-11 whitespace-nowrap"
      />
      {target == null ? (
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
