/**
 * 遷移ステージへの細い口。設定画面の「この設定で試す」だけが使う。
 *
 * RouteStage（コンポーネント）とは別ファイルに置く。context と hook を
 * コンポーネントと同じファイルから export すると react-refresh の
 * only-export-components に引っかかるため。
 */
import { createContext, useContext } from "react";

export interface StageApi {
  /** 現在地のまま演出だけ1回再生する。commit もスクロールもフォーカスも動かさない。 */
  preview: () => void;
}

/** 既定は no-op。RouteStage の外（テストや単体表示）でも SettingsPage が動く。 */
export const StageContext = createContext<StageApi>({ preview: () => {} });

export const useStage = (): StageApi => useContext(StageContext);
