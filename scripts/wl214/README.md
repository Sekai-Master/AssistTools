# wl214 の運用スクリプト

event214（WL3 Part5）の総合ランキング支援で使った道具。
セッションをまたいで残すためにリポジトリへ置いてある。

| ファイル | 用途 |
|---|---|
| `genlive.py` | NAS の `borders.db` から `public/wl214/live.json` を生成する。実行したディレクトリに `live.json` を吐くので、そのあと `public/wl214/` へコピーする |
| `est.py` | 現在のボーダーから終値を推定する（過去WL3の同経過シェアで割り戻す旧手法）。**214のように全ランクが前傾しているイベントでは系統的に過大に出る**ので、上方バイアス込みで読む |
| `wl_ref_series.json` | 205/207/211 の 100/500/1000位の系列キャッシュ（est.py が読む） |
| `board_poll.py` | 章ランキング板を60秒間隔でポーリングし、指定プレイヤーの (時刻, 順位, 章Pt) を CSV に落とす。名前は**引数でのみ**渡す（リポに書かない）。板は約3分刻み・タイムスタンプは実時刻+約125秒。1周単価とレートの連続実測になる（2026-08-22 夜間で実証: 110周を全周分解） |
| `board_watch.py` | 上の CSV を20秒ごとに整形表示するライブビューワ。引数に CSV パス |
| `board.py` / `board5.py` | 総合1〜100位を「人」として追う分析。event211 でバックテストして倍率を出すのに使った。`top100_<event>.psv` を先に作る必要がある |

## 走者の申告値の置き場所

`genlive.py` 内の `runner` リストが唯一の正本。前回の live.json からは引き継がない
（引き継ぐ作りにしていたら、経過時刻を訂正したときに古い点が生き残って重複した）。

## 走者名

公開される `params.json` には置かない。brain 側のログに置く。

## top100_*.psv の作り方

```
ssh nas "sqlite3 -readonly -noheader -separator '|' -cmd '.timeout 30000' \
  /volume1/docker/sekai-border-tracker/data/borders.db \
  \"SELECT timestamp, rank, score, replace(replace(user_name,'|','/'),char(10),' ') \
    FROM border_snapshots WHERE event_id=214 AND board_type='overall' AND rank<=100 \
    ORDER BY timestamp, rank;\"" > top100_214.psv
```
