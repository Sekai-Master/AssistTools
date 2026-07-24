import { useState } from "react";
import { Field } from "../../../components/ui/Field";
import { NeuInput } from "../../../components/ui/NeuInput";
import { NeuButton } from "../../../components/ui/NeuButton";
import { SongSearchModal } from "../../../components/SongSearchModal";
import { onJacketError } from "../../../lib/img";
import { lastPlayFieldVisibility, type LastPlayMode } from "../lib/lastPlay";
import type { AliasEntry } from "../../bingo/useBingoMusics";
import type { SuggestMusic } from "./liveAdjust/types";

const MODE_LABEL: Record<LastPlayMode, string> = {
  none: "指定しない",
  earn: "希望Ptを稼ぐ",
  scoreZero: "スコア0でクリア",
};

/**
 * Step3（ラストプレイ）入力UI。3択（指定しない/希望Ptを稼ぐ/スコア0でクリア）と
 * 出し分けは lib/lastPlay.ts の lastPlayFieldVisibility に従う（R5 §1）。
 * PointAnalyzer.tsx の800行対策として入力フォーム部分をここへ切り出した。
 */
export function LastPlaySettings({
  mode,
  onModeChange,
  finalText,
  onFinalTextChange,
  songId,
  onSongChange,
  musics,
  aliases,
  jacketBase,
}: {
  mode: LastPlayMode;
  onModeChange: (mode: LastPlayMode) => void;
  finalText: string;
  onFinalTextChange: (value: string) => void;
  songId: string;
  onSongChange: (id: string) => void;
  musics: ReadonlyArray<SuggestMusic>;
  aliases: AliasEntry[];
  jacketBase: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const visibility = lastPlayFieldVisibility(mode);
  const selectedSong = musics.find((m) => m.id === songId);

  return (
    <Field label="ラストプレイ" hint="最後の1本をどう終えるか。未選択曲はエビ（基礎点100）を自動割当します">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABEL) as LastPlayMode[]).map((m) => (
          <NeuButton
            key={m}
            active={mode === m}
            className="flex-1 !text-xs sm:flex-none sm:!text-sm"
            onClick={() => onModeChange(m)}
          >
            {MODE_LABEL[m]}
          </NeuButton>
        ))}
      </div>

      {visibility.showSong && (
        <div className="mt-3 flex items-center gap-3">
          {selectedSong ? (
            <img
              src={`${jacketBase}${selectedSong.jacketLink}`}
              alt=""
              className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0"
              onError={onJacketError}
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-700">
              {selectedSong ? selectedSong.title : "未選択（エビ）"}
            </p>
            {selectedSong && <p className="text-xs text-slate-500">基礎点 {selectedSong.basePoint}</p>}
          </div>
          <NeuButton className="!px-3 !py-1.5 !text-xs shrink-0" onClick={() => setModalOpen(true)}>
            曲を選択
          </NeuButton>
        </div>
      )}

      {visibility.showPtInput && (
        <div className="mt-3">
          <NeuInput
            inputMode="numeric"
            value={finalText}
            onChange={(e) => onFinalTextChange(e.target.value)}
            placeholder="例: 1005（無ければ0）"
          />
        </div>
      )}

      {mode === "scoreZero" && (
        <p className="mt-2 text-xs text-slate-500">
          最後の1本を叩かずスコア0で終える締め方です。獲得Ptは計算時に自動算出されます。
        </p>
      )}

      {modalOpen && (
        <SongSearchModal
          musics={[...musics]}
          aliases={aliases}
          jacketBase={jacketBase}
          title="ラストプレイの楽曲を選択"
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            onSongChange(m.id);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Field>
  );
}
