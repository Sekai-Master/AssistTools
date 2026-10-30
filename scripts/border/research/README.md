# ボーダー予測の検証（research）

モデルの改善案を、本番と同じ `predict()` に通して比べるための道具一式。結果のまとめは [RESULTS.md](RESULTS.md)。

## しくみ

- **入れ子の前向き検証**（`eval.ts`）: 各回を「その回の開始前に終わった回だけ」で学習し直した版で当てる。王者・切り替え点・帯の裾といった学習の中の選択も毎回やり直すので、調整ごと前向きになる
- **2つの時代**（`data.ts`）: `new` は 124回以降（本番の学習と同じ範囲）、`old` は 1〜85回（本番の開発で一度も見ていない回。改善が時代を越えて効くかの確かめ）
- **初めての長さ**（`--lodo`）: 当てる回と同じ長さの回を学習から抜き、「前例の無い長さ」を作り出す。102h・246h のような回は数件しかないので、この作り方でないと比べられない
- **方法**（`fitx.ts`・`methods.ts`）: `fitx.ts` は `fit.ts` の fitModel を改善案で切り替えられるようにした写し。`PROD` の設定で旧本番と一致する（差は丸めの 0.0003 未満）
- **集計**（`report.ts`・`factor.ts`）: 回を単位に比べる（同じ回の6順位・51点は強く相関するので、順位で平均してから回で比べる）。本番との差には、回を再標本化したブートストラップの 90% 区間を付ける

## 動かし方

```sh
cd scripts/border/research
node eval.ts --era new --method prod            # 本番（workers/border/src/fit.ts）
node eval.ts --era new --method x_prod          # 旧本番の写し
node eval.ts --era old --method rmix_band --lodo
node report.ts results/new-*.json --base x_prod # 表（markdown）。改善を入れたあとの prod は新本番なので、旧本番の写しと比べる
node factor.ts results/new-lodo-prod.json       # 前例の無い長さの帯の倍率を振る
./run-all.sh                                    # RESULTS.md の表を全部作り直す（4並列で数分）
```

手元で次の検証用のデータをまとめるときは `node scripts/border/research/export-data.ts`（本番 D1 の予測ログ・形・版・実測と、sekai.best の30分刻みの推移。wrangler のログインと sekai.best への接続が要る）。

`results/*.json` はコミットしない（数十MB）。データは `scripts/border/data/pace-seed.json`（形）と `data/events-meta.json`（マスタの日程）だけを使い、外には取りに行かない。
