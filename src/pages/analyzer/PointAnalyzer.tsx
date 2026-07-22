import { useEffect, useMemo, useRef, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { ActionButton } from "../../components/ui/ActionButton";
import { NeuButton } from "../../components/ui/NeuButton";
import { Switch } from "../../components/ui/Switch";
import { SongSearchModal } from "../../components/SongSearchModal";
import { useAnalyzerMusics } from "./useAnalyzerMusics";
import { calculatePlanV6, ENVY_ID, type CalculationResultV6 } from "./lib/calculator";
import { calculateUnitBasePt } from "./lib/mySekai";
import { parseAmount, completeTargetSuffix } from "./lib/inputParsing";
import { MySekaiStep } from "./steps/MySekaiStep";
import { LiveAdjustStep } from "./steps/LiveAdjustStep";
import { FinalRunStep } from "./steps/FinalRunStep";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

export default function PointAnalyzer() {
  const { musics, aliases, loading } = useAnalyzerMusics();

  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [final, setFinal] = useState("");
  const [talent, setTalent] = useState("");
  const [bonus, setBonus] = useState("");
  const [hasWorldPass, setHasWorldPass] = useState(false);
  const [songId, setSongId] = useState(ENVY_ID);
  const [songModalOpen, setSongModalOpen] = useState(false);
  const [result, setResult] = useState<CalculationResultV6 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // 計算ボタン押下時だけ結果へスクロールする（Step3の曲変更での再計算では飛ばない）。
  const scrollOnResult = useRef(false);

  const bonusNum = parseAmount(bonus, true);

  useEffect(() => {
    if (!result || !scrollOnResult.current) return;
    scrollOnResult.current = false;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [result]);

  // 入力中のマイセカイ単価ヒント
  const unitHint = useMemo(
    () => calculateUnitBasePt(parseAmount(talent), bonusNum, hasWorldPass),
    [talent, bonusNum, hasWorldPass]
  );

  const selectedSong = musics.find((m) => m.id === songId);
  const musicList = useMemo(
    () => musics.map((m) => ({ id: m.id, basePoint: m.basePoint })),
    [musics]
  );

  const handleCalc = () => {
    if (musics.length === 0)
      return reject("楽曲データを読み込み中です。少し待ってから再度お試しください。");
    const c = parseAmount(current);
    const tv = parseAmount(target);
    const f = parseAmount(final);
    const tal = parseAmount(talent);
    const bon = parseAmount(bonus, true);
    if (tv <= c) return reject("目標ポイントは現在ポイントより大きくしてください。");
    if (!Number.isFinite(tal) || tal < 0) return reject("総合力は0以上で入力してください。");
    if (!Number.isFinite(bon) || bon < 0 || bon > 1000)
      return reject("イベントボーナスは0〜1000%で入力してください。");
    if (f > tv - c) return reject("最終獲得希望ポイントが差分を超えています。");
    setError(null);
    scrollOnResult.current = true;
    setResult(calculatePlanV6(c, tv, f, tal, bon, hasWorldPass, songId, musicList));
  };

  // Step3で楽曲を変えたときの再計算（検証済み前提・スクロールはしない）。
  const recalcWithSong = (newId: string) => {
    setSongId(newId);
    if (!result) return;
    setResult(
      calculatePlanV6(
        parseAmount(current),
        parseAmount(target),
        parseAmount(final),
        parseAmount(talent),
        bonusNum,
        hasWorldPass,
        newId,
        musicList
      )
    );
  };

  function reject(msg: string) {
    setResult(null);
    setError(msg);
  }

  const handleTargetBlur = () => {
    const completed = completeTargetSuffix(current, target);
    if (completed !== null) setTarget(completed);
  };

  return (
    <ToolPage unit="n25" title="ポイント調整アナライザー" icon="analytics">
      <Panel title="ポイント設定">
        <div className="space-y-4">
          <Field label="現在ポイント" htmlFor="pa-current">
            <NeuInput
              id="pa-current"
              inputMode="numeric"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="例: 12,345,678"
            />
          </Field>
          <Field
            label="目標ポイント"
            htmlFor="pa-target"
            hint="下の桁だけ入力すると上の桁を自動補完（例: 311005 → 128,311,005）"
          >
            <NeuInput
              id="pa-target"
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={handleTargetBlur}
              placeholder="例: 13,000,000"
            />
          </Field>
          <Field label="最終獲得希望ポイント（任意）" htmlFor="pa-final">
            <NeuInput
              id="pa-final"
              inputMode="numeric"
              value={final}
              onChange={(e) => setFinal(e.target.value)}
              placeholder="例: 1005（無ければ0）"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="環境設定">
        <div className="space-y-4">
          <Field label="総合力" htmlFor="pa-talent">
            <NeuInput
              id="pa-talent"
              inputMode="numeric"
              value={talent}
              onChange={(e) => setTalent(e.target.value)}
              placeholder="例: 350,000"
            />
          </Field>
          <Field label="イベントボーナス (%)" htmlFor="pa-bonus">
            <NeuInput
              id="pa-bonus"
              inputMode="decimal"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              placeholder="例: 250.5"
            />
          </Field>
          <Switch checked={hasWorldPass} onChange={setHasWorldPass} label="ワールドパス 有効" />
          <p className="text-sm text-slate-500">
            マイセカイ単価（自動算出）:{" "}
            <span className="font-bold" style={{ color: "var(--unit-color)" }}>
              {unitHint} Pt/個
            </span>
          </p>
          <Field label="最終楽曲" hint={loading ? "楽曲データ読込中…" : `${musics.length}曲から選択`}>
            <div className="flex items-center gap-3">
              {selectedSong ? (
                <img
                  src={`${JACKET_BASE}${selectedSong.jacketLink}`}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate font-bold text-slate-700">
                  {selectedSong ? selectedSong.title : "未選択"}
                </p>
                {selectedSong && (
                  <p className="text-xs text-slate-400">基礎点 {selectedSong.basePoint}</p>
                )}
              </div>
              <NeuButton className="!px-3 !py-1.5 !text-xs shrink-0" onClick={() => setSongModalOpen(true)}>
                曲を選択
              </NeuButton>
            </div>
          </Field>
        </div>
      </Panel>

      <ActionButton onClick={handleCalc} disabled={loading} className="w-full text-base">
        {loading ? "楽曲データ読込中…" : "計算する"}
      </ActionButton>

      {error && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {error}
        </div>
      )}

      <div ref={resultRef} className="scroll-mt-20 space-y-6 empty:hidden">
        {result && (
          <>
            {!result.isVerified && result.targetPt - result.finalEstimatedPt > 0 && (
              <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
                <p className="font-bold">この条件では目標ちょうどに着地できません</p>
                <p className="mt-1 text-xs">
                  {(result.targetPt - result.finalEstimatedPt).toLocaleString()} Pt
                  の差が埋まりません。目標を数ポイントずらすか、ボーナスを調整してください。
                </p>
              </div>
            )}
            <MySekaiStep result={result} />
            <LiveAdjustStep result={result} />
            {result.finalRunPt > 0 && (
              <FinalRunStep
                result={result}
                musics={musics}
                aliases={aliases}
                jacketBase={JACKET_BASE}
                bonus={bonusNum}
                selectedSong={selectedSong}
                onChangeSong={recalcWithSong}
              />
            )}
          </>
        )}
      </div>

      {songModalOpen && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          title="最終楽曲を選択"
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            setSongId(m.id);
            setSongModalOpen(false);
          }}
          onClose={() => setSongModalOpen(false)}
        />
      )}
    </ToolPage>
  );
}

