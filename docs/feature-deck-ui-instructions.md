# 編成ビルダー /deck — UI 実装指示書

2026-08-01 作成。実装担当: Opus。
この指示書は現物のコードを読んで書いている（根拠ファイルは各所に明記）。
**一次資料は `docs/deck-builder.md`。着手前に必ず通読すること。** 本書と食い違ったら deck-builder.md が正。

---

## 1. Objective

計算済み・実測検証済みの編成ビルダーのロジック（イベントボーナス `src/pages/deck/lib/eventBonus.ts`・総合力 `src/pages/deck/lib/power.ts`）を、Nori が毎日使える画面 `/deck` に載せる。

このツールの存在意義（deck-builder.md「このツールの存在意義」）:
**「ボーナスを5%落として総合力を盛った方が、最終的なイベントPtで勝つ」を出せること。**
ゲーム内「おまかせ編成」はボーナスしか見ないので、ボーナス最大化だけでは差別化にならない。
編成を2〜3個並べて最終イベントPtで比較するのが本体。カード5枚を選んでボーナスを出すだけの画面で止めない。ただし実装順は逆で、ボーナス表示という最小の動く経路から積む（§9）。

---

## 2. Project Understanding

### リポジトリ

- `C:\Users\masan\Documents\GitHub\AssistTools`（Windows）。npm / Vite 7 / React 19 / TypeScript 5.9 / Tailwind CSS 4（CSS-first）/ React Router 7 / Vitest 4。
- プロセカ非公式ファンツール集（9ツール）。デザインはニューモーフィズム＋6ユニットカラー（`docs/theming.md`）。遷移演出は `docs/motion-system.md` と `src/motion/`。
- テスト `npm test`（実測: 45ファイル・620件 全パス）、ビルド `npm run build`（tsc -b + vite build。実測パス）。
- **`npm run lint` は eslint.config.js が無く動かない。既知の状態で、直すのはこのタスクの範囲外。**
- CI（`.github/workflows/ci.yml`）は npm test → npm run build。lint はコメントアウト済み。
- データ更新は `.github/workflows/refresh-card-data.yml` が6時間おきに `scripts/refresh-card-data.mjs` を回して `public/CardDatas/` を再生成（main で稼働中）。

### 配信データ（実際に開いて確認した形）

`public/CardDatas/`（brotli 計88KB。生成元 `scripts/lib/deriveCardData.mjs`）:

- `cards.json` … `{ generatedAt, cards: [...] }`。1416枚。各カード
  `{ id, ch, rarity("1"|"2"|"3"|"4"|"birthday"), attr, skillId, name, asset, supportUnit?, trained[3], power[3][レベル-1] }`。
  supportUnit を持つのは246枚。**カード画像は無い**（`asset` はアセット名文字列のみ。public/ にも画像なし）。
  **スキルの中身のテーブルは配信していない**（skillId だけ）。カードからスキル値は計算できない。
- `bonuses.json` … `{ generatedAt, events(212件・現行イベント含む), deckBonuses, unitCharacters(56), cardBonuses, rarityBonuses, bonusLimits, ... }`。
  events は `{ id, name, type, unit, startAt, aggregateAt }`。
- `power.json` … `{ generatedAt, masterBonuses, episodes, canvasBonuses, characterRanks(4550), areaItems(1100), gates(5) }`。
  gates の rates は **float32 の生値**（0.10000000149011612）。丸め直すと実機と1ずれる（power.real.test.ts が固定している）。

テーブルの組み立て方の正解例は `src/pages/deck/lib/power.real.test.ts` 35–43行:
`PowerTables = { cards: cards.cards, masterBonuses/episodes/canvasBonuses/characterRanks/gates: power.*, unitCharacters: bonuses.unitCharacters }`。
`BonusTables` は bonuses.json のフィールドがそのまま入る（eventBonus.ts 40–46行）。

### 計算モジュール（変更禁止・呼ぶだけ）

- `eventBonus(deck: DeckCard[], eventId, tables: BonusTables, opts?: { leaderCardId?, supportBonus? }): EventBonusResult`
  … カードだけで決まる（プレイヤー入力不要）。結果に `perCard`（内訳）・`cappedOut`・`unsetMasterRank` を含む。
  `DeckCard = { cardId, characterId, rarity, attr, supportUnit?, masterRank? }`。**masterRank 未入力は undefined で渡す（0と混同しない）。**
- `deckPower(deck: DeckPowerCard[], player: PlayerState, tables: PowerTables): DeckPowerResult`
  … プレイヤー固有入力が要る。結果に成分内訳（performance/areaItem/characterRank/gate/fixture/honor）・`perCard`・`sameUnit`/`sameAttr`・`unsetMasterRank`・**`missing`（計算できなかったもの。黙って0にしない）**。
  `DeckPowerCard = { cardId, level, masterRank?, trained?, episodes?: {first?, latter?}, canvas? }`。
- `areaRatesFromEffects(e: AreaEffects): AreaRate[]` … ゲーム内「効果一覧」の数字（units/attrs/chars → %）をそのまま渡せば全一致2倍まで面倒を見る。**入力画面はこの AreaEffects の形に素直に落ちる**（measurements.json の player.areaEffects が実例）。
- `FIXTURE_RATE_BY_SIZE = { S: 0.1, M: 0.3, L: 0.6 }` … 家具は「キャラごとにぬいぐるみ/オブジェを S/M/L 何個置いたか」から `fixtureRates[ch] = Σ(個数×率)` を組み立てる（%単位。S 1個なら 0.1）。
- `ratePower()` は power.ts 内部で使用済み。UI 側で％計算を自前で書かないこと。

### スコア→イベントPt（既存・テスト済み。比較機能はこれを配線する）

- `src/pages/analyzer/lib/calcLivePt.ts` …
  `calcLivePt(base, bonus, score, taki)`（ソロ/オート）、`calcMultiLivePt(base, bonus, selfScore, taki, otherScore?)`（協力。省略時は自分×4）。丸めは実測確定済み。`LIVE_BONUS_MULTIPLIERS` もここ。
- `src/pages/ranking/lib/efficiency.ts` …
  `calcScore(e: EfficiencyEntry, params: EfficiencyParams, live: LiveType): number | null`
  `eventPtFor(live, score, eventRate, params): number`
  `EfficiencyParams = { power, bonus, taki, skillLeader, skillTotal, overheadSec }`。
  EfficiencyEntry（曲×難易度の baseScore / skillScore* / eventRate / musicTime）は `src/pages/ranking/useRankingMusics.ts` が `public/MusicDatas/transformedMusics.json` + `musicScoreData.json` から組み立てる。
  → **編成比較の最終Pt** は「対象曲を1つ決め、per-deck の power/bonus ＋ 共通の skill/taki で `calcScore` → `eventPtFor`」で繋がる（§8-5）。

### UI の器

- ページ骨格: `ToolPage`（unit色・見出し・最大幅。`wide` で max-w-6xl）＋ `Panel` 積み。`Field`/`NeuInput`/`NeuButton`/`Segmented`（チップ複数）/`SegmentedControl`（等幅2〜4択）/`Switch`/`TakiInput`/`Stat`（ranking ページ内ローカル定義 256–279行。共通化されていない）。
- モーダル: `src/components/SongSearchModal.tsx`（固定高さ・`useModalA11y`（Esc/フォーカストラップ/スクロールロック）・`data-overlay` 印は遷移演出との取り決め）。
- 編成プロフィール: `src/lib/profiles.ts`（`sekaimaster:profiles:v1`。power/bonus/skillLeader/skillTotal/taki を名前付き複数保存）。ツール内の呼び出しは `ProfileBar`（適用は押されたときだけ）と `SaveToProfile`（**値を打っている場所のすぐ隣に置く**規約。ProfileBar.tsx のコメント参照）。
- localStorage: キーは `sekaimaster:*:v1` 規約（例外は歴史的経緯）。**新キーは `src/pages/settings/StoredDataPanel.tsx` の ITEMS に必ず登録する**（「この端末に保存しているもの」台帳）。
- ツール登録は3点セット＋1: `src/tools.ts`（TOOLS）→ `src/motion/routes.ts`（ROUTE_LOADERS と RoutePages）→ `src/App.tsx`（Route）。`src/motion/routes.test.ts` が READY_TOOLS と ROUTE_LOADERS の突き合わせで登録漏れを CI で落とす（＝TOOLS に足して loader を忘れるとテストが赤くなる。3点は同一コミットで）。
- データ読み込みの作法は `useRankingMusics.ts` が手本: `import.meta.env.BASE_URL` 起点の fetch、`res.ok` を先に見る（SPAフォールバックで HTML が 200 で返るため）、AbortController、**外部データは1件ずつ型検証**（~/.claude の型安全チェックリストと同旨）。

### 無いもの（ゼロから作る）

- キャラ名テーブルが**リポジトリのどこにも無い**（grep 済み。ch は数値のみ）。26人ぶんの静的テーブルを新設する（§7）。公開情報なのでハードコードでよい。
- ユニット内部名（piapro/light_sound/…）→ 表示名・UnitKey の対応も無い（`src/lib/units.ts` は UnitKey 6種のみ）。対応表: piapro→vs、light_sound→ln、idol→mmj、street→vbs、theme_park→wxs、school_refusal→n25（measurements.json の light_sound=レオニ15% と deck-builder.md の記述で確認済み）。

---

## 3. Behaviors To Preserve（既存挙動を壊さない）

- 既存9ツールの画面・計算・保存データは一切変えない。共有コンポーネント（ui/*、SongSearchModal、profiles.ts）への変更は「後方互換な追加」のみ。SongSearchModal を改造してカード用に流用**しない**（§8-2）。
- `power.ts` / `eventBonus.ts` / `deriveCardData.mjs` / `measurements.json` は**変更しない**。テスト620件は全部通ったまま保つ。
- ヘッダー primary は4つまで（tools.ts の ToolDef コメント）。既に4つ埋まっている（tweet/analyzer/plan/ranking）。**/deck は primary にしない**（変えたければ質問に回す。§5）。
- `profiles.ts` の保存形式（`sekaimaster:profiles:v1` のスキーマ）は他ツールが読んでいる。フィールド追加もしない（deck からは既存フィールド power/bonus への書き込みだけ）。

## 4. Non-Negotiables（不可侵）

1. **公式未公開のカード・イベントを絶対に出さない。** 遮断はビルド時（deriveCardData.mjs）で完結しており、配信 JSON には未公開の痕跡が無い。UI 側で新たな漏洩経路を作らない:
   - 配信 JSON に無い id を推測・列挙・補完しない（「id が飛んでいる＝次のカードがある」を示す UI も不可）。
   - 外部 CDN・外部 API を一切叩かない（カード画像取得も不可。オフライン・権利・スポイラーの三重で危険）。データソースは `public/` 配下のみ。
   - 「未実装カードの仮置き」はユーザー自身に定義させる機能としてのみ許される（今回のスコープ外）。
2. **％計算を自前で書かない。** 必ず power.ts の関数を通す（float32 問題。`rate * 0.01 * base` と書いた瞬間に実機と1ずれる）。
3. **未入力を0と混同しない。** `masterRank` 未入力は undefined で渡し、`unsetMasterRank` / `missing` を画面に「未設定」「計算できない項目あり（暫定値）」として必ず出す。黙って0にしない。
4. イベントボーナスの内部値は小数のまま比較に使う（ゲーム内表示は合計だけ切り捨て: 内部156.5%→表示156%）。表示は §8-6。
5. `deckPower()` は線形検索。**5枚×数編成の用途では性能十分**（docs 明記）。総当たり最適化を今回入れない＝Map 化もしない。

## 5. Stop And Ask Conditions（止めて Nori に確認）

- 配信データの形やビルド時遮断ロジック（deriveCardData.mjs / refresh-card-data.mjs）を変えたくなったとき。
- `profiles.ts` の保存形式・フィールドを変えたくなったとき。
- スコア→イベントPt の式に新しい仮定を持ち込む必要が出たとき（既存の calcLivePt / efficiency.ts で表現できない計算が要るとき）。
- /deck をヘッダー primary に昇格させたいとき（どれを降ろすかは作者の好み）。
- 計算結果が実機とずれる事象を見つけたとき（UI 側で吸収しない。lib のバグか入力漏れかを切り分けてから報告）。
- 本書の設計判断（§8）を覆したくなったとき。コードを読めば分かることは質問にしないこと。

## 6. Baseline Commands（着手前に叩いて緑を確認済み 2026-08-01）

```powershell
cd C:\Users\masan\Documents\GitHub\AssistTools
git status          # clean（main, 2981a29）であること。未コミット変更と混ぜない
npm test            # 45 files / 620 tests 全パス（12秒）
npm run build       # tsc -b && vite build 成功
npm run dev         # 手元確認用（http://localhost:5173/deck）
```

`npm run lint` は動かない（既知・スコープ外）。各フェーズの完了ごとに `npm test` と `npm run build` を叩く。

---

## 7. 接合点マップ

### 既存に「接ぐ」もの（触るファイルと根拠）

| ファイル | やること | 根拠 |
|---|---|---|
| `src/tools.ts` | TOOLS に `{ id:"deck", path:"/deck", name:"編成ビルダー", shortName:"編成", icon:"style", unit:"wxs", status:"ready" }` を追加（primary なし。unit は wxs を既定とする＝refresh としか被らない。変更容易） | ToolDef 定義・primary 4枠制約 |
| `src/motion/routes.ts` | ROUTE_LOADERS に `"/deck": () => import("../pages/deck/DeckBuilder")`、RoutePages に `deck: lazyOf("/deck")` | routes.test.ts が突き合わせ |
| `src/App.tsx` | `<Route path="/deck" element={<RoutePages.deck />} />` | 既存8ツールと同型 |
| `src/pages/settings/StoredDataPanel.tsx` | ITEMS に新キー3つ（下記）を追加 | 保存物の台帳規約 |
| `src/components/ui/ProfileBar.tsx` | 変更しない。DeckBuilder から `SaveToProfile` を使う | 書き戻しの既存作法 |

### ゼロから作るもの（すべて `src/pages/deck/` 配下。lib は既存の deck/lib と並置）

- `DeckBuilder.tsx` … ページ本体（default export。lazy 対象）。
- `useCardData.ts` … cards/bonuses/power の3 JSON を fetch して `{ tables: { bonus: BonusTables, power: PowerTables }, cards, events, loading, error }` を返すフック。作法は useRankingMusics.ts を踏襲（BASE_URL・res.ok・Abort・型検証）。テーブルの詰め替えは power.real.test.ts 35–43行と同一に。
- `lib/characters.ts` … 26人の静的テーブル `{ ch, name, unit }`（1一歌/2咲希/3穂波/4志歩=light_sound、5みのり/6遥/7愛莉/8雫=idol、9こはね/10杏/11彰人/12冬弥=street、13司/14えむ/15寧々/16類=theme_park、17奏/18まふゆ/19絵名/20瑞希=school_refusal、21ミク/22リン/23レン/24ルカ/25MEIKO/26KAITO=piapro）と、ユニット内部名→UnitKey/表示名の対応。measurements.json のコメント（ch23=レン・ch25=MEIKO）と突き合わせて検算すること。
- `lib/deckStore.ts` … 保存3層（下記）。localStorage、planStorage.ts / profiles.ts の作法（try-catch・1件ずつ型検証・best-effort 書き込み）で。**テスト先行**。
- `lib/compare.ts` … 編成→最終Pt の配線（§8-5 の純関数）。**テスト先行**。
- `CardSearchModal.tsx` … カード選択モーダル（§8-2）。
- `PlayerSettingsPanel.tsx` / `DeckSlots.tsx` / `ComparePanel.tsx` 等、Panel 単位の分割は 200–400行/ファイル規約（~/.claude/rules）に合わせて適宜。

### 保存キー（新設。すべて StoredDataPanel に登録）

| キー | 中身 |
|---|---|
| `sekaimaster:deck:player:v1` | プレイヤー設定。`{ areaEffects: AreaEffects, characterRanks: Record<ch,number>, gateLevels: Record<unit,number>, fixtures: Record<ch,{S:number,M:number,L:number}>, honorBonus: number }`。**AreaEffects の生の形で保存**し、計算時に areaRatesFromEffects() へ渡す（fixtureRates への変換も計算時。保存形を計算都合に寄せない） |
| `sekaimaster:deck:cards:v1` | 所持カードの育成状態。`Record<cardId, { level, trained, masterRank?, episodes:{first,latter}, canvas }>`（§8-4） |
| `sekaimaster:deck:decks:v1` | 名前付き編成。`[{ name, savedAt, cardIds: (number|null)[5], leaderIndex, supportBonus }]`。同名 upsert は planStorage.ts と同型 |

---

## 8. 設計判断（決定・根拠・不採用案）

### 8-1. 画面構成: 1ページに Panel を縦積み（`ToolPage wide`）

上から: ①編成スロット（保存済み編成の切替＋5枠＋リーダー指定） ②イベント選択＋イベントボーナス結果 ③総合力結果 ④編成比較 ⑤プレイヤー設定（折りたたみ。初回のみ開く）。

- 不採用A: アナライザー式ステップ制 — 編成いじりは「1枚差し替えて結果を見る」の往復であって直線的な手続きではない。ステップを跨ぐ往復はこの用途では邪魔。
- 不採用B: 左右2ペイン（左に編成・右に結果）— 既存9ツールに前例が無く、モバイル幅（このサイトはスマホ利用が前提の作り）で必ず破綻する。wide+縦積みは ranking が実証済み。
- 採用理由: 既存の語彙（ToolPage/Panel/Field）そのままで、モバイルは自然に縦に流れる。変更頻度が低いプレイヤー設定を最下部の折りたたみに隔離することで「毎回スクロールして通過する」コストを消す。

### 8-2. カード選択: 新規 `CardSearchModal`（SongSearchModal は流用しない）

画像なしで1416枚から選ばせる導線: **キャラで絞る（ユニット別6行×キャラボタン）→ レアリティ/属性チップで絞る → 一覧（新しい順=id降順）から選ぶ**。テキスト検索（カード名 `name`・キャラ名）も併設。行の表示は「カード名＋キャラ名＋レアリティ★＋属性＋（supportUnit があればユニット名）」のテキスト構成。属性は色付きの小さなバッジで良い（DifficultyBadge の作法。EfficiencyRanking.tsx 160–179行）。

- SongSearchModal を流用しない理由: あれは「ジャケット画像＋読み仮名＋エイリアス」前提の楽曲専用。カードに要るのは段階フィルタで、props を無理に共通化すると両方が歪む。**ただし `useModalA11y`・固定高さリスト・`data-overlay` 印・NeuInput という部品と作法はそのまま借りる**（SongSearchModal.tsx を横に置いて書くこと）。
- 不採用: 画像グリッド — カード画像はリポジトリに存在せず、外部 CDN は Non-Negotiable 1 で不可。前提から成立しない。
- 不採用: 全カードの仮想スクロール一覧 — キャラ絞り込み後は高々110枚程度で、80件制限つき通常リスト（SongSearchModal と同じ手法）で足りる。仮想化は複雑さに見合わない。

### 8-3. プレイヤー設定の入力粒度: ゲーム内「効果一覧」の数字をそのまま写す

deck-builder.md「次の一手」3 の通り。エリア効果はユニット6＋属性5＋キャラ26 の数値入力（AreaEffects の形そのまま。実例 = measurements.json の player.areaEffects）。ゲート5基のレベル（1〜40）、キャラランク26人、称号ボーナス（手入力。マスタから導出不能）、家具はキャラ×サイズの個数入力→ FIXTURE_RATE_BY_SIZE で%へ。

- スクショ解析はしない（docs 明記: アイコンに文字が無く色と並びに頼る読み取りになるため）。
- 37+5+26+α 個の入力は多いが**1回きり**で、以後は編成をいじるだけ。26人の並びは characters.ts のユニット順で固定し、ゲーム内の効果一覧と同じ順に見えるようにする。
- 不採用: エリア「アイテム」単位の入力（power.json の areaItems 1100行を使いレベルを選ばせる）— ゲーム画面の「効果一覧」の合計%を写す方が入力数が少なく、照合も楽。areaItems は areaRatesFromEffects の2倍規則の検証（power.real.test.ts）に使われているだけで、UI が直接触る必要は無い。

### 8-4. カードの育成状態: 所持カード台帳（cardId キー）に持つ。編成には持たせない

同じカードが複数編成に入るとき、現実には育成状態は1つしかない。編成側に持たせると「編成Aで直したのに編成Bが古い」が必ず起きる。編成は cardIds の参照だけ。

- 初期値（カードを初めて選んだとき）: `level = そのカードの最大Lv（card.power[0].length）`、`trained = trained値を持つなら true`、`episodes = {first:true, latter:true}`、`canvas = false`、**`masterRank = undefined（未設定）`**。
  根拠: 編成に入れるカードは育成済みが普通で、サイドストーリー入れ忘れは1編成で1万以上ずれる（docs）。逆に MR は人によるので既定を置かず、`unsetMasterRank` の「未設定」表示に必ず出す（0扱いの暫定値であることを隠さない）。
- スロット上のカードをタップ→育成状態の編集（Lv/特訓/MR/前後編/キャンバス）。MR 未設定はスロット上にバッジで常時見せる。

### 8-5. 編成比較と最終Pt: 既存関数の配線（新しい式を作らない）

`lib/compare.ts` に純関数を1つ:

```ts
// 対象曲 e（EfficiencyEntry）・共通条件（skillLeader/skillTotal/taki/live種別）・
// 編成ごとの power/bonus から、編成ごとの { score, eventPt } を出す。
// live="multi" なら calcScore(e, params, "multi") → eventPtFor("multi", score, e.eventRate, params)
// live="solo"/"auto" も同様。関数はすべて src/pages/ranking/lib/efficiency.ts の既存 export。
```

- **対象曲**: SongSearchModal（こちらは楽曲なので流用可）＋ useRankingMusics のデータで1曲選ぶ。既定は現1位常連の「独りんぼエンヴィー」（`ENVY_ID` が `src/pages/analyzer/lib/calculator.ts` に既存）。曲は全編成に共通＝順位比較に曲選びはほぼ効かないが、絶対値が実感に近くなる。
- **スキル値（skillLeader/skillTotal）は編成ごとに計算できない**。配信データにスキルテーブルが無い（skillId のみ。§2 で確認済み）。よって共通条件として1組だけ入力させ（初期値は ProfileBar から適用）、全編成に同じ値を使う。スコア式でスキル項は加算・power は乗算なので、「ボーナス vs 総合力」の比較目的にはこの近似で十分。**この近似は画面に明記する**（「スキルは全編成共通の値で計算しています」）。
- 不採用: 編成ごとのスキル値手入力 — 入力コストが本体価値（比較の即応性)を殺す。後で足せる形（compare.ts の引数を編成ごとに受ける）にはしておく。
- 不採用: skillId からスキル値を導出 — データを配信していない。配信データを増やすのは Stop And Ask 事項。

### 8-6. ボーナスの表示

大きく出す値はゲーム内表示と同じ**合計の切り捨て**（156%）。脇に小さく正確値（156.5%）を添える。カードごとの内訳（deck/master/card の3成分。EventBonusResult.perCard）は小数のまま表示（ゲーム内のカード別表示と完全一致することが実測で分かっている）。比較・profiles への保存は小数のまま。
根拠: ゲーム画面と数字が一致していることが信頼の根拠になり、かつ正確値を捨てない。

### 8-7. profiles への書き戻し（製品としての一本化）

総合力とボーナスの結果の**すぐ隣**に `SaveToProfile` を置き、`collect: () => ({ power: powerResult.total, bonus: bonusResult.total })` で既存編成プロフィールへ取り込む（bonus は小数のまま。Profile.bonus は小数許容）。これでランキング・アナライザー・稼働時間が deck の計算値で動く。ProfileBar はページ上部に置き、（今は使い道が薄くても）他ツールと同じ場所に同じ部品がある状態を保つ。

---

## 9. Implementation Phases

各フェーズ完了時に必ず: `git status` で意図した差分だけか確認 → `npm test` → `npm run build` → 小さくコミット（conventional commits。例 `feat(deck): ...`）。フェーズ内でも変更は小さく戻しやすい単位で。無関係な整形・ついでのリファクタ禁止。コメントと UI 文言は日本語で、このリポジトリの流儀（「なぜそうしたか」を書く濃いコメント。power.ts が手本）に合わせる。

### Phase 0: 仕様確定・現物確認（コードを書かない）

- `docs/deck-builder.md` 通読。power.ts / eventBonus.ts / power.real.test.ts / measurements.json / useRankingMusics.ts / efficiency.ts / calcLivePt.ts / profiles.ts / ProfileBar.tsx / SongSearchModal.tsx / StoredDataPanel.tsx / tools.ts / routes.ts(+test) を読む。
- Baseline Commands を叩いて緑を確認。git status clean を確認。
- Verification: 上記が全部緑。疑問が出たら §5 に照らして質問するか、コードで解決。

### Phase 1: 垂直スライス — /deck 登録＋データ読込＋5枠＋イベントボーナス表示

**これ1本で「組んでいない編成のボーナスを正確に出す」という単独価値が立つ**（プレイヤー入力不要のため。eventBonus.ts 冒頭コメント）。

- ツール登録3点セット（tools.ts / routes.ts / App.tsx。同一コミット）。routes.test.ts が緑になることを確認。
- `lib/characters.ts`（テスト: 26人・ch 重複なし・ユニット対応が unitCharacters と整合）。
- `useCardData.ts`（fetch＋型検証。エラー時は ranking と同じ文言態度で画面に出す）。
- `DeckSlots`: 5枠（空枠可）＋リーダー指定＋カード選択は**暫定でよい**（キャラ→カードの2段 select 等の最小実装。Phase 2 で差し替え）。
- イベント選択（既定 = events の startAt が現在以前で最大のもの＝開催中イベント）＋ WL サポートボーナス手入力（supportBonus）＋ eventBonus() の結果表示（合計・カード別内訳・cappedOut・unsetMasterRank の「未設定」表示。§8-6）。
- 保存キー `sekaimaster:deck:decks:v1` の deckStore（**テスト先行**: 壊れた JSON・型不正・upsert・並び）。StoredDataPanel 登録。
- Verification: npm test / build 緑。dev サーバーで実機の編成を組み、**ゲーム内のボーナス表示と一致**すること（レオニ5枚クール染め=156%系の実測が measurements にある）。ハブに「編成ビルダー」カードが出ること。

### Phase 2: カード選択モーダル＋育成状態

- `CardSearchModal`（§8-2）。`lib/deckStore.ts` に所持カード台帳（`sekaimaster:deck:cards:v1`・テスト先行・初期値規則 §8-4）。
- スロットから育成状態の編集 UI（Lv/特訓/MR/前後編/キャンバス）。MR 未設定バッジ。
- Verification: テスト/ビルド緑。1416枚から目当てのカードに3操作以内（キャラ→（絞り）→カード）で届くこと。未設定 MR が画面に見えること。

### Phase 3: プレイヤー設定＋総合力

- `PlayerSettingsPanel`（§8-3）。保存キー `sekaimaster:deck:player:v1`（テスト先行）。StoredDataPanel 登録。
- deckPower() の結果表示: 合計＋成分内訳（パフォ/エリア/CR/ゲート/家具/称号）＋ sameUnit/sameAttr の表示＋ **missing を必ず一覧表示**（「未設定のため暫定値」）。
- 誤差表示（docs「次の一手」2）: 「実機の総合力」を任意入力させ、計算値との差を常設表示。家具などを進めた時に誤差が広がって気付ける。
- Verification: measurements.json の player 値と実測編成（例: レオニ5枚クール染め）を手で入力し、**画面の合計が 236,756 に一致**すること。テスト/ビルド緑。

### Phase 4: 編成比較（本体）

- `lib/compare.ts`（§8-5。**テスト先行**: 既知の score/eventPt 値との一致。efficiency.ts のテストがある場合は同じ題材を使う）。
- ComparePanel: 保存済み編成から2〜3個選び、列並びで ボーナス / 総合力 / スコア / 最終Pt（と Pt/時）を比較。最良の列を強調。共通条件（曲・skill・taki・live種別）は ProfileBar から適用可。
- Verification: 「ボーナスが低いのに最終Ptが高い」編成ペアを作って、意図した逆転が表示されること。テスト/ビルド緑。

### Phase 5: 統合仕上げ

- SaveToProfile 配線（§8-7）・ProfileBar 設置。
- モバイル幅（375px）で全パネルが破綻しないこと・a11y（モーダルの Esc/フォーカストラップは useModalA11y 経由なら自動）・エラー/ローディング表示の文言統一。
- README.md のツール一覧に1行追加（既存4行の書きぶりに合わせる）。docs/deck-builder.md の「UI 未着手」表記を現状に合わせて更新。
- Verification: 全テスト・ビルド緑。dev で一連の操作（編成作成→ボーナス→総合力→比較→profiles 保存→ranking で反映確認）を通す。

---

## 10. Verification Requirements

- `npm test` 620件＋新規テストが全パス。既存テストの修正は原則不可（挙動を変えていない限り修正が必要になるのはおかしい。必要になったら手を止めて原因を切り分ける）。
- `npm run build` 成功（tsc の型エラーゼロ）。
- 新規ロジック（deckStore / compare / characters / useCardData の parse）はテスト先行で書く。UI コンポーネント自体のテストは必須にしない（このリポジトリの既存方針もロジック偏重）が、ページから計算への「詰め替え」（フォーム state → DeckCard/DeckPowerCard/PlayerState）は純関数に切り出してテストする。
- 実機一致の確認: Phase 1（ボーナス）と Phase 3（総合力 236,756）は必ず手で照合する。
- localStorage 由来・fetch 由来のデータは全経路で型検証（壊れた JSON、配列でない値、範囲外数値）。

## 11. Reporting Format

完了報告には以下を含める:

1. フェーズごとの実施内容とコミット一覧（hash＋メッセージ）。
2. `npm test` / `npm run build` の最終結果（件数）。
3. 実機照合の結果（ボーナス・総合力それぞれ、期待値と画面表示値）。
4. §8 の設計判断から**逸脱した点とその理由**（無ければ「なし」）。
5. §5 に該当して質問に回した事項（無ければ「なし」）。
6. 既知の未対応・気になった点（次の一手候補として）。

## 12. Out-of-scope Items（今回やらない）

- 最適編成の総当たり探索（要 Map 化。docs「実装するときの注意」）。
- 紹介カード出力（BINGO の canvas 書き出し流用。docs「次の一手」5）。
- 未実装カードのユーザー定義仮置き。
- スクショ・OCR による入力。
- スキル値（skillLeader/skillTotal）のカードからの自動計算（データ未配信）。
- WL サポート編成の自動計算（手入力のまま。eventBonus の opts.supportBonus）。
- eslint 設定の追加・`npm run lint` の修復。
- 既存ツールの改修・リファクタ全般。
- キャンバス birthday レアリティの実測検証（docs「未確定のもの」。データ上は計算される。そのままでよい）。

---

## 13. ゲート記録（実装後・独立検分 2026-08-02）

指示書を書いたのとは別のモデルに、指示書と現物を自分で読ませ、`npm test` / `npm run build` を
自分で叩かせた上で判定させたもの。**判定: 条件付き合格（CRITICAL なし）**。

検分側が自前の監査スクリプトで確認した事実:
- `public/CardDatas/thumb/` 2,363ファイルを `cards.json` と全件突き合わせ、
  **派生データに無いアセット 0件 / 特訓絵を持たないカードの after_training 0件 /
  最大 cardId 1438**（docs にある解禁前の 1439 は不在）。未公開データの漏洩なし
- 実行時に外部へ出る経路は無し（`src/` の fetch は `BASE_URL` 起点のみ）
- 実測一致のテストは自作自演ではない（期待値は measurements.json＝実機値。
  `power.ts` / `eventBonus.ts` / `measurements.json` は変更されていない）

指摘と対応:

| 指摘 | 対応 |
|---|---|
| H-1 カード画像の取得は §5 の Stop-and-Ask 事項（指示書は「画像取得も不可」としていた） | **Nori が会話中に明示承認**（2026-08-02。「通常＋特訓後・約8MB」を選択）。実装は既存のジャケット取得と同型で、遮断も上記のとおり穴なし。§4-1 と §8-2 の該当記述はこの承認で置き換わる |
| H-2 `/deck` の ProfileBar が何もしない死にボタン | 比較パネルへ移し、スキル・焚き数を実際に反映するよう配線。初期値も編成プロフィールから引く |
| M-1 配信テーブルが行ごとの検証なしのキャスト | `useCardData.ts` に行単位の検証を追加（壊れた行が混ざっても画面が落ちない） |
| M-2（疑い）同一キャラを2枚編成できる | ゲームの仕様どおり**同キャラを選べなくした**（別カードでも不可。「同キャラ編成中」と表示） |
| M-3 比較でカードが欠けた編成が黙って混ざる | 5枚未満は表に枚数を出す（全一致が付かず総合力が大きく下がるため） |
| M-4 イベント未選択のボーナスが 0 に潰れる | プロフィールへは書かない／比較は「イベントを選ぶと比較できます」に |
| M-5 配信 JSON の再生成が同居 | 画像取得の動作確認で同時に走ったもの。カード集合は main と同一（検分側も確認） |
| LOW エリア未入力判定 / 数値入力の NaN | どちらも修正（属性・キャラだけの入力を誤警告しない／`sanitizeDecimal` でテスト付き） |

---

## 14. 実装前に確認すべき質問（Nori へ）

1. /deck をヘッダー primary（4枠固定・現在満杯）に入れるか。入れるならどれを降ろすか。**既定: 入れない**（ハブとモバイルメニューから辿る）。
2. ツールのユニットカラー。**既定: wxs**（他と被りが最少）。こだわりがあれば一言で変更可能。

上記以外は本書の既定で進めてよい。
