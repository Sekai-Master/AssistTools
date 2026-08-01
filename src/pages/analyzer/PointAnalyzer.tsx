import { useEffect, useMemo, useRef, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { ActionButton } from "../../components/ui/ActionButton";
import { Switch } from "../../components/ui/Switch";
import { useAnalyzerMusics } from "./useAnalyzerMusics";
import { ENVY_ID, type CalculationOptionsV6, type CalculationResultV6 } from "./lib/calculator";
import { DEFAULT_BASE_POINT } from "./lib/constants";
import { calculateUnitBasePt } from "./lib/mySekai";
import { parseAmount, completeTargetSuffix } from "./lib/inputParsing";
import { byDistanceTo, recommendPlans } from "./lib/recommendPlans";
import { buildModeAChoices, type ModeAChoice } from "./lib/modeAChoices";
import {
  earnFinalPtError,
  planWithLastPlay,
  type LastPlayMode,
  type LastPlayOutcome,
} from "./lib/lastPlay";
import type { UniversalPlan } from "./plan/types";
import { MySekaiStep } from "./steps/MySekaiStep";
import { LiveAdjustStep } from "./steps/LiveAdjustStep";
import { FinalRunStep } from "./steps/FinalRunStep";
import { LastPlaySettings } from "./steps/LastPlaySettings";
import { PlanExportPanel } from "./steps/PlanExportPanel";
import type { Adopted, Step2Mode } from "./steps/liveAdjust/types";
import { JACKET_BASE } from "./assetPaths";
import { ProfileBar } from "../../components/ui/ProfileBar";
import { numOrUndef } from "../../lib/num";

/**
 * 計算実行時に固定した全入力のスナップショット（R6 §6-1）。
 *
 * 旧 appliedOptions / appliedBonus の2本の ref を1本に統合した。Step2の曲/モード変更
 * による再計算（recalcWithStep2Song / recalcWithStep2Mode）は、生の state を読まず
 * **必ずこのスナップショットだけ**から入力を組み立てる。生 state の読み取りを
 * handleCalc 以外で禁止することで、「計算後にトグルだけ触ってから曲を変える」ような
 * 操作で表示中の結果と違う条件が黙って混ざるのを防ぐ。
 */
interface AppliedInputs {
  current: number;
  target: number;
  talent: number;
  bonus: number;
  hasWorldPass: boolean;
  lastPlaySongId: string;
  lastPlayMode: LastPlayMode;
  finalText: string;
  options: CalculationOptionsV6;
}

export default function PointAnalyzer() {
  const { musics, aliases, loading, error: dataError } = useAnalyzerMusics();

  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [talent, setTalent] = useState("");
  const [bonus, setBonus] = useState("");
  const [hasWorldPass, setHasWorldPass] = useState(false);
  // R5: マイセカイ既定OFF（周回者の主用途に合わせる）。
  const [useMySekai, setUseMySekai] = useState(false);
  // スコア上限（詳細設定）。空欄・0以下・非数は undefined を渡し、lib 側の既定値に正規化させる。
  const [maxScoreInput, setMaxScoreInput] = useState("");

  // Step3（ラストプレイ）。3択の既定は「指定しない」。
  const [lastPlayMode, setLastPlayMode] = useState<LastPlayMode>("none");
  const [finalText, setFinalText] = useState("");
  const [lastPlaySongId, setLastPlaySongId] = useState(ENVY_ID);
  const [finalPlan, setFinalPlan] = useState<UniversalPlan | null>(null);

  // Step2（ライブ調整）。既定はモードA（任意の曲＋ボーナス選択）。
  const [step2Mode, setStep2Mode] = useState<Step2Mode>("songFixed");
  const [step2SongId, setStep2SongId] = useState(ENVY_ID);
  const [modeAChoice, setModeAChoice] = useState<ModeAChoice | null>(null);
  const [adopted, setAdopted] = useState<Adopted>({ kind: "primary" });
  const [songByBase, setSongByBase] = useState<Record<number, string>>({});

  const [state, setState] = useState<{ result: CalculationResultV6; lastPlay: LastPlayOutcome } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const scrollOnResult = useRef(false);
  // 計算実行時に固定した全入力のスナップショット（R6 §6-1）。null は「未計算」。
  const appliedInputs = useRef<AppliedInputs | null>(null);

  const bonusNum = parseAmount(bonus, true);

  useEffect(() => {
    if (!state || !scrollOnResult.current) return;
    scrollOnResult.current = false;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [state]);

  // 致命傷対策: 新しい計算結果が来るたびに Step2 の採択状態を初期化する。
  // 残額が変わった新しい結果に対して古い代替案の index が無言で横滑りするのを防ぐ。
  useEffect(() => {
    setAdopted({ kind: "primary" });
    setModeAChoice(null);
  }, [state]);

  const unitHint = useMemo(
    () => calculateUnitBasePt(parseAmount(talent), bonusNum, hasWorldPass),
    [talent, bonusNum, hasWorldPass]
  );

  const musicList = useMemo(
    () => musics.map((m) => ({ id: m.id, basePoint: m.basePoint })),
    [musics]
  );

  const step2Song = musics.find((m) => m.id === step2SongId);
  const finalSong = musics.find((m) => m.id === lastPlaySongId);

  // モードA選択肢提示型（R6 §1-4・§2）: 候補は state（liveAdjustment）と選択曲の基礎点から
  // 構築する純関数（buildModeAChoices）。既定選択（先頭＝編成そのまま）へのフォールバックは
  // effectiveModeAChoice で行う（旧 effectiveSweepPlan と同一パターン）。
  // モードB（bonusFixed）表示中は構築しない。calculator の base(=DEFAULT_BASE_POINT) と
  // UI の base(step2Song) が食い違うと sweep 表(~120万 calcLivePt)を UI スレッドで再構築し
  // 単一スロットキャッシュを奪う（破壊者 MEDIUM-3）。songFixed のときだけ構築する。
  const modeAChoices = useMemo(
    () =>
      state && step2Mode === "songFixed"
        ? buildModeAChoices({
            live: state.result.liveAdjustment,
            bonus: appliedInputs.current?.bonus ?? 0,
            base: step2Song?.basePoint ?? DEFAULT_BASE_POINT,
            useMySekai: state.result.useMySekai,
            maxScore: state.result.maxScore,
          })
        : [],
    [state, step2Song, step2Mode]
  );
  const effectiveModeAChoice = modeAChoice ?? modeAChoices[0] ?? null;

  const finalRecommended = useMemo(
    () =>
      state
        ? recommendPlans(state.result.finalRunPlans, byDistanceTo(appliedInputs.current?.bonus ?? 0))
        : [],
    [state]
  );
  const effectiveFinalPlan = finalPlan ?? finalRecommended[0] ?? null;

  const resolveBasePoint = (songId: string): number =>
    musicList.find((m) => m.id === songId)?.basePoint ?? DEFAULT_BASE_POINT;

  /**
   * Step2 モードAの基礎点の組み立て規則（R6 §6-2・弱点6の是正）。
   *
   * モードB（bonusFixed）表示中は隠れた曲選択（step2SongId）が計算に届かないよう、
   * songFixed のときだけ選択曲の基礎点を読む1本の funnel にする。
   * これで「モードB・非既定の step2SongId」でも既定曲と同じ計算条件になる。
   */
  const computeStep2ABase = (mode: Step2Mode, songId: string): number =>
    mode === "songFixed" ? resolveBasePoint(songId) : DEFAULT_BASE_POINT;

  /** appliedInputs スナップショットから calculatePlanV6 を1回呼び、結果を state に反映する。 */
  const recalcFromSnapshot = (snap: AppliedInputs, options: CalculationOptionsV6) => {
    appliedInputs.current = { ...snap, options };
    const { result, lastPlay } = planWithLastPlay(
      {
        currentPt: snap.current,
        targetPt: snap.target,
        talent: snap.talent,
        bonus: snap.bonus,
        hasWorldPass: snap.hasWorldPass,
        lastPlaySongId: snap.lastPlaySongId,
        musicsList: musicList,
        options,
      },
      snap.lastPlayMode,
      snap.finalText
    );
    setState({ result, lastPlay });
  };

  const handleCalc = () => {
    if (musics.length === 0)
      return reject("楽曲データを読み込み中です。少し待ってから再度お試しください。");
    const c = parseAmount(current);
    const tv = parseAmount(target);
    const tal = parseAmount(talent);
    const bon = parseAmount(bonus, true);
    if (tv <= c) return reject("目標ポイントは現在ポイントより大きくしてください。");
    if (!Number.isFinite(tal) || tal < 0) return reject("総合力は0以上で入力してください。");
    if (!Number.isFinite(bon) || bon < 0 || bon > 1000)
      return reject("イベントボーナスは0〜1000%で入力してください。");
    // 希望Ptの入力バリデーションは「希望Ptを稼ぐ」モードのときだけ意味を持つ（弱点5）。
    if (lastPlayMode === "earn") {
      const err = earnFinalPtError(finalText, tv - c);
      if (err) return reject(err);
    }
    setError(null);
    scrollOnResult.current = true;
    const ms = parseAmount(maxScoreInput);
    const options: CalculationOptionsV6 = {
      useMySekai,
      maxScore: ms > 0 ? ms : undefined,
      integrated: { step2ABase: computeStep2ABase(step2Mode, step2SongId) },
    };
    setFinalPlan(null);
    setModeAChoice(null);
    // 全入力をここで一括固定する（handleCalc がスナップショットの唯一の書き手）。
    recalcFromSnapshot(
      {
        current: c,
        target: tv,
        talent: tal,
        bonus: bon,
        hasWorldPass,
        lastPlaySongId,
        lastPlayMode,
        finalText,
        options,
      },
      options
    );
  };

  // Step2モードAで曲を変えたときの再計算（検証済み前提・スクロールはしない）。
  // appliedInputs のみから読み、options.integrated.step2ABase だけ差し替える。
  const recalcWithStep2Song = (newId: string) => {
    setStep2SongId(newId);
    const snap = appliedInputs.current;
    if (!snap) return; // 未計算なら no-op（曲IDのstateだけ更新して終わる）
    const options: CalculationOptionsV6 = {
      ...snap.options,
      integrated: { step2ABase: computeStep2ABase(step2Mode, newId) },
    };
    setModeAChoice(null);
    recalcFromSnapshot(snap, options);
  };

  // Step2モード切替時の再計算（R6 §6-2）。表示中モードと計算条件を必ず一致させる。
  const recalcWithStep2Mode = (newMode: Step2Mode) => {
    setStep2Mode(newMode);
    const snap = appliedInputs.current;
    if (!snap) return; // 未計算なら no-op
    const options: CalculationOptionsV6 = {
      ...snap.options,
      integrated: { step2ABase: computeStep2ABase(newMode, step2SongId) },
    };
    setModeAChoice(null);
    recalcFromSnapshot(snap, options);
  };

  function reject(msg: string) {
    setState(null);
    setError(msg);
  }

  const handleTargetBlur = () => {
    const completed = completeTargetSuffix(current, target);
    if (completed !== null) setTarget(completed);
  };

  return (
    <ToolPage morphKey="tool:analyzer" unit="mmj" title="ポイント調整アナライザー" icon="analytics">
      {/* 総合力とボーナスは他のツールとも共通なので、編成から流し込めるようにする。
          勝手に上書きはしない ── 押されたときだけ反映する。 */}
      <ProfileBar
        apply={(p) => {
          if (p.power != null) setTalent(String(p.power));
          if (p.bonus != null) setBonus(String(p.bonus));
        }}
        collect={() => ({ power: numOrUndef(talent), bonus: numOrUndef(bonus) })}
      />
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}
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
          <Field
            label="スコア上限（詳細設定）"
            htmlFor="pa-max-score"
            hint="調整・ラストプレイで狙えるスコアの上限。空欄で既定値（内部上限 3,000,000）"
          >
            <NeuInput
              id="pa-max-score"
              inputMode="numeric"
              value={maxScoreInput}
              onChange={(e) => setMaxScoreInput(e.target.value)}
              placeholder="既定 1,100,000"
            />
          </Field>
          <Switch checked={useMySekai} onChange={setUseMySekai} label="マイセカイを利用する" />
          {/* R5: ワールドパスはマイセカイ利用時のみ意味を持つので、ON時だけ表示する。 */}
          {useMySekai && (
            <Switch checked={hasWorldPass} onChange={setHasWorldPass} label="ワールドパス 有効" />
          )}
          {useMySekai && (
            <div className="text-sm text-slate-500">
              <p>
                マイセカイ単価（自動算出）:{" "}
                <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                  {unitHint} Pt/個
                </span>
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  β
                </span>
              </p>
              <p className="mt-1 text-xs text-amber-700">
                マイセカイの単価は未確定要素があります。通常スタミナ（水色）とブーストスタミナ（オレンジ）で
                獲得ポイントが変わるという情報があり、現在の計算はこれを区別していません。
                ワールドパスの5倍も出典未確認です。参考値として扱ってください。
              </p>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="ラストプレイ">
        <LastPlaySettings
          mode={lastPlayMode}
          onModeChange={setLastPlayMode}
          finalText={finalText}
          onFinalTextChange={setFinalText}
          songId={lastPlaySongId}
          onSongChange={setLastPlaySongId}
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
        />
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
        {state && (
          <>
            {!state.result.isVerified && (
              <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
                <p className="font-bold">この条件では目標ちょうどに着地できません</p>
                <p className="mt-1 text-xs">
                  Step②の案内（もう一方のモードで組めるか）を確認するか、目標ポイントや
                  ボーナスを見直して再計算してください。
                </p>
              </div>
            )}
            <MySekaiStep result={state.result} />
            <LiveAdjustStep
              result={state.result}
              musics={musics}
              aliases={aliases}
              jacketBase={JACKET_BASE}
              step2Mode={step2Mode}
              onStep2ModeChange={recalcWithStep2Mode}
              step2Song={step2Song}
              onChangeStep2Song={recalcWithStep2Song}
              modeAChoices={modeAChoices}
              modeAChoice={effectiveModeAChoice}
              onSelectModeAChoice={setModeAChoice}
              adopted={adopted}
              onAdopt={setAdopted}
              songByBase={songByBase}
              onSongByBaseChange={(basePoint, songId) =>
                setSongByBase((prev) => ({ ...prev, [basePoint]: songId }))
              }
            />
            {state.lastPlay.mode !== "none" && (
              <FinalRunStep
                result={state.result}
                lastPlay={state.lastPlay}
                bonus={appliedInputs.current?.bonus ?? 0}
                jacketBase={JACKET_BASE}
                selectedSong={finalSong}
                selectedPlan={finalPlan}
                onSelectPlan={setFinalPlan}
              />
            )}
            <PlanExportPanel
              result={state.result}
              lastPlay={state.lastPlay}
              step2Mode={step2Mode}
              musics={musics}
              songByBase={songByBase}
              adopted={adopted}
              step2Song={step2Song}
              modeAChoice={effectiveModeAChoice}
              finalSong={finalSong}
              finalPlan={effectiveFinalPlan}
              jacketBase={JACKET_BASE}
            />
          </>
        )}
      </div>
    </ToolPage>
  );
}
