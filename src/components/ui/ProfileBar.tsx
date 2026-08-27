import { useState } from "react";
import { Link } from "react-router-dom";
import { NeuButton } from "./NeuButton";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  PROFILE_FIELDS,
  createProfile,
  formatProfileText,
  omitEmpty,
  getActiveId,
  setActiveProfile,
  updateProfile,
  useActiveProfile,
  useProfiles,
  type Profile,
  type ProfileField,
} from "../../lib/profiles";

/**
 * ツールの中に置く編成の切り替え。**切り替えと貼り付けだけ**を担う。
 * 作る・消す・名前を変えるは設定側の台帳（pages/settings/ProfilePanel）。
 *
 * ★ ここが無いと、編成を変えるたびに設定へ往復することになる。それでは
 *   「同じ数字を打ち直す」を「ページを往復する」に置き換えただけになってしまう。
 *
 * ★ 逆向き（いまの入力を編成へ保存する）はここに置かない。**その値を打っている場所の
 *   すぐ隣**に無いと、何が保存されるのか分からないため（SaveToProfile を入力欄の近くに置く）。
 *
 * @param apply 選ばれている編成をツールの入力へ流し込む。押されたときだけ呼ぶ
 *              （勝手に上書きしない ── 手で直した値を黙って消さないため）。
 */
export function ProfileBar({ apply }: { apply: (p: Profile) => void }) {
  const profiles = useProfiles();
  const active = useActiveProfile();
  const [notice] = useState<string | null>(null);

  if (profiles.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        <Link to="/settings" className="font-bold underline">
          設定
        </Link>
        で編成を登録しておくと、ここの初期値になります。
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <label htmlFor="profile-pick" className="text-slate-500">
        編成
      </label>
      <select
        id="profile-pick"
        value={getActiveId() ?? active?.id ?? ""}
        onChange={(e) => setActiveProfile(e.target.value)}
        className="neu-inset rounded-lg px-3 py-1.5 text-slate-700"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {active && (
        <span className="text-xs text-slate-500">{formatProfileText(active) || "未入力"}</span>
      )}

      <NeuButton className="!px-3 !py-1" onClick={() => active && apply(active)}>
        入力に反映
      </NeuButton>
      {/* 押した結果を必ず言葉で返す。黙って値が変わると何が起きたか分からない。 */}
      {notice && (
        <span role="status" className="text-xs text-slate-600">
          {notice}
        </span>
      )}
    </div>
  );
}

/**
 * いまの入力を編成へ保存するボタン。**値を打っている場所のすぐ隣に置く。**
 *
 * ページ上部の切り替えバーに混ぜていたが、「何が保存されるのか」が入力欄から
 * 離れていて読めなかった（Nori 指摘 2026-08-01）。取り込む対象の近くに置く。
 */
const FIELD_LABEL = new Map(PROFILE_FIELDS.map((f) => [f.key as string, f]));

/** 上書きされる項目を「いまの値 → 新しい値」で並べる。 */
function diffRows(values: Partial<Profile>, target: Profile | undefined) {
  return Object.entries(values)
    .filter(([key]) => FIELD_LABEL.has(key))
    .map(([key, value]) => {
      const field = FIELD_LABEL.get(key)!;
      const before = target?.[key as ProfileField];
      return {
        key,
        label: field.label,
        unit: field.unit,
        before: typeof before === "number" ? before.toLocaleString() : null,
        after: typeof value === "number" ? value.toLocaleString() : String(value),
        changed: before !== value,
      };
    });
}

export function SaveToProfile({ collect }: { collect: () => Partial<Profile> }) {
  const profiles = useProfiles();
  const active = useActiveProfile();
  // ★ 保存先を選ばせる。「使用中」へ黙って上書きすると、別の編成を見ながら
  //   数値をいじっていたときに、意図しないものを壊す。
  const [dest, setDest] = useState<string>("");
  const [done, setDone] = useState<string | null>(null);
  /**
   * ★ 確認を挟む理由（Nori 指摘 2026-08-27）: 「入力に反映」（編成→入力）と
   *   「取り込む」（入力→編成）は**向きが逆**で、取り違えると編成側が壊れる。
   *   しかも壊れたことは押した瞬間には見えない。何がどう変わるかを出してから書く。
   */
  const [pending, setPending] = useState<Partial<Profile> | null>(null);
  if (!active) return null;

  const target = dest || active.id;
  const NEW = "__new__";
  const targetProfile = profiles.find((p) => p.id === target);

  const write = (values: Partial<Profile>) => {
    if (target === NEW) {
      const created = createProfile("", values);
      setDone(created.name);
    } else {
      updateProfile(target, values);
      setDone(profiles.find((p) => p.id === target)?.name ?? "");
    }
    setTimeout(() => setDone(null), 2600);
  };

  const start = () => {
    const values = omitEmpty(collect());
    // 新規作成は何も壊さないので確認を挟まない（手数を増やすだけになる）。
    if (target === NEW) {
      write(values);
      return;
    }
    setPending(values);
  };

  const rows = pending ? diffRows(pending, targetProfile) : [];
  const changedRows = rows.filter((r) => r.changed);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">保存先</span>
      <select
        value={target}
        onChange={(e) => setDest(e.target.value)}
        aria-label="保存先の編成"
        className="neu-inset rounded-lg px-2 py-1 text-sm text-slate-700"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {/* 上書きが不安なときの逃げ道。既存を壊さずに残せる。 */}
        <option value={NEW}>＋ 新しい編成として保存</option>
      </select>
      <NeuButton className="!px-3 !py-1" onClick={start}>
        取り込む
      </NeuButton>
      {done && (
        <span role="status" className="text-xs text-slate-600">
          「{done}」に保存しました
        </span>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={`編成「${targetProfile?.name ?? ""}」を上書きします`}
        confirmLabel={changedRows.length === 0 ? "そのまま保存" : "上書きする"}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) write(pending);
          setPending(null);
        }}
      >
        <p>
          いまの入力を<span className="font-bold">編成に書き込みます</span>。
          ツール側の入力は変わりません（逆向きは上の「入力に反映」）。
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-slate-500">
            入力が空なので、書き込むものがありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-slate-500">{r.label}</span>
                <span className="tabular-nums text-slate-400">
                  {r.before ?? "未設定"}
                </span>
                <span aria-hidden>→</span>
                <span
                  className={
                    r.changed
                      ? "font-bold tabular-nums text-slate-700"
                      : "tabular-nums text-slate-400"
                  }
                >
                  {r.after}
                  {r.unit}
                </span>
                {!r.changed && <span className="text-xs text-slate-400">変更なし</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">
          空欄の項目は書き込みません（編成に入っている値はそのまま残ります）。
        </p>
      </ConfirmDialog>
    </span>
  );
}
