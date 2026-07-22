# デザイン言語（不可侵ライン）

現行 vanilla 版（`legacy/common.css`）から抽出。**全面リライト後もこの2つは必ず維持する**（Nori確定 2026-07-22）。サイズ・配置・ヘッダー/フッターは自由に改変してよいが、下記2点は守る。

## 1. ニューモーフィズム（Neumorphism）

土台は明るいグレーで、要素を「押し出した／へこませた」柔らかい陰影で表現する。

| 要素 | 値 |
|---|---|
| ベース背景 | `#f0f0f0` |
| 浮き出し（大：コンテナ） | `box-shadow: 5px 5px 10px #bebebe, -5px -5px 10px #ffffff;` 角丸12px |
| 浮き出し（小：ラベル/ボタン） | `box-shadow: 3px 3px 6px #bebebe, -3px -3px 6px #ffffff;` 角丸5px |
| へこみ（inset・入力欄など） | `box-shadow: inset 3px 3px 6px #bebebe, inset -3px -3px 6px #ffffff;` |
| フォント | `M PLUS Rounded 1c`（丸ゴシック） |
| 本文色 | `#333` / ラベル `#494949` |

光源は左上（明るい影 `#ffffff` が左上、暗い影 `#bebebe` が右下）。Tailwind では `@theme` に `--shadow-neu` / `--shadow-neu-sm` / `--shadow-neu-inset` を定義して `shadow-neu` 等で使う。

## 2. ユニットカラー（Unit Colors）

プロセカ6ユニット＋全メンバーの色。ページ/文脈ごとにテーマ色 `--unit-color`（旧 `--unit-corlor`）と `--member-color-01〜04` を差し替えて配色する。タイトルは斜めのカラーバナー（`.title::before` を45°回転）。

### ユニット代表色
| ユニット | 色（短縮→展開） |
|---|---|
| VIRTUAL SINGER | （初音ミク基準）`#3CB` → `#33CCBB` |
| Leo/need | `#45D` → `#4455DD` |
| MORE MORE JUMP! | `#8d4` → `#88DD44` |
| Vivid BAD SQUAD | `#E16` → `#EE1166` |
| ワンダーランズ×ショウタイム | `#F90` → `#FF9900` |
| 25時、ナイトコードで。 | `#849` → `#884499` |

### メンバー色（検索・凡例用に保持）
- VS: 初音ミク #3CB / 鏡音リン #FC1 / 鏡音レン #FE1 / 巡音ルカ #fbc / MEIKO #d44 / KAITO #36c
- Leo/need: 星乃一歌 #3AE / 天馬咲希 #FD4 / 望月穂波 #F66 / 日野森志歩 #BD2
- MMJ: 花里みのり #fca / 桐谷遥 #9cf / 桃井愛莉 #fac / 日野森雫 #9ed
- VBS: 小豆沢こはね #F69 / 白石杏 #0Bd / 東雲彰人 #F72 / 青柳冬弥 #07D
- WxS: 天馬司 #FB0 / 鳳えむ #F6B / 草薙寧々 #3D9 / 神代類 #B8E
- 25時: 宵崎奏 #B68 / 朝比奈まふゆ #88C / 東雲絵名 #CA8 / 暁山瑞希 #DAC

### 使い方
- 各ツール/ページは自分のテーマ色を `--unit-color` に設定（例: ラッパーの style / ルートに data 属性）。
- 見出し `.title`：`border: 2px solid var(--unit-color)` ＋ 斜めバナー ＋ 白文字。
- ラベルの下線/左線に `--member-color-01〜04` を使い分ける（`add-Border-0x` / `add-LeftLine-0x`）。
- 入力欄の border と focus も `--unit-color`。

## 資産
- team logos: `images/Team_Logo/*.png`（6ユニット）
- app icons: `images/App_icon/*.png`（Analyzer/evc/twibot/comingsoon）
- banner: `images/Banner3.jpeg` / favicon: `images/icon.webp`
- アイコンフォント: Material Icons（ハブのツールカード）

## 継承しないもの
- Point-Analyzer のダーク基調は持ち込まない。SekaiMaster はライト＋ニューモーフィズムが正。
