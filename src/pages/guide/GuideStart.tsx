import { Link } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { ACCENT, GuideBlocks, GuideText } from "./GuideBlocks";
import type { Chapter, GuideBlock } from "./lib/guide";

/**
 * 入口のページ「はじめての周回」（/guide/start）。正本は docs/guide/start.md。
 *
 * - `### 1. 題` ごとに 1 枚のカード。大きな手順の番号（撮影の囲みと同じ差し色の丸）、
 *   太字の「ひとことで」（見出しの次の太字だけの段落）、箇条、画像、「くわしく → N.M」
 * - 初心者向けに、本文より大きい字・広い行間（運営者 2026-11-12「分かりやすさ特化」。サイトの既定から外れてよい）
 * - 入口のカードはネオモーフィズムの影を薄くし、枠線で区切る
 */

interface Step {
  id: string;
  num: string;
  title: string;
  lead: GuideBlock | null;
  body: GuideBlock[];
}

/** 段落が太字（と印・用語）だけなら「ひとことで」。 */
function isLead(b: GuideBlock): boolean {
  return (
    b.kind === "para" &&
    b.text.some((x) => x.kind === "strong") &&
    b.text.every((x) => x.kind === "strong" || x.kind === "mark" || (x.kind === "text" && !x.text.trim()))
  );
}

function splitSteps(blocks: GuideBlock[]): { intro: GuideBlock[]; steps: Step[] } {
  const intro: GuideBlock[] = [];
  const steps: Step[] = [];
  for (const b of blocks) {
    if (b.kind === "heading" && b.level === 3) {
      const label = b.text.map((x) => ("text" in x ? x.text : "")).join("");
      const m = /^(\d+)\.\s*(.*)$/.exec(label.trim());
      steps.push({ id: b.id, num: m?.[1] ?? String(steps.length + 1), title: m?.[2] ?? label, lead: null, body: [] });
      continue;
    }
    const cur = steps[steps.length - 1];
    if (!cur) intro.push(b);
    else if (!cur.lead && cur.body.length === 0 && isLead(b)) cur.lead = b;
    else cur.body.push(b);
  }
  return { intro, steps };
}

function StepCard({ step }: { step: Step }) {
  return (
    <section
      id={step.id}
      aria-labelledby={`${step.id}-title`}
      className="scroll-mt-24 rounded-2xl border border-[color:var(--neu-edge)] bg-neu p-4 shadow-[0_2px_10px_-6px_rgba(120,120,130,0.5)] sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[22px] font-bold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          {step.num}
        </span>
        <h2 id={`${step.id}-title`} className="text-xl font-bold leading-snug text-slate-700">
          <span className="sr-only">手順{step.num} </span>
          {step.title}
        </h2>
      </div>
      {step.lead && step.lead.kind === "para" && (
        <p className="mt-4 rounded-lg bg-[color:var(--neu-hi)] px-4 py-3 text-[18px] leading-relaxed text-slate-700">
          <GuideText parts={step.lead.text} variant="start" />
        </p>
      )}
      <div className="mt-4">
        <GuideBlocks blocks={step.body} variant="start" />
      </div>
    </section>
  );
}

export function GuideStart({ start }: { start: Chapter | null }) {
  if (!start) return null;
  const { intro, steps } = splitSteps(start.blocks);
  return (
    <ToolPage unit="vs" title={start.title} icon="flag">
      <p className="text-xs">
        <Link to="/guide" className="text-slate-500 underline">
          ← 知識ガイドの目次
        </Link>
      </p>

      {intro.length > 0 && (
        <div className="rounded-2xl border border-[color:var(--neu-edge)] p-4 sm:p-6">
          <GuideBlocks blocks={intro} variant="start" />
        </div>
      )}

      <nav aria-label="手順の一覧" className="rounded-2xl border border-[color:var(--neu-edge)] p-4 sm:p-6">
        <ol className="grid gap-2 text-[16px] sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex items-center gap-2 text-slate-700 underline">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {s.num}
                </span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {steps.map((s) => (
        <StepCard key={s.id} step={s} />
      ))}

      <div className="rounded-2xl border border-[color:var(--neu-edge)] p-4 text-[16px] leading-relaxed text-slate-700 sm:p-6">
        <p>
          ここまでの要点は、
          <Link to="/guide/cards" className="font-bold underline">
            まとめ画像
          </Link>
          にして保存・共有できます。仕組みをくわしく知りたくなったら、
          <Link to="/guide" className="font-bold underline">
            知識ガイドの目次
          </Link>
          から各章へ。
        </p>
      </div>
    </ToolPage>
  );
}
