import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { Switch } from "../../components/ui/Switch";
import { toHalfWidthNumber } from "./evcLogic";

const LEADER_PRESETS = [150, 140, 130, 120, 110, 100];

/**
 * スキル実効値計算機。まずは順方向（先頭/内部値→実効値）の中核を移植。
 * ブルフェス個体・逆算・OC候補などの分岐は docs/porting/02-evc.md に沿って順次追加する。
 */
export default function EffectiveValueCalculator() {
  const [detailMode, setDetailMode] = useState(false);
  const [leader, setLeader] = useState<string>("150");
  const [inner, setInner] = useState<string>("");

  const leaderNum = toHalfWidthNumber(leader);
  const innerNum = toHalfWidthNumber(inner);

  const effective = useMemo(() => {
    if (leaderNum === null) return null;
    const i = innerNum ?? 0;
    // 実効値 = round(先頭 + (内部 - 先頭) × 0.2)
    return Math.round(leaderNum + (i - leaderNum) * 0.2);
  }, [leaderNum, innerNum]);

  return (
    <ToolPage unit="mmj" title="スキル実効値計算機" icon="calculate">
      <Panel title="先頭スキル値">
        <div className="flex flex-wrap gap-2">
          {LEADER_PRESETS.map((v) => (
            <NeuButton
              key={v}
              active={leaderNum === v}
              onClick={() => setLeader(String(v))}
            >
              {v}
            </NeuButton>
          ))}
        </div>
        <Field label="任意の先頭スキル値" htmlFor="evc-leader" className="mt-4">
          <NeuInput
            id="evc-leader"
            inputMode="numeric"
            value={leader}
            onChange={(e) => setLeader(e.target.value)}
            placeholder="例: 150"
          />
        </Field>
      </Panel>

      <Panel title="内部値（編成5枠のスキル値合計）">
        <Switch
          checked={detailMode}
          onChange={setDetailMode}
          label="スキル値を個別に入力する（準備中）"
        />
        <Field label="内部値" htmlFor="evc-inner" className="mt-4">
          <NeuInput
            id="evc-inner"
            inputMode="numeric"
            value={inner}
            onChange={(e) => setInner(e.target.value)}
            placeholder="例: 620"
          />
        </Field>
      </Panel>

      <Panel>
        <p className="text-sm text-slate-500">この編成の実効値は</p>
        <p className="mt-1 text-4xl font-extrabold" style={{ color: "var(--unit-color)" }}>
          {effective ?? "—"}
        </p>
        <p className="text-sm text-slate-500">です。</p>
      </Panel>
    </ToolPage>
  );
}
