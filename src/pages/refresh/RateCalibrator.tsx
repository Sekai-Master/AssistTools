import { useState } from "react";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { DurationInput } from "../../components/ui/DurationInput";
import { TakiInput } from "../../components/ui/TakiInput";
import { paceFromRate, rateFromPerPlay, rateFromRun } from "./lib/rateTools";

/**
 * 点数時速・周回ペースを実測から出す道具。**稼働時間計算と周回プランで共有する。**
 *
 * ★ 元は「ここまでの実績から時速を較正する」というブロックが両ページに丸ごと
 *   コピペされていた。方式を増やすとコピペも増えて必ず片方だけ古くなるので、
 *   増やすのと同時に1つに寄せた。
 *
 * ★ 3方式を並べると画面が埋まるので、**一度に見えるのは1方式だけ**にしている
 *   （切り替えは上のセグメント）。畳んだ `<details>` の中に入れているのも同じ理由で、
 *   普段使うのは上の「点数時速」欄への直接入力だから。
 */
export interface RateCalibratorProps {
  hourlyRate: string;
  setHourlyRate: (v: string) => void;
  refTaki: number;
  setRefTaki: (v: number) => void;
  /** 周回ペース(回/時)。ページ側の入力欄と**同じ値**を渡す（別々に持たない）。 */
  pace: string;
  setPace: (v: string) => void;
}

type Mode = "run" | "perPlay" | "pace";

const MODES: { value: Mode; label: string }[] = [
  { value: "run", label: "実績から" },
  { value: "perPlay", label: "1回×ペース" },
  { value: "pace", label: "ペースを出す" },
];

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");

export function RateCalibrator({
  hourlyRate,
  setHourlyRate,
  refTaki,
  setRefTaki,
  pace,
  setPace,
}: RateCalibratorProps) {
  const [mode, setMode] = useState<Mode>("run");

  // 実績から
  const [runMin, setRunMin] = useState(60);
  const [runPts, setRunPts] = useState("");
  const [runTaki, setRunTaki] = useState(5);
  const runRate = rateFromRun(Number(runPts), runMin);

  // 1回の獲得pt（「1回×ペース」と「ペースを出す」で共有する。同じ実測値なので分けない）
  const [perPlay, setPerPlay] = useState("");
  const [perPlayTaki, setPerPlayTaki] = useState(5);
  const fromPerPlay = rateFromPerPlay(Number(perPlay), Number(pace));
  const derivedPace = paceFromRate(Number(hourlyRate), Number(perPlay));

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-slate-500">
        時速・周回ペースを実測から出す
      </summary>

      <div className="mt-3 space-y-3">
        <SegmentedControl options={MODES} value={mode} onChange={setMode} />

        {mode === "run" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <DurationInput value={runMin} onChange={setRunMin} />
            <span className="text-slate-500">で</span>
            <NeuInput
              inputMode="numeric"
              value={runPts}
              onChange={(e) => setRunPts(onlyDigits(e.target.value))}
              placeholder="獲得pt"
              className="max-w-44 text-center"
              aria-label="この時間で稼いだポイント"
            />
            <span className="text-slate-500">pt（焚き</span>
            <TakiInput value={runTaki} onChange={setRunTaki} />
            <span className="text-slate-500">）</span>
            <NeuButton
              className="!py-1 !text-xs"
              disabled={runRate === null}
              onClick={() => {
                if (runRate === null) return;
                setHourlyRate(String(Math.round(runRate)));
                setRefTaki(runTaki);
              }}
            >
              → 時速
              {runRate === null ? "?" : Math.round(runRate).toLocaleString()}
              にする
            </NeuButton>
          </div>
        )}

        {mode === "perPlay" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">1回</span>
              <NeuInput
                inputMode="numeric"
                value={perPlay}
                onChange={(e) => setPerPlay(onlyDigits(e.target.value))}
                placeholder="獲得pt"
                className="max-w-36 text-center"
                aria-label="1回の獲得ポイント"
              />
              <span className="text-slate-500">pt（焚き</span>
              <TakiInput value={perPlayTaki} onChange={setPerPlayTaki} />
              <span className="text-slate-500">）× ペース</span>
              <NeuInput
                inputMode="numeric"
                value={pace}
                onChange={(e) => setPace(onlyDigits(e.target.value))}
                className="max-w-20 text-center"
                aria-label="周回ペース"
              />
              <span className="text-slate-500">回/時</span>
              <NeuButton
                className="!py-1 !text-xs"
                disabled={fromPerPlay === null}
                onClick={() => {
                  if (fromPerPlay === null) return;
                  setHourlyRate(String(Math.round(fromPerPlay)));
                  setRefTaki(perPlayTaki);
                }}
              >
                → 時速
                {fromPerPlay === null
                  ? "?"
                  : Math.round(fromPerPlay).toLocaleString()}
                にする
              </NeuButton>
            </div>
            {/* ペースは上の「周回ペース」欄と同じ値。別々に持つと食い違うので繋いである。 */}
            <p className="text-xs text-slate-400">
              ペースは上の「周回ペース」と同じ値です（ここで直すとあちらも変わります）。
            </p>
          </div>
        )}

        {mode === "pace" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">
                時速 {(Number(hourlyRate) || 0).toLocaleString()} ÷ 1回
              </span>
              <NeuInput
                inputMode="numeric"
                value={perPlay}
                onChange={(e) => setPerPlay(onlyDigits(e.target.value))}
                placeholder="獲得pt"
                className="max-w-36 text-center"
                aria-label="1回の獲得ポイント"
              />
              <span className="text-slate-500">pt</span>
              <NeuButton
                className="!py-1 !text-xs"
                disabled={derivedPace === null}
                onClick={() => {
                  if (derivedPace === null) return;
                  setPace(String(Math.round(derivedPace)));
                }}
              >
                → ペース{derivedPace === null ? "?" : Math.round(derivedPace)}
                回/時 にする
              </NeuButton>
            </div>
            {/* ★ ここだけは前提の説明が要る。焚き数が揃っていないと黙って狂う。
                いま設定されている基準焚き数を出して、突き合わせられるようにする。 */}
            <p className="text-xs text-slate-400">
              上の時速は<span className="font-bold">焚き{refTaki}</span>
              での値です。1回の獲得ptも
              <span className="font-bold">同じ焚き数で測った値</span>
              を入れてください（ペース自体は焚き数に依りません）。
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
