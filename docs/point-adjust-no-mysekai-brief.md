# 実装ブリーフ: ポイント調整「マイセカイを使わない」モード

対象リポジトリ: `C:\Users\masan\Documents\GitHub\AssistTools`（Sekai-Master/AssistTools、`main` が Netlify 自動デプロイ）
対象ツール: ポイント調整アナライザー（`/analyzer`、`src/pages/analyzer/`）
依頼者: Nori
このドキュメントは単体で完結している。会話履歴は見なくてよい。

---

## 1. やりたいこと（依頼原文）

> ポイント調整に関してマイセカイを考慮しない計算を選択可能にしたい

ポイント調整アナライザーは今、**マイセカイ採取を必ず使う前提**で「目標ポイントちょうど」への着地プランを組む。
マイセカイを使わない／使えないユーザー向けに、**マイセカイ抜きで計算するモードを選べるようにする**のがゴール。

---

## 2. 現状の設計（正確に把握してから触ること）

### データフロー

`PointAnalyzer.tsx`（UI・入力）→ `calculatePlanV6()`（`lib/calculator.ts`、オーケストレーション）→ 各モジュール。

```
calculatePlanV6(currentPt, targetPt, finalRunPt, talent, bonus, hasWorldPass, finalSongId, musicsList)
  1. unitBasePt   = calculateUnitBasePt(talent, bonus, hasWorldPass)   // mySekai.ts
  2. totalDiff      = targetPt - currentPt
     adjustableDiff = totalDiff - finalRunPt
  3. allocation   = allocateMySekai(adjustableDiff, unitBasePt)        // mySekai.ts ★ここが対象
  4. liveRequired = adjustableDiff - allocation.totalPt
     live         = planLiveAdjustment(liveRequired, bonus)            // liveAdjust.ts
  6. finalRunPlans= planFinalRun(finalRunPt, finalBase, bonus)         // finalRun.ts
  7. estimatedTotal = currentPt + allocation.totalPt + liveAdjPt + finalRunPt
     isVerified     = estimatedTotal === targetPt && live.status === "OK"
```

### 各モジュールの責務

| ファイル | 役割 |
|---|---|
| `lib/calculator.ts` | 上記の順に呼びログと検証をまとめるだけ。計算の実体は持たない |
| `lib/mySekai.ts` | マイセカイ単価と採取配分。`allocateMySekai` が差分の**大部分を吸収**する |
| `lib/liveAdjust.ts` | ライブ1回（LB 0〜1・エビ基礎点100固定）で端数を**ちょうど**埋めるスコア帯を逆算 |
| `lib/finalRun.ts` | ラストランのプラン列挙 |
| `lib/constants.ts` | 定数。`LIVE_ADJUST_RESERVE = 100`、メモリ値 A=1.0/B=0.5/C=0.2 |
| `steps/MySekaiStep.tsx` / `LiveAdjustStep.tsx` / `FinalRunStep.tsx` | 結果表示 |

### 役割分担の要点（ここが設計の心臓）

- **マイセカイ＝粗い大量吸収役**。単価 `unitBasePt` は1メモリあたり（実測例: 総合力297,159・ボーナス615% → 1100 Pt/メモリ）。
  最小粒度は C = 0.2メモリ ≒ `0.2 × unitBasePt`（上例で約220 Pt）。これで**百万単位の差分を粒度220Ptまで削る**。
- **ライブ端数調整＝最後の微調整役**。`allocateMySekai` は `LIVE_ADJUST_RESERVE`(=100Pt) を必ず残す。
  `planLiveAdjustment` は**ライブ1回ぶん**しか解かない（`ADJUST_LIVE_BONUSES = [0, 1]`、基礎点100固定、スコア係数 N は 0〜200）。
  → **1回のライブで到達できるポイントは高々数千Pt程度**。百万単位は絶対に解けない。

---

## 3. ★中核の設計論点（単純にスキップすると壊れる）

`allocateMySekai` を単に飛ばすと `liveRequired = adjustableDiff`（＝百万単位になりうる）が
そのまま `planLiveAdjustment` に渡る。上記のとおりライブ1回では解けないので **`status: "NG"` が返り、
UI は「この条件では目標ちょうどに着地できません」を出す。つまり素朴な実装は "常にNG" の使えない機能になる。**

**マイセカイを外すと「差分の吸収役」が消える** ——これが本質。ここをどう設計するかが本タスクの主論点。

### 候補案（監督が選ぶ / 別案でもよい）

**A案: 素直にスキップ＋不能時の明示ガイド**
マイセカイ配分を0にし、ライブ端数調整＋ラストランで埋まる範囲だけ「着地可能」とする。
埋まらない場合は NG ではなく「マイセカイ無しでは到達不可。マイセカイ無しで狙える差分は最大◯Pt」と
**理由と代替を明示**する。実装が軽く、嘘をつかない。ただし大差分では機能しない。

**B案: 調整ライブを複数回許す**
`planLiveAdjustment` を「N回のライブで合計 liveRequired ちょうど」に拡張（回数上限を設ける）。
吸収力は上がるが探索が重くなりがちで、ちょうど着地の組合せ爆発に注意。

**C案: 通常周回ライブを吸収役に据える**
「普通に周回するライブ K 回」で粗く詰め、最後の1回で端数調整。
※ただし通常ライブの獲得ptはスコア次第で揺れるので「ちょうど着地」の保証が弱い。
マイセカイが吸収役に選ばれている理由がまさにこれ（採取は取得数が決定的で揺れない）である点に注意。

**推奨の出発点**: A案を土台に、必要なら B案を足す。C案は「ちょうど着地」というツールの根幹保証を壊しやすいので慎重に。
ただし最終判断は監督に委ねる。**「常にNGになる素朴スキップ」だけは避けること。**

---

## 4. 勝利条件（受け入れ条件）

1. ポイント調整アナライザーに**マイセカイを使う/使わないを切り替えるUI**がある（既存の `Switch` コンポーネントを流用可。「ワールドパス 有効」と同じ並び）。
2. OFF のとき、結果に**マイセカイのステップが出ない**（または「使用しない」と明示される）。
3. OFF のとき、**着地可能なケースは正しく着地し、不可能なケースは理由と限界値を提示する**（無言のNGや、常にNGは不可）。
4. ON のときの**既存の挙動が1ミリも変わらない**（既存テストが全て通る）。
5. 計算ロジックの変更には**ユニットテストを追加**する（`lib/*.test.ts` に倣う。vitest）。
6. `npx tsc --noEmit` / `npm test -- --run` / `npm run build` が全て通る。

## 5. 禁じ手

- 既存の ON 経路の計算結果を変えること（リグレッション厳禁）。
- `constants.ts` のゲーム仕様定数（`LIVE_ADJUST_RESERVE`, メモリ値, `SCORE_STEP` 等）を**検証なしに書き換える**こと。
  これらはマスタDB/実測で裏を取った値。変更が必要なら根拠を明記すること。
- 「ちょうど着地」という保証を黙って緩めること（近似で妥協するなら UI で明示する）。
- 既存テストを通すためにテスト側を書き換えること（実装を直す。テストが間違っている場合のみ、理由を書いて変更）。
- マイセカイ関連の既存コメント（`mySekai.ts` 冒頭のスコープ外事項、`liveAdjust.ts` の判定順序の注意）を消すこと。これらは過去のバグ再発防止のために書かれている。

## 6. 触る想定のファイル

- `src/pages/analyzer/lib/calculator.ts`（オプション引数を通す／分岐）
- `src/pages/analyzer/PointAnalyzer.tsx`（トグルUIと `calculatePlanV6` への受け渡し）
- `src/pages/analyzer/steps/MySekaiStep.tsx`（OFF時の表示）
- `src/pages/analyzer/lib/liveAdjust.ts`（B案を採るなら）
- 対応するテスト `lib/calculator.test.ts` / `lib/mySekai.test.ts` など

## 7. リポジトリ規約

- Vite 7 + React 19 + TypeScript + Tailwind CSS 4 + vitest。
- コメントは日本語。**「なぜそうしたか」を書く**（既存コードがその流儀。特に落とし穴の説明を厚く書いてある）。
- 関数は小さく、純ロジックは `lib/` に置き UI から分離する（既存の分割を踏襲）。
- 外部データ・境界値には型/nullガードを入れる。
- コミットは Conventional Commits（`feat:` / `fix:` 等）、メッセージ本文は日本語可。**Co-Authored-By 等の署名は付けない**（グローバル設定で無効化されている）。
- ブランチ: `main` が本番自動デプロイ。**プッシュは Nori の指示があるまで行わない**。コミットまでで止めて報告すること。

## 8. 検証コマンド

```bash
cd C:\Users\masan\Documents\GitHub\AssistTools
npx tsc --noEmit
npm test -- --run
npm run build
```

## 9. 監督に一番考えてほしい問い（1つ）

**「マイセカイという粗い大量吸収役を外したとき、"目標ちょうどに着地する" という本ツールの保証をどう維持するか。維持できない領域はユーザーにどう伝えるか。」**

ここの設計判断がこの機能の価値をほぼ決める。UIトグルの実装自体は些末。
