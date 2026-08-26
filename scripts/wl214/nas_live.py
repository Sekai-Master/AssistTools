#!/usr/bin/env python3
"""NAS 上で動く、event214 のライブビューア。Mac から `ssh nas` して眺めるためのもの。

なぜ NAS で動かすか:
  borders.db は NAS にあり、NAS は Tailscale で外から届く。Win 機を経由しないので、
  Win の画面が見えない場所（旅行先など）からでも `ssh nas` だけで済む。

なぜ板を直に叩くか:
  DB を書いている収集コンテナは 9〜12分刻みだが、**板そのものは約3分刻み**で更新される。
  ライブで眺めるには DB は粗いので、API を主にして DB は起動時の遡りにだけ使う。

使い方（Mac から）:
    ssh nas
    ~/wl214/live
    ~/wl214/live --every 10 --back 3 --win 10

  --ch N     章（既定 5）。周回/オートの単価はここで切り替わる
  --every N  板を見にいく間隔（秒・既定 20）。板は約3分刻み
  --back N   起動時に DB から遡る時間（既定 8.0）。**画面に出る行数とは別**で、
             ここはブロックの開始（＝15分以上周回が途切れた地点）を見つけるための窓。
             短いとブロック開始が視界の外に出て、周回数が過小になる
  --win N    「直近ペース」を何周ぶんで測るか（既定 10）
  --rows N   画面に残すデータ行数（既定 24。見出し3行＋ステータス1行で合計28行）
  --log DIR  全行を live-YYYYMMDD.log に追記する先（既定 ~/wl214）

画面は毎回描き直す（固定高）。**スクロールバックには残らないが、
行そのものは必ずログファイルに追記している**ので、まとめ表示で潰れた情報も後から読める。

⚠️Python 3.8 で動かすこと（NAS の python3 は 3.8.15）。3.9+ の記法は使わない。
⚠️LANG が未設定なので stdout を明示的に UTF-8 にする。
"""
import argparse, datetime, json, os, sqlite3, sys, time, unicodedata, urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB = "/volume1/docker/sekai-border-tracker/data/borders.db"
API = "https://api.sekai.best/event/live"
UA = {"User-Agent": "sekaimaster-assist/1.0"}
T0 = datetime.datetime(2026, 8, 17, 20, 0)
END = datetime.datetime(2026, 8, 27, 20, 0)
EVENT = 214
# 1周ぶんの Pt は卓の質で1%ほど揺れるので、ここは**実測の平均**を置く（分類は3%の許容で拾う）。
# ⚠️最頻値（レンジ上端）を置くとヘッダが実測より高く見えて「下振れしている」と誤読される。
UNITS = {3: (107975, 69125, 750), 4: (120157, 76685, 850), 5: (118049, 75530, 850)}
RANKS = (20, 30, 40, 50, 100)
C = {"dim": "\033[2m", "b": "\033[1m", "g": "\033[32m", "y": "\033[33m",
     "r": "\033[31m", "c": "\033[36m", "0": "\033[0m"}
CLR = "\033[2K\r"


def dw(s):
    """端末での表示幅。⚠️日本語は1文字で2桁ぶん取るので、%-5s のような
    文字数ベースの桁揃えは必ずズレる（2026-08-26 Nori 指摘）。"""
    n = 0
    for c in str(s):
        n += 2 if unicodedata.east_asian_width(c) in ("W", "F") else 1
    return n


def pad(s, width, right=False):
    """表示幅で桁を揃える。足りなければ空白、あふれたらそのまま出す。"""
    s = str(s)
    sp = " " * max(0, width - dw(s))
    return sp + s if right else s + sp


def jst(ts):
    return datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")


def backfill(name, since):
    """起動直後だけ DB から遡る。9〜12分刻みなので粗いが、流れを掴むには十分。"""
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True, timeout=20)
    try:
        rows = con.execute(
            "SELECT datetime(timestamp,'+9 hours'), rank, score FROM border_snapshots "
            "WHERE event_id=? AND board_type='overall' AND user_name=? "
            "AND datetime(timestamp,'+9 hours')>=? ORDER BY timestamp",
            (EVENT, name, since)).fetchall()
    finally:
        con.close()
    return [(jst(t), int(rk), int(sc), None, None) for t, rk, sc in rows]


def board(name):
    """板を直に取る。走者・上下の相手・上位帯のボーダーを同じスナップショットから読む。"""
    d = json.load(urllib.request.urlopen(urllib.request.Request(API, headers=UA), timeout=25))
    rows = d.get("data", d).get("eventRankings", [])
    if not rows:
        return []
    t = datetime.datetime.strptime(rows[0].get("timestamp", "")[:19], "%Y-%m-%dT%H:%M:%S") \
        + datetime.timedelta(hours=9)
    hit = [r for r in rows if str(r.get("userName", "")) == name] \
        or [r for r in rows if str(r.get("userName", "")).startswith(name)]
    if not hit:
        return []
    rk, sc = int(hit[0]["rank"]), int(hit[0]["score"])
    by_rank = dict((int(r["rank"]), int(r["score"])) for r in rows if int(r.get("rank", 0)) > 0)
    # 上下は「順位が1つ上／下の人」。板に居ない順位は None（欠番を勝手に埋めない）
    nb = {"up": by_rank.get(rk - 1), "down": by_rank.get(rk + 1)}
    bd = dict((r, by_rank[r]) for r in RANKS if r in by_rank)
    return [(t, rk, sc, nb, bd)]


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


def rate_over(laphist, laps, now, back):
    """直近 back 周ぶんのペース。周数が足りなければ持っているぶんで出す。
    分母には停止やオートの時間も入るので、途切れればそのぶん下がる＝実効ペース。"""
    if len(laphist) < 2:
        return None
    base = laphist[0]
    for t, n in laphist:
        if n <= laps - back:
            base = (t, n)
    hrs = (now - base[0]).total_seconds() / 3600.0
    got = laps - base[1]
    if hrs <= 0.02 or got <= 0:
        return None
    return got / hrs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", default=os.environ.get("WL214_RUNNER_NAME", ""))
    ap.add_argument("--ch", type=int, default=5)
    ap.add_argument("--every", type=int, default=20)
    ap.add_argument("--back", type=float, default=8.0)
    ap.add_argument("--win", type=int, default=10)
    ap.add_argument("--rows", type=int, default=24)   # 画面に残すデータ行数
    ap.add_argument("--log", default=os.path.expanduser("~/wl214"))  # 全行を残す先
    a = ap.parse_args()
    if not a.name:
        sys.exit('走者名を渡すこと: python3 nas_live.py "名前"')
    lap, auto, mys = UNITS[a.ch]
    since = (datetime.datetime.now() - datetime.timedelta(hours=a.back)).strftime("%Y-%m-%d %H:%M:%S")

    print("%sevent214 ライブ（ch%d）  1周 %s / オート1回 %s%s"
          % (C["b"], a.ch, "{:,}".format(lap), "{:,}".format(auto), C["0"]))
    print("%s走者 %s ／ %d秒ごとに板を直接見る（起動時だけ DB から遡り）。Ctrl-C で終了%s"
          % (C["dim"], a.name, a.every, C["0"]))
    head = (pad("時刻", 11) + " " + pad("順位", 6) + " " + pad("総合Pt", 13, True) + " "
            + pad("増分", 10, True) + " " + pad("内容", 13) + " "
            + pad("直近%d周" % a.win, 10, True) + " " + pad("枠全体", 10, True) + " "
            + pad("上との差", 10, True) + " " + pad("下との差", 10, True))
    logpath = os.path.join(a.log, "live-%s.log" % datetime.datetime.now().strftime("%Y%m%d"))

    def render(view, status):
        """画面を毎回まるごと描き直す。**固定高に収めるにはこれがいちばん確実**
        （カーソル移動で部分更新すると、端末が折り返した瞬間に崩れる）。"""
        out = ["\033[H\033[J"]
        out.append("%sevent214 ライブ（ch%d）  1周 %s / オート1回 %s%s"
                   % (C["b"], a.ch, "{:,}".format(lap), "{:,}".format(auto), C["0"]))
        # 2行目は走者と更新間隔だけ。ポーリング間隔やログの場所は見る側に関係ない
        out.append("%s走者 %s ／ 値は3分おきに更新。%s" % (C["dim"], a.name, C["0"]))
        out.append("%s%s%s" % (C["dim"], head, C["0"]))
        for r in view[-a.rows:]:
            out.append(r["line"])
        out.append("%s%s%s" % (C["dim"], status, C["0"]))
        sys.stdout.write("\n".join(out))
        sys.stdout.flush()

    seen, laphist, view = set(), [], []   # view は画面に残す行（rows は取得データ。名前を分ける）
    laps, prev, first, done_backfill = 0, None, None, False
    last_lap_t = None    # 最後に周回を観測した時刻。ブロックの切れ目の判定に使う
    block_found = False  # 15分以上の途切れを実際に観測できたか（＝開始点が確かか）
    last_bd, last_nb = {}, {}
    try:
        while True:
            try:
                rows = board(a.name) if done_backfill else backfill(a.name, since)
                done_backfill = True
            except Exception as e:
                sys.stdout.write(CLR)
                print("%s取得に失敗（%s: %s）。%d秒後に再試行%s"
                      % (C["r"], type(e).__name__, e, a.every, C["0"]))
                time.sleep(a.every)
                continue
            for t, rk, sc, nb, bd in rows:
                if t in seen:
                    continue
                seen.add(t)
                d = sc - prev[1] if prev else 0
                kind, k = classify(d, lap, auto, mys) if prev else ("—", 0)
                if kind == "周回":
                    # ⚠️「枠全体」はいま走っているブロックのペース。**15分以上周回が
                    #   途切れたら、そこでブロックが切れたとみなして起点を取り直す。**
                    #   取り直さないと、起動時に長い停止を跨いだだけで分母が膨らみ、
                    #   28.8周/h で走っているのに 23.3周/h と出る（2026-08-26 実際に出た）。
                    if last_lap_t is not None and (t - last_lap_t).total_seconds() > 900:
                        first = None
                        block_found = True
                    last_lap_t = t
                    laps += k
                    if first is None:
                        # ⚠️起点は「最初に周回を数えた時刻」ではなく**その1つ前の観測時刻**。
                        #   その区間の周回はその間に起きているので、t を起点にすると
                        #   区間ぶん（板なら3分、DB遡りなら12分）が分母から抜けて
                        #   ペースが跳ね上がる（実際 53.3周/h と出た）。
                        first = (prev[0] if prev else t, sc, laps - k)
                laphist.append((t, laps))
                if bd:
                    last_bd = bd
                if nb:
                    last_nb = nb
                r10 = rate_over(laphist, laps, t, a.win)
                s10 = "%.1f周/h" % r10 if r10 else ""
                sall = ""
                if first and t > first[0]:
                    bh = (t - first[0]).total_seconds() / 3600.0
                    if bh > 0.05 and laps > first[2]:
                        sall = "%.1f周/h" % ((laps - first[2]) / bh)
                up = "%+.2fM" % ((sc - last_nb["up"]) / 1e6) if last_nb.get("up") else "—"
                dn = "%+.2fM" % ((sc - last_nb["down"]) / 1e6) if last_nb.get("down") else "—"
                col = C["g"] if kind == "周回" else (C["y"] if kind in ("オート", "マイセカイ")
                                                     else (C["r"] if kind in ("停止", "不明") else C["0"]))
                # 全行はログに残す（画面のまとめ表示で潰れても後から読める）
                try:
                    with open(logpath, "a", encoding="utf-8") as lf:
                        lf.write("%s\t%d\t%d\t%d\t%s%s\n"
                                 % (t.strftime("%Y-%m-%d %H:%M"), rk, sc, d, kind, k or ""))
                except Exception:
                    pass
                # 停止とオートは連続すると同じ行が延々並ぶ（8/27 は停止だけで約360行）。
                # **消さずに1行へ畳む**——時間帯・累計回数・累計Ptは保つ。
                if view and view[-1]["kind"] == kind and kind in ("停止", "オート"):
                    g = view[-1]
                    g["t1"], g["k"], g["d"], g["sc"], g["rk"] = t, g["k"] + k, g["d"] + d, sc, rk
                else:
                    view.append({"kind": kind, "k": k, "t0": prev[0] if prev else t, "t1": t,
                                 "d": d, "sc": sc, "rk": rk})
                g = view[-1]
                span = "%s〜%s" % (g["t0"].strftime("%H:%M"), g["t1"].strftime("%H:%M"))                     if g["kind"] in ("停止", "オート") and g["t1"] > g["t0"] else g["t1"].strftime("%H:%M")
                mins = (g["t1"] - g["t0"]).total_seconds() / 60.0
                body = ("%s%d" % (g["kind"], g["k"])) if g["k"] else g["kind"]
                if g["kind"] in ("停止", "オート") and mins >= 6:
                    body += "・%d分" % mins
                g["line"] = ("%s %s%s%s %s %s %s%s%s %s %s %s%s %s%s"
                             % (pad(span, 11),
                                C["b"], pad("%d位" % g["rk"], 6), C["0"],
                                pad("{:,}".format(g["sc"]), 13, True),
                                pad(("+%s" % "{:,}".format(g["d"])) if g["d"] else "—", 10, True),
                                col, pad(body, 13), C["0"],
                                pad(s10, 10, True), pad(sall, 10, True),
                                C["c"], pad(up, 10, True), pad(dn, 10, True), C["0"]))
                prev = (t, sc)  # ⚠️first の起点に使うので、更新はこの行より後にしない
            if prev:
                left = (END - datetime.datetime.now()).total_seconds() / 3600.0
                sec = ""
                if first and prev[0] > first[0] and laps > first[2]:
                    bh = (prev[0] - first[0]).total_seconds() / 3600.0
                    sec = "・1周 %.0f秒" % (bh * 3600 / (laps - first[2]))
                marg = " ".join("%d位%+.1fM" % (r, (prev[1] - last_bd[r]) / 1e6)
                                for r in RANKS if r in last_bd and r <= 50)
                # ⚠️出すのは**このブロックの周回数**（laps - first[2]）。
                #   laps（起動以降の累計）をそのまま出すと、15分以上の途切れで
                #   ブロックを取り直したあとも前のブロックぶんを引きずり、
                #   同じ画面の「枠全体」と別のブロックを指してしまう（2026-08-26 実際にそうなった）。
                blk_laps = laps - first[2] if first else laps
                # ⚠️遡った窓の中に「15分以上の途切れ」が無ければ、ブロックの開始は
                #   視界の外にある。その場合の周回数は**下限**でしかないので、
                #   確かな数字のふりをさせない（2026-08-26 Nori 指摘。既定 --back 1.0 で
                #   20:39 に起動したら 19:42 からしか数えられず、50周を22周と出していた）。
                head_mark = "" if block_found else "≧"
                note = "" if block_found else "（遡り %.1fh 内にブロックの切れ目が無い＝下限）" % a.back
                render(view, "このブロック %s%d 周%s%s ／ %s ／ 残り %.1fh ／ 更新 %s"
                       % (head_mark, blk_laps, sec, note, marg, left, prev[0].strftime("%H:%M")))
            time.sleep(a.every)
    except KeyboardInterrupt:
        print("\n終了。周回 %d 周" % laps)


main()
