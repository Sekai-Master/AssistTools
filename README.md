# Sekai-Master

プロセカ（プロジェクトセカイ カラフルステージ！ feat. 初音ミク）をより楽しむためのツール集。

## ツール

- **ついぼジェネレーター** — 協力ライブ募集ツイート（ついぼ）を作成。ライブプレビュー・履歴・実募集文由来のテンプレ付き。
- **スキル実効値計算機** — 先頭スキル値・内部値から実効値を算出（逆算・ブルフェス個体対応）。
- **ポイント調整アナライザー** — 目標ポイントへの調整プラン（マイセカイ配分・ライブ調整・ラストラン）を算出。
- **BINGOカードジェネレーター** — チアフルカーニバル用のBINGOカードを生成（シード値で再現可能）。

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

## デプロイ

`netlify.toml` にビルド設定を定義済み（`npm run build` → `dist`）。Netlify にリポジトリを接続すれば自動デプロイされる。

## 移植元・謝辞

本サイトは vanilla HTML/CSS/JS 版（`legacy/`）からのリライト。各ツールの元仕様は `docs/porting/` に記録。
BINGO生成は匿名M氏の「チアフルビンゴ自動生成シート」を、ポイント調整は関連コミュニティの解説を参考にしている。

本サイトは非公式ファンサイトであり、株式会社セガ・Colorful Palette Inc. とは一切関係ありません。

## ライセンス

MIT License（コード）。ゲーム内の名称・データ・画像等は各権利者に帰属します。
