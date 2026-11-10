import { NeuButton } from "../../components/ui/NeuButton";
import { cn } from "../../lib/utils";

/**
 * 遊んだ曲の一覧を開くボタン（「一覧 12曲」）。「遊んだ曲を入れる」の横に置く（1 枚で遊ぶ・まとめて遊ぶ）。
 * ★ 読み上げの名前は見えている字のまま（「一覧 12曲」）。横の「遊んだ曲を入れる」と並ぶので、何の一覧かは分かる
 */
export function PlayedListButton({ count, onClick, className }: { count: number; onClick: () => void; className?: string }) {
  return (
    <NeuButton onClick={onClick} className={cn("flex min-h-12 items-center justify-center gap-1 !px-3 whitespace-nowrap", className)}>
      <span className="material-icons text-xl text-slate-500" aria-hidden data-icon="history" />
      一覧 <span className="font-num">{count}</span>曲
    </NeuButton>
  );
}
