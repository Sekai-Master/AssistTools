import { Link } from "react-router-dom";
import { Panel } from "../../components/ui/Panel";
import { ToolPage } from "../../components/ui/ToolPage";
import { CONFIDENCE_LABEL, RANKS, type Confidence } from "../../../workers/border/src/model";
import { formatMan, formatRange } from "../../../workers/border/src/posts";
import { DocLink } from "../legal/LegalDoc";
import { BorderCharts } from "./BorderChart";
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
 * 2026-10-25 にハブへ載せた（src/tools.ts の TOOLS・カテゴリ「計画」。Nori「もう十分乗せれるクオリティでしょう」）。
 */

export default function BorderPredictionPage() {
  const { current, record, history, loading, error, now } = useBorderData();
  return (
    <ToolPage morphKey="tool:border" title="ボーダー予測" icon="insights">
      <p className="text-sm leading-7 text-slate-600">
        開催中のイベントの主要ボーダー（50〜2000位）の最終値を、過去のイベントの伸び方から予測します。
        イベントが終わるたびに予測と実測を突き合わせて、使うモデルと予測の幅を自動で選び直しています。
      </p>
      <p className="mt-1 text-sm">
        <Link to="/border/history" className="font-bold text-slate-600 underline underline-offset-4">
          終わったイベントの歴代ボーダー（終値を全部の回と比べる）へ
        </Link>
      </p>

      {loading && <Panel><p className="text-sm text-slate-500">読み込み中…</p></Panel>}
      {error && (
        <Panel>
          <p className="text-sm text-slate-600">データを読み込めませんでした（{error}）。時間をおいて開き直してください。</p>
        </Panel>
      )}
      {!loading && current && <CurrentPanel snap={current} model={record?.model ?? null} now={now} />}
      {!loading && current && history.size > 0 && (
        // id は X の告知で Bot がここまでスクロールして撮るための目印（sekaimaster-bot の page の anchor。2026-10-25）
        <section id="trend" className="scroll-mt-20">
        <Panel title="推移">
          <p className="mb-3 text-xs leading-6 text-slate-500">
            30分ごとの実測（実線）と、その時点で出していた最終値の予測（破線）・8割の幅（帯）です。
            帯はその時点の予測なので、終了時の実測（＝最終値）が最後の帯の中に入れば当たりです。
            グラフに触れる（キーボードなら左右キー）と、その時刻の数字が出ます。
          </p>
          <BorderCharts history={history} ranks={RANKS} startAt={current.event.startAt} endAt={current.event.aggregateAt + 60_000} />
        </Panel>
        </section>
      )}
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
  const marathon = snap.event.type === "marathon";
  // 予測を1つも出していない間、出し始めが全順位で同じなら、6行に同じ文を並べず冒頭で1回だけ言う。
  // 出し始めが分からない（モデルがまだ無い）ときは、冒頭の「まだ出ていません」だけで足りる
  const sameStart =
    !snap.predicted && rows.length > 0 && rows[0].showFrom != null && rows.every((r) => r.showFrom === rows[0].showFrom);
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

      {!snap.predicted && (
        <p className="mt-4 text-sm leading-7 text-slate-600">
          {phase !== "running"
            ? // 終わった回に「まだ出ていません」「30分ごとに更新」と出ていた（2026-10-25）。終わった回は最終の値を載せていると書く
              "このイベントは終わりました。下の数字は最後に集めた値です。予測と実際の差は、終了から数時間後に下の答え合わせに載ります。"
            : marathon
              ? `このイベントの予測はまだ出ていません。${sameStart ? `${hiddenReason(rows[0], snap.progress, snap.event)}。` : ""}いまの値は30分ごとに更新しています。`
              : "このイベントは予測の対象外です（いまはマラソン型のイベントだけを予測しています）。いまの値だけ載せています。"}
        </p>
      )}
      {/* ★ 予測を出す前も、いまの値は出す（30分ごとに集めているのに、以前は1行の断りだけだった） */}
      <ul className="mt-4 divide-y divide-[color:var(--neu-edge)]">
        {rows.map((r) => (
          <li key={r.rank} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 py-3">
            <span className="text-sm font-bold text-slate-700">{r.rank}位</span>
            {r.visible && r.predicted != null ? (
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums text-slate-800">{formatMan(r.predicted)}</span>
                  {r.confidence && <ConfidenceChip value={r.confidence} reference={snap.extrapolatedFrom != null} />}
                </p>
                <p className="text-xs tabular-nums text-slate-500">
                  {r.low != null && r.high != null && <>8割の幅 {formatRange(r.low, r.high)}・</>}
                  いま {formatMan(r.current)}
                </p>
              </div>
            ) : (
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="text-base font-bold tabular-nums text-slate-700">{formatMan(r.current)}</span>
                  <span className="text-xs text-slate-500">いま</span>
                </p>
                {marathon && !sameStart && (snap.predicted || r.showFrom != null) && (
                  <p className="text-xs leading-6 text-slate-500">{hiddenReason(r, snap.progress, snap.event)}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {snap.predicted && snap.extrapolatedFrom != null && (
        <p className="mt-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-700">
          <b>この回の予測は参考値です。</b>
          {snap.thin ? (
            <>
              このイベントは {snap.event.durationHours} 時間で、過去に同じ長さの回が {snap.thin.samples} 回しかありません。
              同じ長さの直近の回（第{snap.thin.latestEventId}回）の伸び方を{Math.round(snap.thin.weight * 10)}割、ほかの長さの回の伸び方を{10 - Math.round(snap.thin.weight * 10)}割で混ぜて出しているので、大きく外れることがあります
            </>
          ) : (
            <>
              このイベントは {snap.event.durationHours} 時間で、過去に同じ長さの回がありません。
              いちばん近い {snap.extrapolatedFrom} 時間の回の伸び方を借りて出しているので、大きく外れることがあります
            </>
          )}
          （102 時間の回では、1000位の開始24時間の予測 約1,640万を、終了の数時間前に実測が上回りました）。
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

function ConfidenceChip({ value, reference }: { value: Confidence; reference: boolean }) {
  // 過去に無い長さ（外挿）のときは確度を名乗らず「参考値」と書く（2026-10-25、221 の 1000位が大きく外れた）
  if (reference) {
    return <span className="rounded-full border border-dashed border-amber-600 px-2 py-0.5 text-[11px] font-bold text-amber-700">参考値</span>;
  }
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
                  <th className="w-[16%] py-1 font-normal">順位</th>
                  <th className="w-[28%] py-1 font-normal">実測</th>
                  <th className="w-[28%] py-1 font-normal">予測</th>
                  <th className="w-[28%] py-1 font-normal">誤差</th>
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
          序盤（経過20〜40%まで）は、過去のイベントを開始からの時間と終了までの残り時間でそろえた伸び方も比べ、そのほうが当たっていた順位だけ置き換えます。
          幅も、実際に外れた幅の分布から作り直します。人の勘で数字を足すことはしていません。
        </p>
        <p>
          非公式の予測で、外れることがあります。予測は経過4%から出し始め（150時間のイベントなら開始から約6時間、246時間なら約10時間）、序盤は幅が広い「目安」として出します。50位・100位は終盤まで個人の事情で大きく動くので、ほかの順位より幅が広めです。
          ランキングのデータは <DocLink href="https://sekai.best/">Sekai Viewer</DocLink> のものを使っています。
        </p>
      </div>
    </Panel>
  );
}
