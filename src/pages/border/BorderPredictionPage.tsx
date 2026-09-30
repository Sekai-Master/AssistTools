import { Panel } from "../../components/ui/Panel";
import { ToolPage } from "../../components/ui/ToolPage";
import { CONFIDENCE_LABEL, type Confidence } from "../../../workers/border/src/model";
import { formatMan, formatRange } from "../../../workers/border/src/posts";
import { DocLink } from "../legal/LegalDoc";
import {
  candidateLabel,
  coverageRate,
  formatJst,
  formatPercent,
  hiddenReason,
  isStale,
  phaseOf,
  rankViews,
  recordRows,
  signedPercent,
  type ModelSummary,
  type Report,
  type Snapshot,
} from "./borderView";
import { useBorderData } from "./useBorderData";

/*
 * ★ いまはハブに載せていない（src/tools.ts の TOOLS に無い）。URL を知っている人だけが開ける。
 *   公開の判断は運営者がする（docs/border-prediction.md「公開の手順」）。
 */

export default function BorderPredictionPage() {
  const { current, record, loading, error, now } = useBorderData();
  return (
    <ToolPage unit="mmj" title="ボーダー予測" icon="insights">
      <p className="text-sm leading-7 text-slate-600">
        開催中のイベントの主要ボーダー（50〜2000位）の最終値を、過去のイベントの伸び方から予測します。
        イベントが終わるたびに予測と実測を突き合わせて、使うモデルと予測の幅を自動で選び直しています。
      </p>

      {loading && <Panel><p className="text-sm text-slate-500">読み込み中…</p></Panel>}
      {error && (
        <Panel>
          <p className="text-sm text-slate-600">データを読み込めませんでした（{error}）。時間をおいて開き直してください。</p>
        </Panel>
      )}
      {!loading && current && <CurrentPanel snap={current} model={record?.model ?? null} now={now} />}
      {!loading && !current && !error && (
        <Panel>
          <p className="text-sm text-slate-600">まだ予測がありません。次のイベントが始まると30分ごとに更新されます。</p>
        </Panel>
      )}
      {record && record.reports.length > 0 && <RecordPanel reports={record.reports} />}
      {record?.model && <ModelPanel model={record.model} />}
      <HowPanel />
    </ToolPage>
  );
}

function CurrentPanel({ snap, model, now }: { snap: Snapshot; model: ModelSummary | null; now: number }) {
  const phase = phaseOf(snap, now);
  const rows = rankViews(snap, model);
  return (
    <Panel title={phase === "running" ? "開催中のイベント" : "直近のイベント（終了）"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-bold text-slate-700">{snap.event.name}</h3>
        <span className="text-xs text-slate-500">
          {formatJst(snap.event.startAt)} 〜 {formatJst(snap.event.aggregateAt + 60_000)}（{snap.event.durationHours}時間）
        </span>
      </div>

      <div className="mt-3" aria-label={`経過 ${formatPercent(snap.progress)}`}>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-[color:var(--unit-color)]" style={{ width: formatPercent(snap.progress, 1) }} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          経過 {formatPercent(snap.progress)}・実測 {formatJst(snap.sampleAt)} 時点
        </p>
      </div>

      {isStale(snap, now) && (
        <p className="mt-3 rounded-lg bg-[color:var(--color-rose-600)]/10 px-3 py-2 text-xs leading-6 text-[color:var(--color-rose-600)]">
          データ元（sekai.best）の更新が {Math.round((now - snap.sampleAt) / 60_000)} 分止まっています。下の数字はその時点のものです。
        </p>
      )}

      {!snap.predicted ? (
        <p className="mt-4 text-sm leading-7 text-slate-600">
          {snap.event.type === "marathon"
            ? "このイベントの予測はまだ出ていません。"
            : "このイベントは予測の対象外です（いまはマラソン型のイベントだけを予測しています）。"}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[color:var(--neu-edge)]">
          {rows.map((r) => (
            <li key={r.rank} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 py-3">
              <span className="text-sm font-bold text-slate-700">{r.rank}位</span>
              {r.visible && r.predicted != null ? (
                <div>
                  <p className="flex items-baseline gap-2">
                    <span className="text-lg font-bold tabular-nums text-slate-800">{formatMan(r.predicted)}</span>
                    {r.confidence && <ConfidenceChip value={r.confidence} />}
                  </p>
                  <p className="text-xs tabular-nums text-slate-500">
                    {r.low != null && r.high != null && <>8割の幅 {formatRange(r.low, r.high)}・</>}
                    いま {formatMan(r.current)}
                  </p>
                </div>
              ) : (
                <p className="text-xs leading-6 text-slate-500">
                  いま {formatMan(r.current)}・{hiddenReason(r, snap.progress)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {snap.predicted && snap.extrapolatedFrom != null && (
        <p className="mt-3 rounded-lg bg-slate-200/60 px-3 py-2 text-xs leading-6 text-slate-600">
          このイベントは {snap.event.durationHours} 時間で、過去に同じ長さの回がありません。
          いちばん近い {snap.extrapolatedFrom} 時間の回の伸び方で予測し、幅はいつもより広く取っています。
        </p>
      )}
      {snap.predicted && (
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          確度は8割の幅の広さです。高＝±5%くらい、中＝±15%くらい、目安＝それより広い（序盤）。
          序盤の目安は、全体の熱さを読むためのものとして見てください。
        </p>
      )}
      {snap.modelVersion && <p className="mt-2 text-[11px] text-slate-400">モデル {snap.modelVersion}</p>}
    </Panel>
  );
}

const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "bg-[color:var(--unit-color)]/20 text-slate-700",
  mid: "bg-slate-200 text-slate-600",
  rough: "border border-dashed border-slate-400 text-slate-500",
};

function ConfidenceChip({ value }: { value: Confidence }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CONFIDENCE_TONE[value]}`}>
      確度 {CONFIDENCE_LABEL[value]}
    </span>
  );
}

function RecordPanel({ reports }: { reports: Report[] }) {
  return (
    <Panel title="答え合わせ">
      <p className="text-xs leading-6 text-slate-500">
        終わったイベントの実測と、経過85%の時点で出していた予測です。外れた回も消さずに残しています。
        本番の予測が無い回（仕組みを動かす前のイベント）は、その時点までのデータだけで作ったモデルで経過90%を再現した誤差を載せています。
      </p>
      <div className="mt-4 space-y-6">
        {reports.map((rep) => (
          <section key={rep.eventId}>
            <h3 className="text-sm font-bold text-slate-700">
              {rep.name}
              <span className="ml-2 text-xs font-normal text-slate-500">{formatJst(rep.aggregateAt + 60_000).split(" ")[0]} 終了</span>
            </h3>
            <table className="mt-2 w-full table-fixed text-left text-xs tabular-nums">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 font-normal">順位</th>
                  <th className="py-1 font-normal">実測</th>
                  <th className="py-1 font-normal">予測</th>
                  <th className="py-1 font-normal">誤差</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {recordRows(rep).map((r) => (
                  <tr key={r.rank} className="border-t border-[color:var(--neu-edge)]">
                    <td className="whitespace-nowrap py-1.5">{r.rank}位</td>
                    <td className="py-1.5">{formatMan(r.final)}</td>
                    <td className="py-1.5">{r.predicted != null ? formatMan(r.predicted) : "—"}</td>
                    <td className="py-1.5">
                      {r.error != null ? (
                        <>
                          {signedPercent(r.error)}
                          {r.inBand === false && <span className="ml-1 text-[color:var(--color-rose-600)]">幅の外</span>}
                        </>
                      ) : r.replayError != null ? (
                        <span className="text-slate-500">再現 {signedPercent(r.replayError)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function ModelPanel({ model }: { model: ModelSummary }) {
  return (
    <Panel title="いまのモデル">
      <p className="text-xs leading-6 text-slate-500">
        {model.version}・過去 {model.poolSize} 回のマラソンで学習（{formatJst(Date.parse(model.createdAt))} 更新）
      </p>
      <table className="mt-3 w-full text-left text-xs tabular-nums">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 font-normal">順位</th>
            <th className="hidden py-1 font-normal sm:table-cell">使っている候補</th>
            <th className="py-1 font-normal">誤差の中央値（開始6時間／経過50%／90%）</th>
            <th className="py-1 font-normal">8割の幅に入った率</th>
          </tr>
        </thead>
        <tbody className="text-slate-700">
          {model.ranks.map((r) => {
            const at = (p: number) => r.medianAbsError.find((x) => Math.abs(x.p - p) < 1e-9)?.value;
            // 序盤の列は新しい版のモデルにしか無い（古い版のサマリでは —）
            const early = r.medianAbsErrorEarly?.find((x) => Math.abs(x.p - 0.04) < 1e-9)?.value;
            const fmt = (v: number | null | undefined) => (v == null ? "—" : formatPercent(v, 1));
            const cov = coverageRate(r);
            return (
              <tr key={r.rank} className="border-t border-[color:var(--neu-edge)] align-top">
                <td className="whitespace-nowrap py-1.5 pr-2">{r.rank}位</td>
                <td className="hidden py-1.5 pr-2 sm:table-cell">{candidateLabel(r.champion)}</td>
                <td className="py-1.5">
                  {fmt(early)}／{fmt(at(0.5))}／{fmt(at(0.9))}
                </td>
                <td className="py-1.5">{cov.total > 0 ? `${formatPercent(cov.covered / cov.total)}（${cov.total}回中）` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function HowPanel() {
  return (
    <Panel title="しくみ">
      <div className="space-y-3 text-sm leading-7 text-slate-600">
        <p>
          予測は「いまのボーダー ÷ 過去の同じ長さのイベントで、同じ経過の時点に最終値の何割まで積み上がっていたか」です。
          イベントの盛り上がり（全体の大きさ）はいまの実測がすでに含んでいるので、過去から借りるのは伸び方の形だけです。
        </p>
        <p>
          イベントが終わるたびに、いくつかの候補（同じ長さの全イベント／直近のイベントだけ／偏りを補正したもの など）を
          「その時点までのデータだけで予測していたら、どれだけ当たったか」で採点し直し、直近の成績がはっきり良い候補に切り替えます。
          幅も、実際に外れた幅の分布から作り直します。人の勘で数字を足すことはしていません。
        </p>
        <p>
          非公式の予測で、外れることがあります。50位・100位は終盤まで個人の事情で大きく動くので、幅が十分に狭くなるまで出しません。
          ランキングのデータは <DocLink href="https://sekai.best/">Sekai Viewer</DocLink> のものを使っています。
        </p>
      </div>
    </Panel>
  );
}
