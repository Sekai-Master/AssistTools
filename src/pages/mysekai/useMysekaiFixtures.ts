import { useEffect, useState } from "react";
import { normalize, type MysekaiData } from "./lib/types";

/**
 * マイセカイの家具データを読み込む。
 *
 * 作法は useRankingMusics.ts / useCardData.ts に揃えている:
 *   - BASE_URL 起点の fetch（サブパス配信でも壊れない）
 *   - res.ok を先に見る（SPA フォールバックで index.html が 200 で返ると json() が例外になる）
 *   - AbortController で後片付け
 *   - 外部由来のデータは1件ずつ検証（normalize が担当）
 *
 * ★ このファイルは 412KB（brotli 32KB）で、使うのはこの画面だけ。
 *   他のツールの共通ファイルには同梱していない。
 */
export function useMysekaiFixtures(): {
  data: MysekaiData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<MysekaiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        const res = await fetch(`${base}MysekaiDatas/fixtures.json`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`家具データの取得に失敗しました (HTTP ${res.status})`);
        const parsed = normalize(await res.json());
        if (controller.signal.aborted) return;
        if (parsed.fixtures.length === 0) {
          throw new Error("家具データが空です。データ更新が必要かもしれません。");
        }
        setData(parsed);
        setError(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "家具データの読み込みに失敗しました。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
