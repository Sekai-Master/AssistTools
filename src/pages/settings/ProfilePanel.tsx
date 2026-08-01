import { useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { Field } from "../../components/ui/Field";
import {
  createProfile,
  formatProfileText,
  getActiveId,
  parseProfileText,
  PROFILE_FIELDS,
  removeProfile,
  setActiveProfile,
  updateProfile,
  useProfiles,
  type Profile,
  type ProfileField,
} from "../../lib/profiles";

/**
 * 編成の台帳。**作る・名前を変える・値を直す・消す**をここでやる。
 *
 * ★ 切り替えはここではなく各ツールの中にある（components/ui/ProfileBar）。
 *   使っている最中に編成を変えたくなるのが普通なので、そのたびに設定へ
 *   往復させると「同じ数字を打ち直す」を「ページを往復する」に置き換えただけになる。
 *   ここは台帳、ツール側は切り替えだけ、と役割を分ける。
 */
export function ProfilePanel() {
  const profiles = useProfiles();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const activeId = getActiveId();

  const addFromPaste = () => {
    const parsed = parseProfileText(paste);
    createProfile("", parsed ?? {});
    setPaste("");
  };

  return (
    <Panel title="編成">
      <p className="text-sm text-slate-500">
        総合力・イベントボーナス・スキルの内部値をここに置いておくと、
        アナライザーやランキングなど各ツールの初期値になります。
        ゲーム内と同じように、いくつでも保存して使い分けられます。
      </p>

      {profiles.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">まだ編成がありません。</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="rounded-lg p-3 shadow-neu-inset">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  type="button"
                  onClick={() => setActiveProfile(p.id)}
                  aria-pressed={p.id === activeId}
                  className={`flex-1 min-w-0 text-left text-sm ${
                    p.id === activeId ? "font-bold text-slate-900" : "text-slate-600"
                  }`}
                >
                  {p.name}
                  {p.id === activeId && (
                    <span className="ml-2 text-xs font-normal text-slate-500">使用中</span>
                  )}
                  <span className="block text-xs font-normal text-slate-500">
                    {formatProfileText(p) || "未入力"}
                  </span>
                </button>
                <NeuButton
                  className="!px-3 !py-1"
                  onClick={() => setEditing(editing === p.id ? null : p.id)}
                >
                  {editing === p.id ? "閉じる" : "編集"}
                </NeuButton>
                {confirming === p.id ? (
                  <>
                    <NeuButton
                      className="!px-3 !py-1 !text-rose-600"
                      onClick={() => {
                        removeProfile(p.id);
                        setConfirming(null);
                      }}
                    >
                      本当に消す
                    </NeuButton>
                    <NeuButton className="!px-3 !py-1" onClick={() => setConfirming(null)}>
                      やめる
                    </NeuButton>
                  </>
                ) : (
                  <NeuButton className="!px-3 !py-1" onClick={() => setConfirming(p.id)}>
                    消す
                  </NeuButton>
                )}
              </div>

              {editing === p.id && <ProfileEditor profile={p} />}
            </li>
          ))}
        </ul>
      )}

      {/* 新規は「貼って作る」を主にする。1つずつ入れるより、ゲームやメモから
          コピーした文字列を放り込む方が速い。 */}
      <div className="mt-5 space-y-2">
        <Field
          label="編成を追加"
          htmlFor="profile-paste"
          hint="150/710/31.3 のように貼り付けても、空のまま作ってもOK（先頭スキル / スキル合計 / 総合力）"
        >
          <NeuInput
            id="profile-paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="150/710/31.3/170%"
          />
        </Field>
        <div className="flex items-center gap-3">
          <NeuButton onClick={addFromPaste}>追加</NeuButton>
          {paste.trim() !== "" && (
            <span className="text-xs text-slate-500">
              {parseProfileText(paste)
                ? "この内容で作ります"
                : "読み取れないので、空の編成として作ります"}
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** 1件ぶんの数値編集。項目は PROFILE_FIELDS が正本。 */
function ProfileEditor({ profile }: { profile: Profile }) {
  const set = (key: ProfileField, raw: string) => {
    const v = raw.trim();
    updateProfile(profile.id, { [key]: v === "" ? undefined : Number(v) });
  };

  return (
    <div className="mt-3 space-y-3 border-t border-slate-300/40 pt-3">
      <Field label="名前" htmlFor={`pf-name-${profile.id}`}>
        <NeuInput
          id={`pf-name-${profile.id}`}
          value={profile.name}
          onChange={(e) => updateProfile(profile.id, { name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PROFILE_FIELDS.map((f) => (
          <Field key={f.key} label={`${f.label}${f.unit && ` (${f.unit})`}`} htmlFor={`pf-${f.key}-${profile.id}`}>
            <NeuInput
              id={`pf-${f.key}-${profile.id}`}
              inputMode="decimal"
              value={profile[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}
