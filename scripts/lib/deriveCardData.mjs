/**
 * マスタDB → 編成ビルダー用の派生データ。**ビルド時にだけ動く。**
 *
 * ══ 不可侵の制約 ═══════════════════════════════════════════════
 * **公式が公開していない情報を出力に一切残さない。**
 *
 * マスタDB は解禁前のカード・イベントを含む（実測: 2026-08-01 時点で解禁5日前の
 * カードが1枚入っていた）。素通しすると、このサイトが情報解禁前の内容を
 * 世に出すことになる。
 *
 * 守り方は3つ:
 *   1. **実行時に隠すのではなく、ここで落とす。** 配信した JSON は誰でも開けるので
 *      「持っているが UI で出さない」は遮断にならない。出力に存在させない
 *   2. **早く出るくらいなら遅れる方を選ぶ。** ビルド時刻で切り、先読みの猶予を
 *      一切入れない（「あと1時間で解禁だから」は禁止）。遅れはビルド頻度で詰める
 *   3. **存在を示唆する経路も塞ぐ。** カード本体を消しても、ボーナス表に
 *      cardId が残っていれば「まだ見ぬカードがある」と分かる。未公開エンティティを
 *      参照する行は、参照元のテーブルからも消す
 * ═══════════════════════════════════════════════════════════════
 */

/** 公開日を持つ項目。どれか1つでも未来なら未公開として扱う。 */
const RELEASE_FIELDS = ["releaseAt", "startAt", "publishedAt", "archivePublishedAt"];

/**
 * この時点で公開済みか。
 *
 * ★ 日付を持たないものは「公開済み」とみなす。マスタDB には日付欄の無い
 *   古い項目があり、ここで捨てると既存の内容まで消えるため。
 *   逆に言うと、未公開判定は**日付欄がある項目にしか効かない**ので、
 *   新しいテーブルを足すときは日付欄の有無を必ず確かめること。
 */
export function isPublished(row, nowMs) {
  for (const f of RELEASE_FIELDS) {
    const v = row?.[f];
    if (typeof v === "number" && v > nowMs) return false;
  }
  return true;
}

/** 公開済みだけを残す。 */
export function published(rows, nowMs) {
  return (rows ?? []).filter((r) => isPublished(r, nowMs));
}

/**
 * 未公開エンティティを参照している行を落とす。
 *
 * カード本体を消しても、イベントボーナス表に cardId が残っていれば
 * 「解禁前のカードが存在する」ことも「それがボーナス対象である」ことも漏れる。
 */
export function withoutDangling(rows, refField, allowedIds) {
  return (rows ?? []).filter((r) => allowedIds.has(r[refField]));
}

/**
 * カードを編成ビルダーに要る項目だけへ削る。
 *
 * 生の cards.json は 34MB（1411枚 × 60レベル × 3パラメータ ＝ 21万行の展開）。
 * 端末で毎回これを JSON.parse させるのは無理があるので、レベルごとの数値を
 * 素の配列へ潰す。実測 34MB → brotli 62KB / parse 1ms。
 */
export function slimCard(c) {
  const byType = {};
  for (const p of c.cardParameters ?? []) {
    (byType[p.cardParameterType] ??= [])[p.cardLevel] = p.power;
  }
  // 添字をレベルに合わせる（0 番目は使わない）。欠けは 0 で埋めて長さを揃える。
  const levels = (arr) => {
    const a = arr ?? [];
    const max = a.length ? a.length - 1 : 0;
    return Array.from({ length: max }, (_, i) => a[i + 1] ?? 0);
  };
  return {
    id: c.id,
    ch: c.characterId,
    rarity: String(c.cardRarityType ?? "").replace("rarity_", ""),
    attr: c.attr,
    // "none" は全体の大半なので落とす（ユニット限定カードだけが値を持つ）。
    supportUnit: c.supportUnit && c.supportUnit !== "none" ? c.supportUnit : undefined,
    skillId: c.skillId,
    name: c.prefix,
    asset: c.assetbundleName,
    /** 特訓による固定加算（param1/2/3）。 */
    trained: [
      c.specialTrainingPower1BonusFixed ?? 0,
      c.specialTrainingPower2BonusFixed ?? 0,
      c.specialTrainingPower3BonusFixed ?? 0,
    ],
    /** レベル1..max の power（param1/2/3）。 */
    power: [levels(byType.param1), levels(byType.param2), levels(byType.param3)],
  };
}

/**
 * 派生データを1回で作る。**入力は生のマスタDB、出力は配信してよいものだけ。**
 *
 * @param src 各 json をそのまま渡す
 * @param nowMs ビルド時刻。これより後に解禁されるものは一切出さない
 */
export function derive(src, nowMs) {
  const cards = published(src.cards, nowMs);
  const cardIds = new Set(cards.map((c) => c.id));

  const events = published(src.events, nowMs);
  const eventIds = new Set(events.map((e) => e.id));

  // ★ カードとイベントの両方が公開済みの行だけ残す。片方でも未公開なら、
  //   その行の存在自体が未公開の内容を示唆する。
  const eventCards = withoutDangling(
    withoutDangling(src.eventCards, "cardId", cardIds),
    "eventId",
    eventIds
  );

  return {
    generatedAt: nowMs,
    cards: cards.map(slimCard),
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.eventType,
      unit: e.unit,
      startAt: e.startAt,
      aggregateAt: e.aggregateAt,
    })),
    /** イベント×キャラ・ユニットのボーナス倍率。 */
    deckBonuses: withoutDangling(src.eventDeckBonuses, "eventId", eventIds).map((b) => ({
      eventId: b.eventId,
      unitCharacterId: b.gameCharacterUnitId,
      rate: b.bonusRate,
    })),
    /** ピックアップ等、カード個別のボーナス（リーダー時の別枠を含む）。 */
    cardBonuses: eventCards.map((b) => ({
      eventId: b.eventId,
      cardId: b.cardId,
      rate: b.bonusRate ?? 0,
      leaderRate: b.leaderBonusRate ?? 0,
    })),
    /** レアリティ×マスターランクのボーナス。 */
    rarityBonuses: (src.eventRarityBonusRates ?? []).map((r) => ({
      rarity: String(r.cardRarityType ?? "").replace("rarity_", ""),
      masterRank: r.masterRank,
      rate: r.bonusRate,
    })),
    /** ボーナス対象人数の上限があるイベント。見落とすと計算がズレる。 */
    bonusLimits: withoutDangling(src.eventCardBonusLimits, "eventId", eventIds).map((l) => ({
      eventId: l.eventId,
      memberCountLimit: l.memberCountLimit,
    })),
    /** マスターランクによる総合力の固定加算。 */
    masterBonuses: (src.masterLessons ?? []).map((m) => ({
      rarity: String(m.cardRarityType ?? "").replace("rarity_", ""),
      masterRank: m.masterRank,
      power: [m.power1BonusFixed ?? 0, m.power2BonusFixed ?? 0, m.power3BonusFixed ?? 0],
    })),
    /** キャラクターランクによる総合力の倍率（プレイヤー固有の入力に使う）。 */
    characterRanks: (src.characterRanks ?? []).map((r) => ({
      ch: r.characterId,
      rank: r.characterRank,
      rate: [r.power1BonusRate ?? 0, r.power2BonusRate ?? 0, r.power3BonusRate ?? 0],
    })),
    /** エリアアイテムの倍率（同上）。 */
    areaItems: (src.areaItemLevels ?? []).map((a) => ({
      itemId: a.areaItemId,
      level: a.level,
      unit: a.targetUnit,
      attr: a.targetCardAttr,
      rate: [a.power1BonusRate ?? 0, a.power2BonusRate ?? 0, a.power3BonusRate ?? 0],
      allMatch: [
        a.power1AllMatchBonusRate ?? 0,
        a.power2AllMatchBonusRate ?? 0,
        a.power3AllMatchBonusRate ?? 0,
      ],
    })),
  };
}

/**
 * 出力に未公開の痕跡が残っていないかを最後に検算する。
 *
 * 個々のフィルタが正しくても、テーブルを1つ足したときに通し忘れる。
 * 「出してよい ID の集合」に無い ID が出力のどこかに現れたら、そこで止める。
 *
 * @returns 問題のある箇所（空なら安全）
 */
export function auditLeaks(out, allowed) {
  const problems = [];
  const check = (rows, field, set, where) => {
    for (const r of rows ?? []) {
      if (r[field] != null && !set.has(r[field])) {
        problems.push(`${where}: ${field}=${r[field]} は公開済みの一覧に無い`);
      }
    }
  };
  check(out.cardBonuses, "cardId", allowed.cardIds, "cardBonuses");
  check(out.cardBonuses, "eventId", allowed.eventIds, "cardBonuses");
  check(out.deckBonuses, "eventId", allowed.eventIds, "deckBonuses");
  check(out.bonusLimits, "eventId", allowed.eventIds, "bonusLimits");
  check(out.cards, "id", allowed.cardIds, "cards");
  check(out.events, "id", allowed.eventIds, "events");
  return problems;
}
