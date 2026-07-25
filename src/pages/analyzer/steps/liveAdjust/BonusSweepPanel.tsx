import { useState } from "react";
import { NeuButton } from "../../../../components/ui/NeuButton";
import { SongSearchModal } from "../../../../components/SongSearchModal";
import { onJacketError } from "../../../../lib/img";
import type { AliasEntry } from "../../../bingo/useBingoMusics";
import type { ModeAChoice } from "../../lib/modeAChoices";
import { ModeAChoicePanel } from "./ModeAChoicePanel";
import type { SuggestMusic } from "./types";

/**
 * Step2 モードA（任意の曲＋ボーナス選択）のパネル。
 *
 * 曲を1曲固定し、候補リスト（buildModeAChoices・R6 モードA選択肢提示型）を
 * ModeAChoicePanel で提示する。既定選択（候補[0]＝編成そのまま）へのフォールバックは
 * ここで行う（旧 effectiveSweepPlan と同一パターン）。ボーナス逆引き（どのカードで
 * 組むか）のエンジンは作らない（楽曲マスタしか持たないツールの責務外）。
 */
export function BonusSweepPanel({
  musics,
  aliases,
  jacketBase,
  song,
  onChangeSong,
  choices,
  selectedChoice,
  onSelectChoice,
}: {
  musics: ReadonlyArray<SuggestMusic>;
  aliases: AliasEntry[];
  jacketBase: string;
  song?: SuggestMusic;
  onChangeSong: (id: string) => void;
  choices: ModeAChoice[];
  selectedChoice: ModeAChoice | null;
  onSelectChoice: (choice: ModeAChoice | null) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const jacketSrc = song ? `${jacketBase}${song.jacketLink}` : undefined;
  // 既定選択（先頭＝編成そのまま）へのフォールバック。正本は PointAnalyzer の
  // effectiveModeAChoice で、そこで解決済みの selectedChoice が渡る現配線ではここは
  // 保険（親が null を渡した場合のみ発火）。表示と画像の既定を割らないため式を親と一致させる。
  const effective = selectedChoice ?? choices[0] ?? null;

  return (
    <div className="mb-2">
      <div className="mb-3 flex items-center gap-3">
        {jacketSrc ? (
          <img
            src={jacketSrc}
            alt=""
            className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0"
            onError={onJacketError}
          />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-700">{song ? song.title : "楽曲未選択"}</p>
          <p className="text-xs text-slate-500">基礎点 {song?.basePoint ?? "-"}</p>
        </div>
        <NeuButton className="!px-3 !py-1.5 !text-xs shrink-0" onClick={() => setModalOpen(true)}>
          曲を変更
        </NeuButton>
      </div>

      {effective && <ModeAChoicePanel choices={choices} selected={effective} onSelect={onSelectChoice} />}

      {modalOpen && (
        <SongSearchModal
          musics={[...musics]}
          aliases={aliases}
          jacketBase={jacketBase}
          title="調整に使う楽曲を選択"
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            onChangeSong(m.id);
            onSelectChoice(null);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
