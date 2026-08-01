import { useState } from "react";
import { Link } from "react-router-dom";
import { NeuButton } from "./NeuButton";
import {
  formatProfileText,
  getActiveId,
  setActiveProfile,
  updateProfile,
  useActiveProfile,
  useProfiles,
  type Profile,
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
export function SaveToProfile({ collect }: { collect: () => Partial<Profile> }) {
  const active = useActiveProfile();
  const [done, setDone] = useState(false);
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <NeuButton
        className="!px-3 !py-1"
        onClick={() => {
          updateProfile(active.id, collect());
          setDone(true);
          setTimeout(() => setDone(false), 2200);
        }}
      >
        編成に取り込む
      </NeuButton>
      <span role="status" className="text-xs text-slate-500">
        {done ? `「${active.name}」に保存しました` : `保存先: ${active.name}`}
      </span>
    </span>
  );
}
