# 知識ガイドの原稿（/guide）

`ch0.md`〜`ch9.md` がページ（/guide・/guide/1〜9）の正本。ページは Markdown をそのまま読む（読み取りは `src/pages/guide/lib/`、記法は知見ノートの `src/pages/knowledge/lib/md.ts` と同じ）。

- 各章の先頭は `## N. 章の名前`、節は `### N.M 節の名前`（節の番号がアンカーになる: `/guide/3#s3-2`）
- 第 0 章は /guide（目次のページ）の前置きに出る。/guide/0 は /guide へ送る
- 図: 行に `［図N: 題］` だけを書く → `src/pages/guide/figures/figN-*.svg` を埋め込む
- 画像: 行に `［画像N: 題］` だけを書く → 撮影 N の画像（台帳は `src/pages/guide/lib/images.ts`、ファイルは `public/guide/`）
- 確かさの印: 文中の `〔公式〕` `〔公式・2024年9月から〕` `〔このサイトの計算〕` など（種類は第 0 章 0.1 の表）
- 第 9 章の表: 見出しが「ツール」の列（またはパスの列）から `src/tools.ts` を引き、説明の列はページが足す（ここに書き写さない）

存在しない図・画像の番号、知らない印、書き損じの差し込み、tools.ts に無いツールは `src/pages/guide/lib/guide.test.ts` が落とす。画像は伏せた版から作ったもの以外を `public/guide/` に置かない（`images.test.ts` がファイル名の一覧を固定して照合する。作り方は `scripts/make-guide-images.mjs`）。

`public/guide/` の画像・zip を差し替えたら、`src/pages/guide/lib/images.test.ts` の SHA-256 の一覧（`ASSET_SHA256`）を、テストが落ちたときに出る今の値で書き換える（中身を確かめてから書き換える。伏せる前の撮影の紛れ込みを拾うための一覧）。
