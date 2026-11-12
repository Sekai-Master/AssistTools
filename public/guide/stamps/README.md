# スタンプの絵（知識ガイドのスタンプ早見表）

知識ガイドの「スタンプ早見表」（docs/guide/stamps.md）に出す、ゲームのスタンプの絵。

- 一覧と名前: Sekai-World/sekai-master-db-diff の `stamps.json`（<https://github.com/Sekai-World/sekai-master-db-diff>）
- 絵: storage.sekai.best（`https://storage.sekai.best/sekai-jp-assets/stamp/<asset>/<asset>.webp`）
- 取得: 2026-11-12（各ファイルの出どころの URL・名前・バイト数は `manifest.json`）
- 絵は取得したまま（変換していない）。ファイル名は asset 名（`stamp0014.webp` など）
- ゲームの素材の権利は株式会社セガ・Colorful Palette Inc. にある。サイトは非公式のファンサイト

足すときは manifest.json にも同じ形で行を足す（`src/pages/guide/lib/stamps.test.ts` が、早見表の asset 名がここにあり manifest に載っていることを照合する）。
