import { useId, useRef } from "react";
import { useModalA11y } from "../../lib/a11y";
import { cn } from "../../lib/utils";
import { thumbUrl } from "./lib/thumb";
import { partyKey } from "./lib/ownedStorage";
import type { Fixture, MysekaiCharacter } from "./lib/types";

/**
 * 家具の詳細。一覧に情報を詰めると1,500件を追えなくなるので、深い話はここへ寄せる。
 *
 * ★ ここが**会話の回収管理**の場所。顔ぶれごとにチェックを付けられる。
 *   「司ひとり」と「司＋類」は別の会話なので、家具単位の印では潰れてしまう。
 */

const SITE_LABEL: Record<string, string> = {
  room: "部屋の中",
  home: "屋外",
  any: "どこでも",
};

const LAYOUT_LABEL: Record<string, string> = {
  floor: "床置き",
  wall: "壁掛け",
  rug: "ラグ",
  road: "道",
  floor_appearance: "地面",
  wall_appearance: "外壁",
};

function CharaChip({ c, dim }: { c: MysekaiCharacter | undefined; dim?: boolean }) {
  if (!c) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-xs font-bold text-white",
        dim && "opacity-40"
      )}
      style={{ backgroundColor: c.color || "var(--unit-color)" }}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
        {c.initial}
      </span>
      {c.name}
    </span>
  );
}

export function FixtureModal({
  fixture,
  charById,
  highlight,
  owned,
  collected,
  onToggleOwned,
  onToggleCollected,
  onToggleAll,
  onClose,
}: {
  fixture: Fixture;
  charById: (id: number) => MysekaiCharacter | undefined;
  highlight: number | null;
  owned: boolean;
  collected: Set<string>;
  onToggleOwned: (id: number) => void;
  onToggleCollected: (key: string) => void;
  /** 顔ぶれが多い家具を1件ずつ押すのは辛いので、まとめて切り替える。 */
  onToggleAll: (f: Fixture, mark: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(true, onClose, dialogRef);

  const solos = fixture.parties.filter((p) => p.length === 1);
  const groups = fixture.parties.filter((p) => p.length > 1);
  const seen = fixture.parties.filter((p) => collected.has(partyKey(fixture.id, p))).length;
  const img = thumbUrl(fixture);

  /**
   * 会話1件ぶんの行。
   * ★ 素の checkbox は指で狙うには小さすぎるので、**行全体を押せるボタン**にする
   *   （高さは 44px 以上。iOS のタップ目標の目安）。状態はニューモーフィズムの
   *   流儀に合わせ、済みは「へこみ＋ユニットカラー」、未は「浮き出し」で示す。
   */
  const partyRow = (p: number[]) => {
    const key = partyKey(fixture.id, p);
    const done = collected.has(key);
    return (
      <li key={key} className="mb-1.5">
        <button
          type="button"
          onClick={() => onToggleCollected(key)}
          aria-pressed={done}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
            done ? "neu-selected" : "bg-neu shadow-neu-sm neu-tactile"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "material-icons shrink-0 text-[20px] leading-none",
              done ? "text-white" : "text-slate-400"
            )}
          >
            {done ? "check_circle" : "radio_button_unchecked"}
          </span>
          <span className="flex flex-wrap items-center gap-1">
            {p.map((id) => (
              <CharaChip key={id} c={charById(id)} dim={highlight != null && highlight !== id} />
            ))}
          </span>
          <span className={cn("ml-auto shrink-0 text-[11px]", done ? "text-white/80" : "text-slate-400")}>
            {done ? "見た" : "未"}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div
      // ポータルを使わずステージの中に居る fixed 要素。開いたまま画面遷移すると
      // ブロック演出の filter に包含ブロックを奪われるので、この印で退避させる。
      data-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="neu-panel flex h-[80vh] max-h-[680px] w-full max-w-lg flex-col p-5 focus:outline-none"
      >
        <div className="mb-3 flex shrink-0 items-start gap-3">
          {img && (
            <img
              src={img}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-lg bg-neu object-contain shadow-neu-inset"
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-bold text-slate-700">
              {fixture.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {[
                SITE_LABEL[fixture.site] ?? fixture.site,
                LAYOUT_LABEL[fixture.layout] ?? fixture.layout,
                fixture.size.some((n) => n > 0) ? `${fixture.size.join("×")} マス` : null,
                fixture.cost != null ? `コスト ${fixture.cost}` : null,
              ]
                .filter(Boolean)
                .join(" / ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 text-xl leading-none text-slate-500 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-1 text-xs font-bold",
              fixture.sketch === true ? "text-white" : "bg-neu text-slate-500 shadow-neu-inset"
            )}
            style={fixture.sketch === true ? { backgroundColor: "var(--unit-color)" } : undefined}
          >
            {fixture.sketch === true
              ? "模写できる"
              : fixture.sketch === false
                ? "模写できない"
                : "設計図なし"}
          </span>
          {fixture.action && (
            <span className="rounded bg-neu px-2 py-1 text-xs text-slate-500 shadow-neu-inset">
              キャラが動く
            </span>
          )}
          {/* 「持っている」も指で押せる大きさにする（チェックボックスは小さすぎる）。 */}
          <button
            type="button"
            onClick={() => onToggleOwned(fixture.id)}
            aria-pressed={owned}
            className={cn(
              "ml-auto flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
              owned ? "neu-selected" : "bg-neu text-slate-600 shadow-neu-sm neu-tactile"
            )}
          >
            <span aria-hidden className="material-icons text-[18px] leading-none">
              {owned ? "check_circle" : "radio_button_unchecked"}
            </span>
            持っている
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {fixture.parties.length === 0 ? (
            <p className="text-sm text-slate-500">
              この家具に固有の会話はありません。
              {fixture.likeChars.length > 0 && "（好みの家具としては反応します）"}
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs text-slate-500">
                  会話が起きる顔ぶれ {fixture.parties.length} 通り
                  {seen > 0 && ` ／ 見た ${seen}`}
                </p>
                {fixture.parties.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onToggleAll(fixture, seen < fixture.parties.length)}
                    className={cn(
                      "ml-auto rounded-lg bg-neu px-2.5 py-1.5 text-xs font-bold text-slate-600 shadow-neu-sm neu-tactile",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
                    )}
                  >
                    {seen < fixture.parties.length ? "すべて見た" : "すべて外す"}
                  </button>
                )}
              </div>

              {solos.length > 0 && (
                <>
                  <h3 className="mt-2 mb-1 text-xs font-bold text-slate-500">ひとりでいるとき</h3>
                  <ul>{solos.map(partyRow)}</ul>
                </>
              )}

              {groups.length > 0 && (
                <>
                  <h3 className="mt-3 mb-1 text-xs font-bold text-slate-500">
                    揃っているとき（居合わせないと起きません）
                  </h3>
                  <ul>{groups.map(partyRow)}</ul>
                </>
              )}
            </>
          )}

          {fixture.likeChars.length > 0 && (
            <>
              <h3 className="mt-4 mb-1 text-xs font-bold text-slate-500">この家具が好きな人</h3>
              <p className="flex flex-wrap gap-1">
                {fixture.likeChars.map((id) => (
                  <CharaChip key={id} c={charById(id)} dim={highlight != null && highlight !== id} />
                ))}
              </p>
            </>
          )}
        </div>

        <p className="mt-3 shrink-0 text-[11px] leading-relaxed text-slate-400">
          会話の本文は載せていません。チェックはこの端末にだけ保存されます。
        </p>
      </div>
    </div>
  );
}
