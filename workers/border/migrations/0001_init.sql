-- ボーダー予測の収集・予測ログ・自己改善の器（AssistTools#129）
--
-- ★ D1 の無料枠は書き込み 10万行/日で、同じアカウントの SAWAYAKA と共有している。
--   索引の書き込みも1行に数えられるので、行の多い表は WITHOUT ROWID ＋複合主キーにして
--   「1行＝書き込み1回」に抑える。追加の CREATE INDEX は、行が増えてからだと
--   既存行ぶんの書き込みが一度に発生する（SAWAYAKA が 2026-09-29 に枠を使い切った原因）。

-- イベント日程（sekaimaster.pages.dev/CardDatas/bonuses.json の写し。直近ぶんだけ入る）
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  aggregate_at INTEGER NOT NULL
);

-- 実測（sekai.best /event/live）。ts は sekai.best 側の取得時刻
CREATE TABLE samples (
  event_id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (event_id, rank, ts)
) WITHOUT ROWID;

-- 予測ログ。どの版のモデルが、いつの実測から、何を出したか。
-- 表に出さなかった予測（visible = 0）も採点のために残す
CREATE TABLE predictions (
  event_id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  progress REAL NOT NULL,
  current INTEGER NOT NULL,
  share REAL NOT NULL,
  predicted INTEGER NOT NULL,
  low INTEGER,
  high INTEGER,
  visible INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, rank, ts, model_version)
) WITHOUT ROWID;

-- 終了イベントの形（学習データ）。share は GRID 51点の JSON 配列（欠測は null）
CREATE TABLE shapes (
  event_id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  final INTEGER NOT NULL,
  share TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, rank)
) WITHOUT ROWID;

-- モデルの版。active = 1 が1行だけある
CREATE TABLE models (
  version TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  summary TEXT NOT NULL
) WITHOUT ROWID;

-- イベント終了後の答え合わせ
CREATE TABLE reports (
  event_id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  body TEXT NOT NULL
);

-- 外への投稿キュー（X / Discord）。送るかどうかは受け取る側（sekaimaster-bot）が決める
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_x_at INTEGER,
  sent_discord_at INTEGER
) WITHOUT ROWID;

-- 小さな状態（current = 表示用のスナップショット、history:{id} = 予測の推移）
CREATE TABLE kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
