import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { Switch } from "../../components/ui/Switch";
import { useAnalyzerMusics } from "./useAnalyzerMusics";
import { calculatePlanV6, ENVY_ID, type CalculationResultV6 } from "./lib/calculator";
import { calculateUnitBasePt } from "./lib/mySekai";
import { parseAmount, completeTargetSuffix } from "./lib/inputParsing";

export default function PointAnalyzer() {
  const { musics, loading } = useAnalyzerMusics();

  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [final, setFinal] = useState("");
  const [talent, setTalent] = useState("");
  const [bonus, setBonus] = useState("");
  const [hasWorldPass, setHasWorldPass] = useState(false);
  const [songId, setSongId] = useState(ENVY_ID);
  const [songQuery, setSongQuery] = useState("");
  const [result, setResult] = useState<CalculationResultV6 | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 入力中のマイセカイ単価ヒント
  const unitHint = useMemo(
    () => calculateUnitBasePt(parseAmount(talent), parseAmount(bonus, true), hasWorldPass),
    [talent, bonus, hasWorldPass]
  );

  const filteredSongs = useMemo(() => {
    const q = songQuery.trim().toLowerCase();
    const base = q
      ? musics.filter((m) => m.title.toLowerCase().includes(q) || m.id === q)
      : musics;
    return base.slice(0, 60);
  }, [musics, songQuery]);

  const selectedSong = musics.find((m) => m.id === songId);

  const handleCalc = () => {
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
    setResult(
      calculatePlanV6(
        c,
        tv,
        f,
        tal,
        bon,
        hasWorldPass,
        songId,
        musics.map((m) => ({ id: m.id, basePoint: m.basePoint }))
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
          <Field label="最終楽曲" hint={loading ? "楽曲データ読込中…" : `${musics.length}曲`}>
            <NeuInput
              value={songQuery}
              onChange={(e) => setSongQuery(e.target.value)}
              placeholder="曲名で絞り込み"
            />
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-neu shadow-neu-inset p-1">
              {filteredSongs.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSongId(m.id)}
                  className={`block w-full text-left px-3 py-1.5 rounded text-sm ${
                    m.id === songId ? "text-white" : "text-slate-600 hover:bg-black/5"
                  }`}
                  style={m.id === songId ? { backgroundColor: "var(--unit-color)" } : undefined}
                >
                  {m.title}
                  <span className="ml-2 text-xs opacity-70">基礎点 {m.basePoint}</span>
                </button>
              ))}
            </div>
            {selectedSong && (
              <p className="mt-1 text-sm text-slate-500">
                選択中: <span className="font-bold">{selectedSong.title}</span>（基礎点{" "}
                {selectedSong.basePoint}）
              </p>
            )}
          </Field>
        </div>
      </Panel>

      <NeuButton
        active
        onClick={handleCalc}
        className="w-full !py-3 text-base"
      >
        計算する
      </NeuButton>

      {error && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {error}
        </div>
      )}

      {result && <AnalyzerResult result={result} />}
    </ToolPage>
  );
}

function AnalyzerResult({ result }: { result: CalculationResultV6 }) {
  const a = result.mySekaiAllocation;
  return (
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

      <Panel title="① マイセカイ配分">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="木・石" value={a.countA} />
          <Stat label="キラキラ・樽" value={a.countB} />
          <Stat label="草花・工具箱・宝箱" value={a.countC} />
        </div>
        <p className="mt-3 text-sm text-slate-500">
          このステップで約{" "}
          <span className="font-bold" style={{ color: "var(--unit-color)" }}>
            {a.totalPt.toLocaleString()}
          </span>{" "}
          Pt（単価 {result.unitBasePt} Pt/個）
        </p>
      </Panel>

      <Panel title="② ライブ調整（独りんぼエンヴィー）">
        {result.liveAdjustment.status === "OK" ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                {result.liveAdjustment.requiredPt.toLocaleString()}
              </span>{" "}
              Pt を獲得
            </p>
            {result.liveAdjustment.targetScoreRange && (
              <p className="text-slate-500">
                目標スコア: {result.liveAdjustment.targetScoreRange.min.toLocaleString()} 〜{" "}
                {result.liveAdjustment.targetScoreRange.max.toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-rose-600">
            このポイント（{result.liveAdjustment.requiredPt.toLocaleString()} Pt）は0〜1炊きでは調整できません。
          </p>
        )}
      </Panel>

      {result.finalRunPt > 0 && (
        <Panel title={`③ ラストラン（${result.finalRunPt.toLocaleString()} Pt / 基礎点 ${result.finalBase}）`}>
          {result.finalRunPlans.length === 0 ? (
            <p className="text-sm text-rose-600">
              このポイントを獲得するプランは見つかりませんでした。
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {result.finalRunPlans.slice(0, 8).map((p, i) => (
                <li key={i} className="flex flex-wrap gap-x-4 text-slate-600">
                  <span>ボーナス {p.bonus}%</span>
                  <span>消費 {p.liveBonus}</span>
                  <span>
                    スコア {p.minScore.toLocaleString()}〜{p.maxScore.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="neu-inset rounded-lg p-3">
      <div className="text-2xl font-bold" style={{ color: "var(--unit-color)" }}>
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
