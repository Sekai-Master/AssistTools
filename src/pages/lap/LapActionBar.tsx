import { useEffect, type ReactNode } from "react";
import { ActionButton } from "../../components/ui/ActionButton";

/**
 * 主ボタン（計測開始・周回した・再開する）の固定バー。**画面の下に 1 つだけ、どの状態でも同じ場所・同じ大きさ。**
 *
 * ★ 検分 #241 高-1: 主ボタンをページの流れの中に置くと、曲の段（開始で閉じる）や数字の段の高さで
 *   開始の前後に位置が変わり、同じ点の 2 回押しが「1つ戻す」「終了して保存」に当たった。
 *   ついぼの下の固定バー（TweetGenerator.tsx）と同じ形で、流れから外して位置を固定する。
 * ★ ボタンは 1 つの要素のまま、文言と処理だけ状態で替える（要素を替えると大きさ・位置がずれうる）。
 * ★ 上の 1 行（何で測るか／いまの周／中断中）は高さを固定して切り詰める。長い曲名で折り返すとボタンが動く。
 * ★ 全幅で出す（lg:hidden にしない）。幅で出し分けると、その境目でまた位置が変わる。
 *   ダイアログ（z-50）はこのバー（z-40）の上に出るので、開いている間は押せない。
 */
export function LapActionBar({
  line,
  label,
  sub,
  onPress,
}: {
  /** ボタンの上の 1 行 */
  line: ReactNode;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  /**
   * ★ バーの高さぶん、ページ全体（フッターを含む）の下に余白を取る。ページの中に余白を置くだけだと、
   *   いちばん下まで送ったときにフッターのリンクがバーに隠れて押せない。外すときに元へ戻す。
   */
  useEffect(() => {
    const body = document.body;
    const before = body.style.paddingBottom;
    body.style.paddingBottom = "9rem";
    return () => {
      body.style.paddingBottom = before;
    };
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="border-t border-black/5 bg-neu/95 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 h-5 truncate text-center text-sm text-slate-500" aria-live="off">
            {line}
          </p>
          <ActionButton data-testid="lap-main-button" className="w-full py-4 text-xl" onClick={onPress}>
            {label}
            <span className="mt-1 block truncate text-xs font-normal opacity-90">{sub}</span>
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

