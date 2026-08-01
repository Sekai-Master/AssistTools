/**
 * 紹介カードに載せる内容の組み立て。
 *
 * ★ 描画（deckCanvas.ts）と分けてあるのは、**何を載せるかを検査できるようにする**ため。
 *   canvas は絵しか返さないので、載せ忘れ・載せ過ぎをテストで押さえられない。
 *
 * ★ 載せる数字は画面と同じものを使う（別経路で作り直さない）。
 *   画像の数字と画面の数字が食い違うのが一番たちが悪い。
 */
import { ATTR_COLOR, characterName } from "./characters";
import { displayBonus, type CatalogCard } from "./deckInputs";
import type { CardState } from "./deckStore";
import type { DeckCanvasCard, DeckCanvasData } from "./deckCanvas";
import type { DeckEval } from "./evaluate";

/**
 * 「Lv60 特訓 SL4」。育成状態は数字の根拠なので必ず添える。
 * ★ マスターランクはここに入れない。ゲームと同じく**カードの左下にひし形**で描く
 *   （deckCanvas.drawMasterRank）。文字とひし形の両方に出すと二重になる。
 */
export function growthLabel(state: CardState | undefined, card: CatalogCard): string {
  const s = state;
  const parts = [`Lv${s?.level ?? card.power[0]?.length ?? 1}`];
  if (s?.trained) parts.push("特訓");
  parts.push(`SL${s?.skillLevel ?? 1}`);
  return parts.join(" ");
}

export function buildShareCard(opts: {
  deckName: string;
  eventName?: string;
  cards: CatalogCard[];
  states: Record<number, CardState>;
  evaluated: DeckEval;
  leaderCardId?: number;
  thumbUrl: (card: CatalogCard, trained: boolean) => string;
  accent: string;
  /** イベントボーナスの欄を出さない（チャレンジライブ／載せたくないとき）。 */
  hideBonus?: boolean;
  /** 総合力の内訳まで載せる。 */
  withDetails?: boolean;
}): DeckCanvasData {
  const { evaluated } = opts;
  const round = (v: number) => Math.round(v * 10) / 10;

  const skillOf = new Map(evaluated.skill.perCard.map((p) => [p.cardId, p.value]));

  const cards: DeckCanvasCard[] = opts.cards.map((c) => {
    const s = opts.states[c.id];
    const skill = skillOf.get(c.id);
    return {
      // カードごとのスキル値も出す（編成で変わるので、1枚ずつ見せる意味がある）。
      skill: skill == null ? undefined : `${round(skill)}%`,
      // 絵は画面と同じものを出す（「絵は特訓前」を選んでいればその絵）。
      thumb: opts.thumbUrl(c, !!s?.trained && !s?.artUntrained),
      name: c.name,
      character: characterName(c.ch),
      sub: growthLabel(s, c),
      masterRank: s?.masterRank ?? 0,
      leader: c.id === opts.leaderCardId,
      attrColor: ATTR_COLOR[c.attr] ?? "#888",
    };
  });

  /**
   * 総合力の内訳など。**載せるモードのときだけ**（Nori 指示 2026-08-02）。
   * ふだんは数字3つで足りるが、確認や共有では「どこで稼いでいるか」まで見たいことがある。
   */
  const p = evaluated.power;
  const details = opts.withDetails
    ? [
        { label: "パフォーマンス", value: p.performance.toLocaleString() },
        { label: "エリアアイテム", value: p.areaItem.toLocaleString() },
        { label: "キャラランク", value: p.characterRank.toLocaleString() },
        { label: "ゲート", value: p.gate.toLocaleString() },
        { label: "家具", value: p.fixture.toLocaleString() },
        { label: "称号", value: p.honor.toLocaleString() },
        {
          label: "全一致",
          // ★ 帯のセルは狭い。長い語は「ユニット…」と切れて意味が消えるので短く出す。
          value: p.sameUnit && p.sameAttr ? "両方" : p.sameUnit ? "ユニット" : p.sameAttr ? "属性" : "なし",
        },
      ]
    : undefined;

  const bonus = evaluated.bonus;
  return {
    deckName: opts.deckName,
    eventName: opts.eventName,
    cards,
    stats: [
      { label: "総合力", value: evaluated.power.total.toLocaleString() },
      // ★ 載せない指定のとき・チャレンジライブのときは、行ごと消す（「—」を出さない）。
      ...(opts.hideBonus
        ? []
        : [
            {
              label: "イベントボーナス",
              // ★ 画面と同じくゲーム内表示（切り捨て）を大きく、端数は下に添える。
              value: bonus ? `${displayBonus(bonus.total)}%` : "—",
              sub:
                bonus && bonus.total !== displayBonus(bonus.total)
                  ? `正確には ${bonus.total}%`
                  : undefined,
            },
          ]),
      {
        label: "スキル（先頭/内部値）",
        value: `${round(evaluated.skill.leader)}/${round(evaluated.skill.total)}`,
        sub: `実効値 ${round(evaluated.skill.effective)}%`,
      },
    ],
    details,
    accent: opts.accent,
  };
}

/** 画像のファイル名。編成名をそのまま使うと OS で弾かれる文字があるので落とす。 */
export function shareFileName(deckName: string): string {
  const safe = deckName.replace(/[\\/:*?"<>|]/g, "").trim();
  return `${safe || "編成"}.png`;
}
