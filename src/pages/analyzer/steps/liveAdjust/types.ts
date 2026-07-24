/** 曲サジェスト用に必要な最小の楽曲情報。検索モーダルに渡すのでジャケットも要る。 */
export interface SuggestMusic {
  id: string;
  title: string;
  basePoint: number;
  jacketLink: string;
  /** 演奏秒数。0/欠損は「時間不明」として扱う（音源未確定曲などが該当）。 */
  musicTime: number;
  pronunciation?: string;
  artistName?: string;
}

/**
 * 採択中プランの参照先。
 * plans[0]（主役）・sameCountVariants（同一本数の内訳違い）・plans[1..]（本数違い）の
 * どこを見ているかをこの1値だけで表す。参照時は範囲外クランプで壊れないようにする。
 */
export type Adopted =
  | { kind: "primary" }
  | { kind: "variant"; index: number }
  | { kind: "frontier"; index: number };

/**
 * Step2（ライブ調整）の2モード（R5・排他）。
 *   songFixed  = A: 曲を固定（既定エビ・選択可）してボーナスを動かす（掃引）。既定・主用途。
 *   bonusFixed = B: 入力ボーナス固定で該当基礎点の曲から選ぶ（multi・複数プラン）。
 */
export type Step2Mode = "songFixed" | "bonusFixed";
