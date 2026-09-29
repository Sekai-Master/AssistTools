# ボーダー予測（収集・予測ログ・自己改善・配信）

役割: [#128](https://github.com/Sekai-Master/AssistTools/issues/128)（自己改善システム）と [#129](https://github.com/Sekai-Master/AssistTools/issues/129)（収集と予測ログの器）の実装の正本。構成・モデル・無料枠の見積り・運用手順をここに置く。

最終更新: 2026-09-30

---

## 1. 全体像

```
sekai.best /event/live ──(30分ごと)──▶ Worker sekaimaster-border ──▶ D1 sekaimaster-border
                                         │ Cron: 実測を保存 → 有効なモデルで予測 → 予測ログ
                                         │       → 経過50%・85%で投稿キューに積む
                                         └ /admin/*（解析ジョブ・Bot 用、Bearer トークン）

GitHub Actions「Border prediction analysis」(1日2回)
  bonuses.json（日程）＋ sekai.best graph（終わったイベント）
  → 形（シェア列）を D1 へ → 全履歴で前向き検証 → 王者と帯を決めて新しい版を有効化
  → 終わったマラソンを予測ログで採点 → レポート → 答え合わせの投稿をキューへ

サイト /border ──(同一オリジン)──▶ Pages Functions /api/border/* ──▶ D1（読むだけ）
sekaimaster-bot（NAS）──▶ /admin/posts?unsent=… ──▶ X / Discord に送って送信済みを付ける
```

| 部品 | 場所 | 役割 |
|---|---|---|
| Worker | `workers/border/` | Cron（`5,35 * * * *`）で収集と予測。管理 API |
| モデル | `workers/border/src/model.ts` | 予測・前向き検証の純粋関数。**Worker と解析ジョブが同じファイルを使う** |
| 学習 | `workers/border/src/fit.ts` | 候補の採点・王者の選択・帯・表の焼き込み（解析ジョブだけが使う） |
| 投稿文 | `workers/border/src/posts.ts` | X の重み付き文字数で 280 以内に収める。数値はプログラムで埋める |
| 解析ジョブ | `scripts/border/analyze.ts` | `node scripts/border/analyze.ts`（依存パッケージ無し） |
| 公開の読み出し | `functions/api/border/[[path]].ts` → `workers/border/src/public.ts` | 画面用。D1 は Pages のバインディング `BORDER_DB` |
| 画面 | `src/pages/border/` | `/border`。**まだハブに載せていない**（§6） |
| D1 | `workers/border/migrations/` | 表の定義と、書き込み行数を抑える工夫の理由はファイル冒頭 |

## 2. モデル（`share-median-v1`）

`終値予測 = 現在の実測ボーダー ÷ シェア表(期間, 順位帯, 経過率)`。シェア＝「過去のイベントで、その経過率の時点に終値の何割まで積み上がっていたか」の中央値。水準（イベントの熱さ）は現在値がすでに運んでいるので、過去から借りるのは**形だけ**。根拠と検証の経緯は brain の `log/2026-09-02-border-prediction-system.md`。

- 経過率の格子は 0.02 刻み（51点）。サンプルの空白が **2時間を超える区間は補間しない**（216 で sekai.best が 23時間止まり、補間した点の誤差が壊れた）
- 誤差の定義は `予測 ÷ 実測終値 − 1`（マイナス＝低く外した）

### 2.1 自己改善（王者と挑戦者）

候補は4つ。どれも「対象イベントの開始前に終わったイベントだけ」で表を作る（リークは `test/model.test.ts` で落ちることを確認済み）。

| 候補 | プール |
|---|---|
| `same_all` | 同じ期間の全履歴（標本3件未満なら全マラソン）。旧 v0 と同じ |
| `same_recent8` | 同じ期間の直近8件 |
| `all_recent12` | 期間を問わず直近12件 |
| `same_all_debias5` | `same_all` を、直近5件で出ていた偏り（誤差の中央値）で補正 |

1. 終わったマラソンを時系列順に並べ、各候補で**前向き検証**（その時点までのデータだけで当てる）
2. 1イベントの点数＝経過率 0.40〜0.96 の |誤差| の中央値。直近8件の平均で比べる
3. 挑戦者が王者より **5%以上**良いときだけ入れ替える（ヒステリシス）。**順位帯ごとに別々に選ぶ**
4. 帯＝王者の直近20件の誤差（経過率 ±0.04 の範囲）の **10〜90パーセンタイル**。非対称のまま使う（系統的に低く外す帯は、帯が上に伸びる）
5. 表に出し始める経過率＝帯の幅が 15ポイント以下で安定する最初の点（0.3 未満にはしない）
6. 版の名前は `share-median-v1@e{学習に入れた最後のイベント}`。予測ログに版を必ず残す

**人が方向の補正を足す枠は作らない**（215 で人の下方修正が精度を下げた。brain log §11.2②）。補正は「補正つき候補」が前向き検証で勝ったときだけ自動で入る。

### 2.2 対象外

マラソン型だけを予測する。ワールドリンク・チアフルカーニバルは実測の保存だけ行う（将来の別モデル用）。

## 3. 無料枠の見積り（2026-09-30）

同じ Cloudflare アカウントの SAWAYAKA と**枠を共有する**。SAWAYAKA は 2026-09-29 に D1 の書き込み枠を使い切った。

| 項目 | 上限（無料） | ボーダー側の使用量 |
|---|---|---|
| D1 書き込み | 10万行/日 | 開催中: 1回あたり 実測6＋予測6＋kv 2 ＝14行 × 48回 ＝ **約670行/日**。開催外: 日程の差分のみ（0〜数行）。解析ジョブ: 1イベントあたり形6＋版1＋レポート1＋投稿1 |
| D1 読み取り | 500万行/日 | Cron 1回で数行。画面は1リクエスト1〜2行（事前に組んだ kv を返す） |
| Workers リクエスト | 10万/日 | Cron 48回/日＋画面の表示回数（`/api/border/*` だけが Functions を起動する） |
| Cron Trigger | 5本/アカウント | 1本（SAWAYAKA が3本） |
| Worker CPU | 10ms/回（Cron も同じ） | 実測1回の parse（約90KB）＋割り算6回。日程（288KB）は開催外の回にしか読まない |
| Pages ビルド | 500回/月 | **増えない**（解析ジョブはコミットしない） |
| 初回投入 | — | 形 94イベント×6 ≒ 560行（1回だけ） |

## 4. 初回の立ち上げ

```sh
cd workers/border
npx wrangler d1 create sekaimaster-border        # 出てきた database_id を wrangler.jsonc へ
npx wrangler d1 migrations apply sekaimaster-border --remote
npx wrangler deploy
openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN   # 同じ値を GitHub の secret に
```

- GitHub: `secrets.BORDER_ADMIN_TOKEN`（上と同じ値）と `vars.BORDER_API`（Worker の URL）
- Pages プロジェクト `sekaimaster` の設定 → バインディングに D1 `BORDER_DB` = `sekaimaster-border`（本番・プレビュー両方）
- 形の初回投入: Actions の「Border prediction analysis」を `backfill: true` で手動実行

## 5. 運用

- **見る場所**: `https://sekaimaster.pages.dev/api/border/current`（最新の予測）、Actions の実行結果のサマリ（版・候補・誤差・帯の的中率）、`npx wrangler tail sekaimaster-border`
- **sekai.best が止まったとき**: 同じ `sampleAt` が返ってくる回は予測を積み増さない（`stale`）。画面は90分以上止まると注意を出す
- **投稿**: Worker と解析ジョブは D1 の `posts` に積むだけ。**送るかどうかは sekaimaster-bot 側の設定**（X・Discord それぞれ別スイッチ）。古い投稿は Bot 側で捨てる
- **モデルを手で戻したい**: `models` 表の `active` を付け替える（版は消さない）

## 6. 公開の手順（運営者が決める）

`/border` は URL を知っていれば開けるが、ハブには載せていない。載せるときは:

1. `src/motion/routes.ts` の `/border` を `PAGE_LOADERS` から `ROUTE_LOADERS` へ移し、`src/tools.ts` の `TOOLS` に登録する（カテゴリは「計画」）
2. `CHANGELOG.md` に MINOR で載せる（[versioning.md](versioning.md)）
3. X で告知する（[x-operations.md](x-operations.md) の「新ツール」テンプレ）
4. Bot の X 送信スイッチを入れる

## 7. 判断の記録

- **Actions で取得して JSON をコミットする案は採らない**: 30分ごとのコミットは Pages のビルド（500回/月・同時1本）を食い潰し、コードのデプロイを詰まらせる
- **画面は Pages Functions 経由で読む**: workers.dev を直接叩かせると、プライバシーポリシー第5項「ページを開いただけで外部のサーバーに接続しない」が嘘になる
- **学習は Worker でやらない**: 無料枠の CPU は Cron でも 10ms。前向き検証は数万回の中央値計算になる
- **KV ではなく D1**: 予測ログを引いて採点し直すので、問い合わせのできる置き場所が要る
