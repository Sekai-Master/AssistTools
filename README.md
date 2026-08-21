# Sekai-Master

プロセカ（プロジェクトセカイ カラフルステージ！ feat. 初音ミク）をより楽しむためのツール集。

## ツール

- **ついぼジェネレーター** — 協力ライブ募集ツイート（ついぼ）を作成。ライブプレビュー・履歴・実募集文由来のテンプレ付き。
- **スキル実効値計算機** — 先頭スキル値・内部値から実効値を算出（逆算・ブルフェス個体対応）。
- **ポイント調整アナライザー** — 目標ポイントへの調整プラン（マイセカイ配分・ライブ調整・ラストラン）を算出。
- **BINGOカードジェネレーター** — チアフルカーニバル用のBINGOカードを生成（シード値で再現可能）。
- **編成ビルダー** — カード5枚のイベントボーナスと総合力を算出。編成を並べて最終イベントポイントで比較できる（ボーナスを落として総合力を盛った方が勝つ場合を出すためのもの）。
- **リフレッシュゲージ計算機** — 現在のゲージから100%までの時間・持続ペースを算出。プレイ/休憩/マイセカイを積んで推移も計画できる。
- **必要稼働時間計算** — 焚き数・稼働時間・編成ボーナスから到達ポイントを算出（目標からの逆算・必要ライボ付き）。
- **周回プラン** — 焚き数×時間の稼働枠を積んで、累積の到達ポイントと到達時刻を可視化。
- **効率曲ランキング** — 手動周回・オート周回・チャレンジライブの3つで効率曲を順位表示。
- **周回ラップ計測** — 1周終わるたびに押すだけで、実測のラップ・オーバーヘッド・周/時を算出。中断ボタンで休憩や部屋落ちを平均から自動で外す。実測の時速は編成プロフィールに取り込める（[設計](docs/lap-timer.md)）。
- **マイセカイ リアクション図鑑** — キャラが反応する家具をキャラ別に一覧。ゲーム内の絞り込みは自分が設計図を持っている家具しか出ないので、まだ持っていない家具や模写しに行く候補を探せる（[設計](docs/mysekai-reactions.md)）。

## 技術スタック

- [Vite](https://vite.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)（CSS-first。デザインはニューモーフィズム＋プロセカ6ユニットカラー）
- [React Router](https://reactrouter.com/) / [Vitest](https://vitest.dev/)

## 開発

```bash
npm install
npm run dev            # 開発サーバー
npm test               # テスト（vitest）
npm run test:coverage  # カバレッジ
npm run build          # 型チェック + 本番ビルド
```

## データ更新

楽曲データとジャケット画像は `public/MusicDatas/` にある。マスタDB（Sekai-World/sekai-master-db-diff）と
sekai.best から再生成する:

```bash
npm run data:refresh
```

全楽曲を最新化し、ジャケットを256px webp に縮小して保存する（マスタに存在する曲の取りこぼしは自動検知）。

カード・イベントとマイセカイの家具は別コマンド:

```bash
npm run data:refresh-cards    # public/CardDatas/（カード・イベント・サムネイル・立ち絵）
npm run data:refresh-mysekai  # public/MysekaiDatas/（家具とキャラの反応）
```

いずれも GitHub Actions が定期実行して直接コミットするので、手元で叩く必要は普段ない。
**マイセカイの家具マスタは日付欄を持たず未公開判定ができない**という制約があるため、
そこを触る前に [docs/mysekai-reactions.md](docs/mysekai-reactions.md) を読むこと。

## デプロイ

**Cloudflare Pages**（<https://sekaimaster.pages.dev>）。`.github/workflows/ci.yml` が `main` への push で
test / build / lint を回し、**全部通ったときだけ** `wrangler pages deploy` する。
旧 URL `sekaimaster.netlify.app` は 301 リダイレクタとして生かしてある（`netlify.toml` はその名残）。

アクセス解析（Cloudflare Web Analytics）は Cloudflare Pages 側の設定で有効にしてあり、
**配信時にビーコンが自動挿入される**。リポジトリのコードには入っていないので、手元のビルドには付かない。

## バージョン管理

`package.json` の `version` が正本で、フッターに出る。更新履歴の正本は [CHANGELOG.md](CHANGELOG.md) で、
サイトの [更新履歴ページ](https://sekaimaster.pages.dev/changelog) はこれを解析して描画している。

**カード・楽曲データの自動更新ではバージョンを上げない**（データの鮮度はフッターの「データ更新」に別途出る）。
版の決め方・リリース手順・規約を改訂するときの手順は **[docs/versioning.md](docs/versioning.md)**。
公式 X の運用と告知テンプレは [docs/x-operations.md](docs/x-operations.md)。

## 移植元・謝辞

本サイトは vanilla HTML/CSS/JS 版（`legacy/`）からのリライト。各ツールの元仕様は `docs/porting/` に記録。
BINGO生成は匿名M氏の「チアフルビンゴ自動生成シート」を、ポイント調整は関連コミュニティの解説を参考にしている。

本サイトは非公式ファンサイトであり、株式会社セガ・Colorful Palette Inc. とは一切関係ありません。

## 規約

- [利用規約](https://sekaimaster.pages.dev/terms)（実体は `src/pages/legal/TermsPage.tsx`）
- [プライバシーポリシー](https://sekaimaster.pages.dev/privacy)（同 `PrivacyPage.tsx`）

サイト名・問い合わせ窓口・施行日は `src/lib/site.ts` に集約している。窓口を変えるときはそこだけ直す。

## ライセンス

MIT License（コード）。ゲーム内の名称・データ・画像等は各権利者に帰属します。
