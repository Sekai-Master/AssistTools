import { useState } from "react";
import { StepSection } from "./StepSection";
import { NeuButton } from "../../../components/ui/NeuButton";
import { SongSearchModal } from "../../../components/SongSearchModal";
import type { AliasEntry } from "../../bingo/useBingoMusics";
import type { CalculationResultV6 } from "../lib/calculator";
import type { ModeAChoice } from "../lib/modeAChoices";
import { candidatesForBase, resolveSong } from "./liveAdjust/musicHelpers";
import { BonusSweepPanel } from "./liveAdjust/BonusSweepPanel";
import { PrimaryPlanPanel } from "./liveAdjust/PrimaryPlanPanel";
import { AdjustmentNgPanels } from "./liveAdjust/NgPanels";
import { isModeAOk, isModeBOk } from "./liveAdjust/modeStatus";
import type { Adopted, Step2Mode, SuggestMusic } from "./liveAdjust/types";
import type { TimeForBase } from "../lib/planDuration";

// モバイルで折り返さないよう対称・短文に（A=編成を組み替えて合わせる / B=現編成で曲を変えて合わせる）。
const STEP2_MODE_LABEL: Record<Step2Mode, string> = {
  songFixed: "編成で合わせる",
  bonusFixed: "曲で合わせる",
};

/**
 * Step2: ライブでの端数調整。R5でモードA（曲固定・ボーナス掃引）とモードB（曲可変・
 * 複数回）を排他2択に再編した（旧「同一曲縛り」「スコア0イベ乙」トグルは削除）。
 * 採択状態（adopted・songByBase・modeAChoice）は統合画像出力が必要とするため
 * 親（PointAnalyzer）が保持する。
 */
export function LiveAdjustStep({
  result,
  musics = [],
  aliases = [],
  jacketBase,
  step2Mode,
  onStep2ModeChange,
  step2Song,
  onChangeStep2Song,
  modeAChoices,
  modeAChoice,
  onSelectModeAChoice,
  adopted,
  onAdopt,
  songByBase,
  onSongByBaseChange,
}: {
  result: CalculationResultV6;
  musics?: ReadonlyArray<SuggestMusic>;
  aliases?: AliasEntry[];
  jacketBase: string;
  step2Mode: Step2Mode;
  onStep2ModeChange: (mode: Step2Mode) => void;
  step2Song?: SuggestMusic;
  onChangeStep2Song: (id: string) => void;
  modeAChoices: ModeAChoice[];
  modeAChoice: ModeAChoice | null;
  onSelectModeAChoice: (choice: ModeAChoice | null) => void;
  adopted: Adopted;
  onAdopt: (a: Adopted) => void;
  songByBase: Record<number, string>;
  onSongByBaseChange: (basePoint: number, songId: string) => void;
}) {
  const [pickerBase, setPickerBase] = useState<number | null>(null);

  const live = result.liveAdjustment;
  const multi = live.multi;
  // footer status修正（R6 §6-4）: live.status は A∨B の合成なので、選択中のモードでは
  // 実は組めていないのに「完了時ちょうど」を表示してしまう食い違いがあった。
  // 選択中モード単独の判定（modeStatus.ts・NgPanelsと共通）に揃える。
  const modeOk = step2Mode === "songFixed" ? isModeAOk(live) : isModeBOk(live, multi);
  const reached =
    result.currentPt +
    result.mySekaiAllocation.totalPt +
    (modeOk ? live.requiredPt : 0);

  // 基礎点 → 採択曲の秒数（planDurationSec に渡す純関数）。
  const timeForBase: TimeForBase = (basePoint) => {
    const chosen = resolveSong(candidatesForBase(musics, basePoint), songByBase, basePoint);
    return chosen && chosen.musicTime > 0 ? chosen.musicTime : undefined;
  };

  return (
    <StepSection
      unit="ln"
      title="② ライブ調整"
      footerLabel="このステップ完了時"
      footerValue={reached}
    >
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-bold" style={{ color: "var(--unit-color)" }}>
          {live.requiredPt.toLocaleString()}
        </span>{" "}
        Pt を獲得します。
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(STEP2_MODE_LABEL) as Step2Mode[]).map((m) => (
          <NeuButton
            key={m}
            active={step2Mode === m}
            className="flex-1 !text-xs sm:flex-none sm:!text-sm"
            onClick={() => onStep2ModeChange(m)}
          >
            {STEP2_MODE_LABEL[m]}
          </NeuButton>
        ))}
      </div>

      <AdjustmentNgPanels live={live} multi={multi} mode={step2Mode} onSwitchMode={onStep2ModeChange} />

      {step2Mode === "songFixed" ? (
        <BonusSweepPanel
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          song={step2Song}
          onChangeSong={onChangeStep2Song}
          choices={modeAChoices}
          selectedChoice={modeAChoice}
          onSelectChoice={onSelectModeAChoice}
        />
      ) : (
        multi &&
        multi.status === "OK" &&
        multi.plans.length > 0 && (
          <PrimaryPlanPanel
            multi={multi}
            adopted={adopted}
            onAdopt={onAdopt}
            musics={musics}
            songByBase={songByBase}
            onPickSong={setPickerBase}
            timeForBase={timeForBase}
            finalRunPt={result.finalRunPt}
          />
        )
      )}

      {pickerBase !== null && (
        <SongSearchModal
          musics={musics.filter((m) => m && m.basePoint === pickerBase)}
          aliases={aliases}
          jacketBase={jacketBase}
          title={`基礎点 ${pickerBase} の曲を選択`}
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            onSongByBaseChange(pickerBase, m.id);
            setPickerBase(null);
          }}
          onClose={() => setPickerBase(null)}
        />
      )}
    </StepSection>
  );
}
