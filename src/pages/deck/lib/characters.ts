/**
 * キャラクター・ユニット・属性の表示用テーブル。
 *
 * ★ 配信データ（public/CardDatas）はキャラを **数値 id でしか持っていない**。
 *   カード名はあるが「誰のカードか」は id のままなので、画面に出すには対応表が要る。
 *   マスタから名前を落とす手もあるが、26人ぶんの公開情報を毎回配信データに積むより
 *   静的に持つ方が軽い（配信 JSON は brotli 込みで 88KB に抑えている）。
 *
 * ★ ここの `unit` は**マスタの内部名**（piapro / light_sound / …）で、
 *   power.ts・eventBonus.ts が使う語彙と同じ。`src/lib/units.ts` の UnitKey は
 *   テーマ色用の別語彙なので、混ぜずに UNIT_KEY で変換する。
 *
 * 対応が配信データとズレていないことは characters.test.ts が
 * bonuses.json の unitCharacters と突き合わせて確認している。
 */
import type { UnitKey } from "../../../lib/units";

export interface CharacterDef {
  /** 配信データの ch。 */
  ch: number;
  name: string;
  /**
   * 所属ユニットの内部名。
   * ★ VS の6人は全ユニットに跨るので piapro（＝ユニット枠を持たない側）にしてある。
   *   カードが実際に名乗る枠は supportUnit で決まる（power.ts の resolveUnit）。
   */
  unit: string;
}

export const CHARACTERS: CharacterDef[] = [
  { ch: 1, name: "星乃一歌", unit: "light_sound" },
  { ch: 2, name: "天馬咲希", unit: "light_sound" },
  { ch: 3, name: "望月穂波", unit: "light_sound" },
  { ch: 4, name: "日野森志歩", unit: "light_sound" },
  { ch: 5, name: "花里みのり", unit: "idol" },
  { ch: 6, name: "桐谷遥", unit: "idol" },
  { ch: 7, name: "桃井愛莉", unit: "idol" },
  { ch: 8, name: "日野森雫", unit: "idol" },
  { ch: 9, name: "小豆沢こはね", unit: "street" },
  { ch: 10, name: "白石杏", unit: "street" },
  { ch: 11, name: "東雲彰人", unit: "street" },
  { ch: 12, name: "青柳冬弥", unit: "street" },
  { ch: 13, name: "天馬司", unit: "theme_park" },
  { ch: 14, name: "鳳えむ", unit: "theme_park" },
  { ch: 15, name: "草薙寧々", unit: "theme_park" },
  { ch: 16, name: "神代類", unit: "theme_park" },
  { ch: 17, name: "宵崎奏", unit: "school_refusal" },
  { ch: 18, name: "朝比奈まふゆ", unit: "school_refusal" },
  { ch: 19, name: "東雲絵名", unit: "school_refusal" },
  { ch: 20, name: "暁山瑞希", unit: "school_refusal" },
  { ch: 21, name: "初音ミク", unit: "piapro" },
  { ch: 22, name: "鏡音リン", unit: "piapro" },
  { ch: 23, name: "鏡音レン", unit: "piapro" },
  { ch: 24, name: "巡音ルカ", unit: "piapro" },
  { ch: 25, name: "MEIKO", unit: "piapro" },
  { ch: 26, name: "KAITO", unit: "piapro" },
];

/** キャラを並べるときの順。ゲーム内のキャラ一覧と同じ並び（レオニ→…→VS）。 */
export const UNIT_ORDER = [
  "light_sound",
  "idol",
  "street",
  "theme_park",
  "school_refusal",
  "piapro",
] as const;

/**
 * エリアアイテム効果・ゲートを並べるときの順。**VS が先頭**（Nori 指示 2026-08-02）。
 * ★ キャラ一覧とは並びが違う。ゲーム内でもその2画面で並びが違うので、
 *   写す相手の画面に合わせる（上から順に目で追って入れられるようにするため）。
 */
export const AREA_UNIT_ORDER = [
  "piapro",
  "light_sound",
  "idol",
  "street",
  "theme_park",
  "school_refusal",
] as const;

export const UNIT_NAME: Record<string, string> = {
  light_sound: "Leo/need",
  idol: "MORE MORE JUMP!",
  street: "Vivid BAD SQUAD",
  theme_park: "ワンダーランズ×ショウタイム",
  school_refusal: "25時、ナイトコードで。",
  piapro: "VIRTUAL SINGER",
};

/** 略称。5枠のカードやチップなど、幅が無い場所で使う。 */
export const UNIT_SHORT: Record<string, string> = {
  light_sound: "レオニ",
  idol: "モモジャン",
  street: "ビビバス",
  theme_park: "ワンダショ",
  school_refusal: "ニーゴ",
  piapro: "VS",
};

/** 内部名 → テーマ色のキー（src/lib/units.ts）。 */
export const UNIT_KEY: Record<string, UnitKey> = {
  piapro: "vs",
  light_sound: "ln",
  idol: "mmj",
  street: "vbs",
  theme_park: "wxs",
  school_refusal: "n25",
};

/** 属性の並び。ゲーム内の効果一覧と同じ（Nori 指示 2026-08-02）。 */
export const ATTR_ORDER = ["cool", "pure", "mysterious", "happy", "cute"] as const;

export const ATTR_LABEL: Record<string, string> = {
  cool: "クール",
  cute: "キュート",
  pure: "ピュア",
  happy: "ハッピー",
  mysterious: "ミステリアス",
};

/**
 * 属性バッジの色。ゲーム内のアイコン色に寄せつつ、白抜き文字が読めるところまで沈めている
 * （難易度バッジ（useRankingMusics.ts の DIFFICULTY_COLOR）と同じ考え方）。
 */
export const ATTR_COLOR: Record<string, string> = {
  cool: "#3b82c4",
  cute: "#e0629b",
  pure: "#4caf50",
  happy: "#e8a020",
  mysterious: "#8b5cc4",
};

/** レアリティの表示。マスタは "1"〜"4" と "birthday"。 */
export const RARITY_LABEL: Record<string, string> = {
  "1": "★1",
  "2": "★2",
  "3": "★3",
  "4": "★4",
  birthday: "Birthday",
};

const BY_CH = new Map(CHARACTERS.map((c) => [c.ch, c]));

/**
 * キャラ名。**知らない ch でも落ちない**（配信データが先に増える可能性があるため。
 * 新キャラが来たら「キャラ27」と出て、こちらの表を直す合図になる）。
 */
export function characterName(ch: number): string {
  return BY_CH.get(ch)?.name ?? `キャラ${ch}`;
}

export function characterUnit(ch: number): string | undefined {
  return BY_CH.get(ch)?.unit;
}

/** ユニット内部名から、そのユニットのキャラ（VS は piapro の6人）。 */
export function charactersOf(unit: string): CharacterDef[] {
  return CHARACTERS.filter((c) => c.unit === unit);
}
