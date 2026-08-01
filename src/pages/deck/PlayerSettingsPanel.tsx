import { useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { NeuInput } from "../../components/ui/NeuInput";
import { cn } from "../../lib/utils";
import { AREA_UNIT_ORDER, ATTR_LABEL, ATTR_ORDER, CHARACTERS, UNIT_NAME } from "./lib/characters";
import { sanitizeDecimal } from "./lib/deckInputs";
import type { FixtureCounts, PlayerSettings } from "./lib/playerStore";

/**
 * プレイヤー固有の育成状況の入力。
 *
 * ★ **ゲーム内の画面から読める数字をそのまま写してもらう**方針（docs/deck-builder.md）。
 *   スクショ解析はしない。エリアアイテムのアイコンには文字が無く、色と並び順に頼る
 *   読み取りになるため、間違えても気付けない。
 *
 * ★ 入力の数は多い（ユニット6＋属性5＋キャラ26＋ランク26＋ゲート5＋家具＋称号）が、
 *   **1回入れれば以後は編成をいじるだけ**。だからページの最下部に畳んで置き、
 *   毎回スクロールで通過するコストを消している。
 *
 * ★ 「同ユニットのみで編成するとさらに◯%」は画面に出ていないが、マスタ上は必ず
 *   通常の2倍と決まっている（power.ts の areaRatesFromEffects が面倒を見る）。
 *   だからここで入れてもらうのは**効果一覧に出ている数字だけ**でいい。
 */

/**
 * 小さな数値入力。
 * ★ 打っている途中の "8." のような文字列を弾かないよう、内部では文字列を持ち、
 *   確定した値だけを親へ返す（親は数値で保存する）。
 */
function NumCell({
  value,
  onChange,
  label,
  max,
  width = "w-16",
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  max: number;
  width?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <NeuInput
      inputMode="decimal"
      aria-label={label}
      value={raw ?? (value ? String(value) : "")}
      placeholder="0"
      onChange={(e) => {
        const t = sanitizeDecimal(e.target.value);
        setRaw(t);
        const n = Number(t);
        if (t === "") onChange(0);
        else if (Number.isFinite(n) && n >= 0 && n <= max) onChange(n);
      }}
      onBlur={() => setRaw(null)}
      className={cn("!py-1 text-center text-sm", width)}
    />
  );
}

/**
 * ゲームのどこを見れば入力する値が分かるか。
 * ★ 「効果一覧の数字を写す」と書いても、その画面へ行けなければ意味が無い。
 *   一番よく聞かれるところなので、たどり方をそのまま出す。
 */
function Where({ path }: { path: string }) {
  return (
    <span
      className="ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-normal text-slate-500 shadow-neu-sm"
      title={`ゲーム内の ${path} で見られます`}
    >
      <span className="material-icons !text-[12px]" aria-hidden>
        info
      </span>
      {path}
    </span>
  );
}

function Section({
  title,
  children,
  hint,
  where,
}: {
  title: string;
  children: React.ReactNode;
  hint?: string;
  /** ゲーム内でその数字が見られる場所。 */
  where?: string;
}) {
  return (
    <details className="rounded-lg p-3 shadow-neu-inset">
      <summary className="cursor-pointer text-sm font-bold text-slate-600">
        {title}
        {where && <Where path={where} />}
      </summary>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function PlayerSettingsPanel({
  settings,
  onChange,
}: {
  settings: PlayerSettings;
  onChange: (next: PlayerSettings) => void;
}) {
  const area = settings.areaEffects;
  const setArea = (patch: Partial<typeof area>) =>
    onChange({ ...settings, areaEffects: { ...area, ...patch } });
  const setFixture = (ch: number, patch: Partial<FixtureCounts>) => {
    const cur = settings.fixtures[ch] ?? { S: 0, M: 0, L: 0 };
    onChange({ ...settings, fixtures: { ...settings.fixtures, [ch]: { ...cur, ...patch } } });
  };

  return (
    <Panel title="プレイヤー設定（総合力の計算に使う）">
      <p className="mb-3 text-xs text-slate-500">
        ゲーム内の「エリアアイテム効果一覧」などに出ている数字をそのまま入れてください。
        一度入れれば保存され、以後は編成を変えるだけで計算できます。
      </p>

      <div className="space-y-2">
        <Section
          title="エリアアイテム効果"
          where="持ち物 → エリアアイテム → 効果確認"
          hint="効果一覧に出ている％をそのまま。同ユニット・同属性だけで揃えたときの2倍は自動で計算します"
        >
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">ユニット</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {AREA_UNIT_ORDER.map((u) => (
                  <label key={u} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <NumCell
                      label={`${UNIT_NAME[u]} のエリア効果`}
                      value={area.units?.[u] ?? 0}
                      max={100}
                      onChange={(v) => setArea({ units: { ...area.units, [u]: v } })}
                    />
                    <span className="truncate">{UNIT_NAME[u]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">属性</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {ATTR_ORDER.map((a) => (
                  <label key={a} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <NumCell
                      label={`${ATTR_LABEL[a]} のエリア効果`}
                      value={area.attrs?.[a] ?? 0}
                      max={100}
                      onChange={(v) => setArea({ attrs: { ...area.attrs, [a]: v } })}
                    />
                    <span>{ATTR_LABEL[a]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">キャラクター</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {CHARACTERS.map((c) => (
                  <label key={c.ch} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <NumCell
                      label={`${c.name} のエリア効果`}
                      value={area.chars?.[c.ch] ?? 0}
                      max={100}
                      onChange={(v) => setArea({ chars: { ...area.chars, [c.ch]: v } })}
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ★ ユニットごとに1行。**VS が先頭で、その行だけ6人**（他は4人）。
            ゲーム内のキャラクターランクの画面と同じ並びにして、上から目で追って
            入れられるようにする（Nori 指示 2026-08-02）。 */}
        <Section title="キャラクターランク" hint="ランク50で上限（5%）。それ以上は伸びません">
          <div className="space-y-2">
            {AREA_UNIT_ORDER.map((unit) => {
              const members = CHARACTERS.filter((c) => c.unit === unit);
              return (
                <div key={unit}>
                  <p className="mb-1 text-[10px] font-bold text-slate-400">{UNIT_NAME[unit]}</p>
                  <div
                    className={cn(
                      "grid gap-1.5",
                      members.length === 6
                        ? "grid-cols-3 sm:grid-cols-6"
                        : "grid-cols-2 sm:grid-cols-4"
                    )}
                  >
                    {members.map((c) => (
                      <label key={c.ch} className="flex items-center gap-1 text-xs text-slate-600">
                        <NumCell
                          label={`${c.name} のキャラクターランク`}
                          value={settings.characterRanks[c.ch] ?? 0}
                          max={200}
                          width="w-12"
                          onChange={(v) =>
                            onChange({
                              ...settings,
                              characterRanks: { ...settings.characterRanks, [c.ch]: Math.trunc(v) },
                            })
                          }
                        />
                        <span className="truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="マイセカイのゲート"
          hint="レベル1〜40。ゲートは5ユニットぶんだけで、VS のゲートはありません"
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {AREA_UNIT_ORDER.filter((u) => u !== "piapro").map((u) => (
              <label key={u} className="flex items-center gap-1.5 text-xs text-slate-600">
                <NumCell
                  label={`${UNIT_NAME[u]} のゲートのレベル`}
                  value={settings.gateLevels[u] ?? 0}
                  max={40}
                  onChange={(v) =>
                    onChange({ ...settings, gateLevels: { ...settings.gateLevels, [u]: Math.trunc(v) } })
                  }
                />
                <span className="truncate">{UNIT_NAME[u]}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section
          title="マイセカイの家具"
          hint="ボーナスが付くのは「◯◯のぬいぐるみ」と「◯◯のダイヤモンドオブジェ」だけです。置いたキャラのカードにだけ乗ります（S=0.1% / M=0.3% / L=0.6%）"
        >
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CHARACTERS.map((c) => {
              const f = settings.fixtures[c.ch] ?? { S: 0, M: 0, L: 0 };
              return (
                <div key={c.ch} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-24 shrink-0 truncate">{c.name}</span>
                  {(["S", "M", "L"] as const).map((size) => (
                    <label key={size} className="flex items-center gap-1">
                      <span className="text-slate-400">{size}</span>
                      <NumCell
                        label={`${c.name} の家具（${size}）の個数`}
                        value={f[size]}
                        max={999}
                        width="w-12"
                        onChange={(v) => setFixture(c.ch, { [size]: Math.trunc(v) })}
                      />
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="称号・実機の総合力"
          hint="称号ボーナスはマスタから計算できないので手入力です（総合力の内訳画面に出ています）"
        >
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span>称号ボーナス</span>
              <NumCell
                label="称号ボーナス"
                value={settings.honorBonus}
                max={100000}
                width="w-24"
                onChange={(v) => onChange({ ...settings, honorBonus: Math.trunc(v) })}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              {/* ★ 計算値との差を常に出すための参照値。家具などを進めて誤差が開いたら
                  「設定が古い」ことに気付ける（docs「次の一手」2）。 */}
              <span>実機の総合力（任意）</span>
              <NumCell
                label="ゲームに表示されている総合力"
                value={settings.actualPower ?? 0}
                max={9999999}
                width="w-28"
                onChange={(v) => onChange({ ...settings, actualPower: v || undefined })}
              />
            </label>
          </div>
        </Section>
      </div>
    </Panel>
  );
}
