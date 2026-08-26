#!/usr/bin/env python3
"""NAS 上で動く、event214 のライブビューア。Mac から `ssh nas` して眺めるためのもの。

なぜ NAS で動かすか:
  borders.db は NAS にあり、NAS は Tailscale で外から届く。Win 機を経由しないので、
  Win の画面が見えない場所（旅行先など）からでも `ssh nas` だけで済む。
  DB を読むだけなので収集側にも一切影響しない（readonly で開く）。

使い方（Mac から）:
    ssh nas
    python3 ~/wl214/nas_live.py "走者の名前"
  ワンライナーで:
    ssh -t nas 'python3 ~/wl214/nas_live.py "走者の名前"'

  --ch N     章（既定 5）。周回/オートの単価はここで切り替わる
  --every N  DB を見にいく間隔（秒・既定 20）。板は約3分刻みなので20秒で十分
  --back N   起動時に直近 N 時間ぶんを先に流す（既定 1.0）

⚠️Python 3.8 で動かすこと（NAS の python3 は 3.8.15）。3.9+ の記法は使わない。
"""
import argparse, datetime, json, os, sqlite3, sys, time, urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # NAS は LANG 未設定

DB = "/volume1/docker/sekai-border-tracker/data/borders.db"
# ⚠️DB（収集コンテナ）は 9〜12分刻みだが、**板そのものは約3分刻み**で更新される。
#   ライブで見るには粗いので、API を直に叩くのを主にして DB は起動時の遡りにだけ使う。
#   NAS から api.sekai.best には届く（2026-08-26 実測 200 / 1.7秒）。
API = "https://api.sekai.best/event/live"
UA = {"User-Agent": "sekaimaster-assist/1.0"}
T0 = datetime.datetime(2026, 8, 17, 20, 0)     # イベント開始 JST
END = datetime.datetime(2026, 8, 27, 20, 0)
EVENT = 214
# 章ごとの1回ぶんのPt（実測）。⚠️章が変わったら実測で更新する
# 1周ぶんの Pt は卓の質で 1% ほど揺れるので、ここは**実測の平均**を置く（分類は3%の許容で拾う）。
# ⚠️最頻値（レンジ上端）を置くとヘッダの表示が実測より高く見えて「上振れ」と誤読される。
UNITS = {3: (107975, 69125, 750), 4: (120157, 76685, 850), 5: (118049, 75530, 850)}
RANKS = (20, 30, 40, 50, 100)
C = {"dim": "\033[2m", "b": "\033[1m", "g": "\033[32m", "y": "\033[33m",
     "r": "\033[31m", "c": "\033[36m", "0": "\033[0m"}


def q(sql, args=()):
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True, timeout=20)
    try:
        return con.execute(sql, args).fetchall()
    finally:
        con.close()


def jst(ts):
    return datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")


def snapshots(name, since):
    """走者の (時刻, 順位, スコア) と、同じ時刻のボーダーを返す。"""
    rows = q("SELECT datetime(timestamp,'+9 hours'), rank, score FROM border_snapshots "
             "WHERE event_id=? AND board_type='overall' AND user_name=? "
             "AND datetime(timestamp,'+9 hours')>=? ORDER BY timestamp",
             (EVENT, name, since))
    return [(jst(t), int(rk), int(sc)) for t, rk, sc in rows]


def borders_at(ts):
    rows = q("SELECT rank, score FROM border_snapshots WHERE event_id=? AND board_type='overall' "
             "AND rank IN (20,30,40,50,100) AND score<>123456789 "
             "AND datetime(timestamp,'+9 hours')=?", (EVENT, ts.strftime("%Y-%m-%d %H:%M:%S")))
    return dict((int(r), int(s)) for r, s in rows)


def board():
    """板を直に取る。走者の行と、上位帯のボーダーを同じスナップショットから読む。"""
    req = urllib.request.Request(API, headers=UA)
    d = json.load(urllib.request.urlopen(req, timeout=25))
    rows = d.get("data", d).get("eventRankings", [])
    if not rows:
        return None, None, {}
    ts = rows[0].get("timestamp", "")
    t = datetime.datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S") + datetime.timedelta(hours=9)
    by_rank = {}
    for r in rows:
        rk = int(r.get("rank", 0))
        if rk in RANKS:
            by_rank[rk] = int(r["score"])
    return t, rows, by_rank


def classify(d, lap, auto, mys):
    if d == 0:
        return "停止", 0
    for k in range(1, 13):
        if abs(d - k * auto) <= 3:
            return "オート", k
    for k in range(1, 9):
        if abs(d - k * lap) / float(max(d, 1)) < 0.03:
            return "周回", k
    if d % mys == 0:
        return "マイセカイ", d // mys
    return "不明", 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", default=os.environ.get("WL214_RUNNER_NAME", ""))
    ap.add_argument("--ch", type=int, default=5)
    ap.add_argument("--every", type=int, default=20)
    ap.add_argument("--back", type=float, default=1.0)
    a = ap.parse_args()
    if not a.name:
        sys.exit("走者名を渡すこと: python3 nas_live.py \"名前\"")
    lap, auto, mys = UNITS[a.ch]
    since = (datetime.datetime.now() - datetime.timedelta(hours=a.back)).strftime("%Y-%m-%d %H:%M:%S")

    print("%sevent214 ライブ（ch%d）  1周 %s / オート1回 %s%s"
          % (C["b"], a.ch, "{:,}".format(lap), "{:,}".format(auto), C["0"]))
    print("%s走者 %s ／ %d秒ごとに板を直接見る（起動時だけ DB から遡り）。Ctrl-C で終了%s" % (C["dim"], a.name, a.every, C["0"]))
    print("%s%-5s %-6s %13s %10s %-11s %17s %s%s"
          % (C["dim"], "時刻", "順位", "総合Pt", "増分", "内容", "周/h・時速", "各順位まで", C["0"]))

    seen = set()
    laps = 0
    first = None
    prev = None
    hist = []            # (時刻, スコア) の直近履歴。移動平均の時速に使う
    backfilled = False   # 起動直後の一度だけ DB から遡る
    try:
        while True:
            try:
                if backfilled:
                    t, brows, bd = board()
                    hit = [r for r in (brows or []) if str(r.get("userName", "")) == a.name]
                    if not hit:
                        hit = [r for r in (brows or []) if str(r.get("userName", "")).startswith(a.name)]
                    rows = [(t, int(hit[0]["rank"]), int(hit[0]["score"]))] if (t and hit) else []
                    live_borders = bd
                else:
                    rows = snapshots(a.name, since)   # 起動直後の遡りだけ DB から
                    live_borders = None
                    backfilled = True
            except Exception as e:
                sys.stdout.write("\033[2K\r")
                print("%s取得に失敗（%s）。%d秒後に再試行%s" % (C["r"], e, a.every, C["0"]))
                time.sleep(a.every)
                continue
            for t, rk, sc in rows:
                if t in seen:
                    continue
                seen.add(t)
                d = sc - prev[1] if prev else 0
                kind, k = classify(d, lap, auto, mys) if prev else ("—", 0)
                if kind == "周回":
                    laps += k
                    if first is None:
                        first = (t, sc)
                # 時速は直近30分の移動平均。累積平均だと起動直後の停止区間を
                # いつまでも引きずって、走っているのに低い数字が出続ける
                hist.append((t, sc, laps))
                rate = ""
                win = [x for x in hist if (t - x[0]).total_seconds() <= 1800]
                if len(win) >= 2:
                    hrs = (t - win[0][0]).total_seconds() / 3600.0
                    if hrs > 0.08:
                        # 周/h は「周回で増えた周数 ÷ 経過」。オートや停止の時間も分母に入るので、
                        # 途切れればそのぶん下がる＝実効ペースがそのまま出る
                        rate = "%.1f周/h %.0f万/h" % ((laps - win[0][2]) / hrs,
                                                      (sc - win[0][1]) / hrs / 1e4)
                b = live_borders if live_borders else borders_at(t)
                marg = " ".join("%d:%+.1fM" % (r, (sc - b[r]) / 1e6) for r in RANKS if r in b and r <= 40)
                col = C["g"] if kind == "周回" else (C["y"] if kind in ("オート", "マイセカイ") else
                                                    (C["r"] if kind in ("停止", "不明") else C["0"]))
                sys.stdout.write("\033[2K\r")   # ステータス行の残骸を消してから
                print("%-5s %s%-6s%s %13s %10s %s%-11s%s %17s %s%s%s"
                      % (t.strftime("%H:%M"), C["b"], "%d位" % rk, C["0"],
                         "{:,}".format(sc), ("+%s" % "{:,}".format(d)) if d else "—",
                         col, ("%s%d" % (kind, k)) if k else kind, C["0"],
                         rate, C["dim"], marg, C["0"]))
                sys.stdout.flush()
                prev = (t, sc)
            if prev:
                left = (END - datetime.datetime.now()).total_seconds() / 3600.0
                sys.stdout.write("\033[2K\r%s周回 %d 周 ／ 残り %.1fh ／ 最終更新 %s%s"
                                 % (C["dim"], laps, left, prev[0].strftime("%H:%M"), C["0"]))
                sys.stdout.flush()
            time.sleep(a.every)
    except KeyboardInterrupt:
        print("\n終了。周回 %d 周" % laps)


main()
