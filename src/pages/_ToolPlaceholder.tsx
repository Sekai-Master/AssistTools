/** 移植前の各ツールの仮表示。ポート完了時に本実装へ差し替える。 */
export function ToolPlaceholder({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{name}</h1>
      <p className="mt-4 text-slate-500">このツールは現在移植中です。</p>
    </div>
  );
}
