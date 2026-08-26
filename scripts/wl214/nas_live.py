#!/usr/bin/env python3
"""NAS 上で動く event214 のライブ・ダッシュボード。走者と周回部屋に画面共有する用。

なぜ NAS で動かすか:
  borders.db は NAS にあり、NAS は Tailscale で外から届く。Win 機を経由しないので、
  Win の画面が見えない場所（旅行先など）からでも `ssh nas` だけで済む。

なぜ板を直に叩くか:
  DB を書いている収集コンテナは 9〜12分刻みだが、**板そのものは約3分刻み**で更新される。
  API を主にして、DB は起動時の遡り（＝ブロックの開始点と各人の時速を掴む）にだけ使う。

見せているもの（2026-08-26 に履歴ログから作り替え。画面共有で走者と部屋が見るため）:
  ・いまの順位・Pt・ペース（1周あたり秒数／周per時／時速）
  ・このブロックの経過と周回数
  ・**ブロック終了時（既定26:00）の予想Pt**
  ・上下の相手との差と、**終了時の予想順位**
  ・直近の数行（流れを見るため）

使い方（Mac から）:
    ssh nas
    ~/wl214/live
    ~/wl214/live --until 26:00 --rows 6

  --ch N         章（既定 5）。周回/オートの単価はここで切り替わる
  --every N      板を見にいく間隔（秒・既定 20）。板は約3分刻み
  --back N       起動時に DB から遡る時間（既定 8.0）。**画面の行数とは別**で、
                 ブロックの開始（＝15分以上周回が途切れた地点）と各人の時速を掴む窓
  --until HH:MM  ブロック終了時刻（既定 26:00＝翌02:00）。ここまでの予想を出す
  --rows N       下段に出す直近の行数（既定 6）
  --pace N       「いまのペース」を測る窓（分・既定 60）。短くすると卓の変化に敏感になる
  --log DIR      全行を live-YYYYMMDD.log に追記する先（既定 ~/wl214）

⚠️Python 3.8 で動かすこと（NAS の python3 は 3.8.15）。3.9+ の記法は使わない。
⚠️LANG が未設定なので stdout を明示的に UTF-8 にする。
"""
import argparse, datetime, json, os, sqlite3, sys, time, unicodedata, urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB = "/volume1/docker/sekai-border-tracker/data/borders.db"
API = "https://api.sekai.best/event/live"
UA = {"User-Agent": "sekaimaster-assist/1.0"}
EVENT = 214
CHARA = {1: "彰人", 2: "寧々", 3: "MEIKO", 4: "絵名", 5: "愛莉"}
# 1周ぶんの Pt は卓の質で1%ほど揺れるので**実測の平均**を置く（分類は単価の幅で拾う）
UNITS = {3: (107975, 69125, 750), 4: (120157, 76685, 850), 5: (118049, 75530, 850)}
RANKS = (20, 30, 40, 50, 100)
TRACK = 40          # 予想順位のために時速を追う人数（総合の上位何位まで）
C = {"dim": "\033[2m", "b": "\033[1m", "g": "\033[32m", "y": "\033[33m",
     "r": "\033[31m", "c": "\033[36m", "0": "\033[0m"}


def dw(s):
    """端末での表示幅。日本語は1文字で2桁ぶん取るので、文字数では桁が揃わない。"""
    return sum(2 if unicodedata.east_asian_width(c) in ("W", "F") else 1 for c in str(s))


def pad(s, width, right=False):
    sp = " " * max(0, width - dw(s))
    return sp + str(s) if right else str(s) + sp


def hm(mins):
    """3:32 だと時分か分秒か分からないので h/m を付ける（2026-08-26 Nori 指摘）。"""
    h, m = int(mins // 60), int(mins % 60)
    return ("%dh%02dm" % (h, m)) if h else ("%dm" % m)


def classify(d, lap, auto, mys):
    """増分を 周回 / オート / マイセカイ / 停止 に分ける。

    ⚠️「合計に対して3%以内」で見ると、マイセカイの 600,950 が「周回5」に化ける
       （5周ぶん590,245 が3%＝18,028 の幅に入ってしまう）。**1周あたりの単価が
       実測の幅に収まるか**で見ること。600,950÷5=120,190 は ch5 の実測外なので落ちる。
    """
    if d == 0:
        return "停止", 0
    for k in range(1, 13):
        if abs(d - k * auto) <= 3:
            return "オート", k
    for k in range(1, 9):
        per = d / float(k)
        if lap * 0.975 <= per <= lap * 1.015:
            return "周回", k
    if d % mys == 0:
        return "マイセカイ", d // mys
    return "不明", 0


def db_hist(since, limit_rank):
    """遡り。走者だけでなく上位帯ぜんぶ取る（予想順位に各人の時速が要る）。"""
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True, timeout=20)
    try:
        return con.execute(
            "SELECT user_name, datetime(timestamp,'+9 hours'), score FROM border_snapshots "
            "WHERE event_id=? AND board_type='overall' AND rank<=? AND score<>123456789 "
            "AND datetime(timestamp,'+9 hours')>=? ORDER BY timestamp",
            (EVENT, limit_rank, since)).fetchall()
    finally:
        con.close()


def board():
    d = json.load(urllib.request.urlopen(urllib.request.Request(API, headers=UA), timeout=25))
    rows = d.get("data", d).get("eventRankings", [])
    if not rows:
        return None, [], {}
    t = datetime.datetime.strptime(rows[0].get("timestamp", "")[:19], "%Y-%m-%dT%H:%M:%S") \
        + datetime.timedelta(hours=9)
    by_rank = dict((int(r["rank"]), int(r["score"])) for r in rows if int(r.get("rank", 0)) > 0)
    return t, rows, by_rank


def rate_of(hist, now, hours):
    """直近 hours 時間の時速。点が足りなければ 0。"""
    w = [x for x in hist if (now - x[0]).total_seconds() <= hours * 3600]
    if len(w) < 2:
        return 0.0
    dt = (w[-1][0] - w[0][0]).total_seconds() / 3600.0
    return (w[-1][1] - w[0][1]) / dt if dt > 0.25 else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", default=os.environ.get("WL214_RUNNER_NAME", ""))
    ap.add_argument("--ch", type=int, default=5)
    ap.add_argument("--every", type=int, default=20)
    ap.add_argument("--back", type=float, default=8.0)
    ap.add_argument("--until", default="26:00")
    ap.add_argument("--rows", type=int, default=6)
    ap.add_argument("--pace", type=int, default=60)   # 「いまのペース」を測る窓（分）
    ap.add_argument("--log", default=os.path.expanduser("~/wl214"))
    a = ap.parse_args()
    if not a.name:
        sys.exit('走者名を渡すこと: python3 nas_live.py "名前"')
    lap, auto, mys = UNITS[a.ch]
    hh, mm = map(int, a.until.split(":"))
    base = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    until = base + datetime.timedelta(hours=hh, minutes=mm)      # 26:00 は翌02:00として解釈
    if until < datetime.datetime.now():
        until += datetime.timedelta(days=1)
    logpath = os.path.join(a.log, "live-%s.log" % datetime.datetime.now().strftime("%Y%m%d"))
    since = (datetime.datetime.now() - datetime.timedelta(hours=a.back)).strftime("%Y-%m-%d %H:%M:%S")

    hist = {}
    view = []
    seen = set()
    state = {"laps": 0, "prev": None, "prev_kind": None, "first": None,
             "last_lap_t": None, "block_found": False}
    last_nb, last_bd = {}, {}

    try:
        for nm, ts, sc in db_hist(since, TRACK):
            hist.setdefault(nm, []).append(
                (datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S"), int(sc)))
    except Exception as e:
        print("遡りに失敗（%s）。ライブだけで続ける" % e)

    def feed(t, sc):
        """走者の1点を取り込み、分類・周回数・ブロック起点を更新する。"""
        s = state
        d = sc - s["prev"][1] if s["prev"] else 0
        kind, k = classify(d, lap, auto, mys) if s["prev"] else ("—", 0)
        if kind == "周回":
            if s["last_lap_t"] is not None and (t - s["last_lap_t"]).total_seconds() > 900:
                s["first"] = None
                s["block_found"] = True
            if s["first"] is None and s["prev_kind"] not in (None, "—", "周回"):
                s["block_found"] = True
            s["last_lap_t"] = t
            s["laps"] += k
            if s["first"] is None:
                # ⚠️起点の Pt は**その行のスコアではなく1つ前の行のスコア**。
                #   周回数は s["laps"]-k（＝この行の k 周を含む）で数えているので、
                #   Pt 側も同じ区間から始めないと噛み合わない。
                #   ずれていると「95周で +10,752,770（＝1周113,187）」のように、
                #   実測レンジの外の単価が画面に出る（2026-08-26 に出た）。
                s["first"] = (s["prev"][0] if s["prev"] else t,
                              s["prev"][1] if s["prev"] else sc, s["laps"] - k)
        if view and view[-1]["kind"] == kind and kind in ("停止", "オート", "マイセカイ"):
            g = view[-1]
            g["t1"], g["k"], g["d"], g["sc"] = t, g["k"] + k, g["d"] + d, sc
        else:
            view.append({"kind": kind, "k": k, "t0": s["prev"][0] if s["prev"] else t,
                         "t1": t, "d": d, "sc": sc})
        s["prev"], s["prev_kind"] = (t, sc), kind
        return kind, k, d

    for t, sc in sorted(hist.get(a.name, [])):     # 遡りぶんを流し込む（画面には出さない）
        if t not in seen:
            seen.add(t)
            feed(t, sc)

    def render(t, rk, sc):
        s = state
        first = s["first"]
        blk = s["laps"] - first[2] if first else s["laps"]
        bmin = (t - first[0]).total_seconds() / 60.0 if first else 0.0
        bgain = sc - first[1] if first else 0
        # ブロック平均（立ち上がりや途中の停止を含む、通算の実績）
        avg_lph = (blk / (bmin / 60.0)) if bmin > 3 else 0
        avg_pph = (bgain / (bmin / 60.0)) if bmin > 3 else 0
        # ⚠️**先の予想には直近のペースを使う。** ブロック平均は立ち上がりの遅さや
        #   途中の停止を引きずるので、いま走っている速さより低く出る（2026-08-26 実測で
        #   平均309万/h に対し直近350万/h。3.6時間ぶんで147万の差＝予想順位が1つ動く）。
        mine = hist.get(a.name, [])
        now_pph = rate_of(mine, t, a.pace / 60.0) or avg_pph
        now_lph = now_pph / lap if lap else 0
        per = (3600.0 / now_lph) if now_lph > 0 else 0
        left = max(0.0, (until - t).total_seconds() / 60.0)
        pred = sc + now_pph * left / 60.0
        proj = []
        for nm, h in hist.items():
            if nm == a.name or len(h) < 2:
                continue
            r = max(rate_of(h, t, 1.0), rate_of(h, t, 3.0) * 0.7)
            proj.append((h[-1][1] + r * left / 60.0, nm))
        proj.append((pred, a.name))
        proj.sort(reverse=True)
        pos = [i for i, (_, nm) in enumerate(proj) if nm == a.name][0]

        out = ["\033[H\033[J"]
        A = out.append
        A("%sevent214  ch%d %s%s    %s" % (C["b"], a.ch, CHARA.get(a.ch, ""), C["0"],
                                           t.strftime("%m/%d %H:%M")))
        A("")
        A("  %s%s%s    %s%d位%s    %s%s%s"
          % (C["b"], a.name, C["0"], C["b"], rk, C["0"], C["b"], "{:,}".format(sc), C["0"]))
        A("")
        A("  %s%s%s  1周 %s%.0f秒%s    %s%.1f周/h%s    時速 %s%.0f万%s"
          % (C["dim"], pad("直近%d分のペース" % a.pace, 16), C["0"], C["g"], per, C["0"],
             C["g"], now_lph, C["0"], C["g"], now_pph / 1e4, C["0"]))
        A("  %s%s%s  %s〜   経過 %s   %s%s%d周%s   +%s"
          % (C["dim"], pad("このブロック", 16), C["0"],
             first[0].strftime("%H:%M") if first else "—", hm(bmin),
             "" if s["block_found"] else "≧", C["b"], blk, C["0"], "{:,}".format(bgain))
          + "   %s平均 %.1f周/h%s" % (C["dim"], avg_lph, C["0"]))
        A("  %s%s%s  あと %s   直近ペースで %s+%s%s   →   %s%s%s"
          % (C["dim"], pad("%s まで" % a.until, 16), C["0"], hm(left),
             C["c"], "{:,.0f}".format(now_pph * left / 60.0), C["0"],
             C["b"] + C["c"], "{:,.0f}".format(pred), C["0"]))
        A("")
        A("  %s順位のゆくえ%s" % (C["dim"], C["0"]))
        if last_nb.get("up"):
            A("      ↑ %s位  %s  %s"
              % (pad(rk - 1, 3, True), pad("{:,}".format(last_nb["up"]), 13, True),
                 pad("%+.2fM" % ((sc - last_nb["up"]) / 1e6), 9, True)))
        A("      %s● %s位  %s%s"
          % (C["b"], pad(rk, 3, True), pad("{:,}".format(sc), 13, True), C["0"]))
        if last_nb.get("down"):
            A("      ↓ %s位  %s  %s"
              % (pad(rk + 1, 3, True), pad("{:,}".format(last_nb["down"]), 13, True),
                 pad("%+.2fM" % ((sc - last_nb["down"]) / 1e6), 9, True)))
        if len(proj) > 3:
            det = []
            if pos > 0:
                det.append("上まで %+.1fM" % ((pred - proj[pos - 1][0]) / 1e6))
            if pos + 1 < len(proj):
                det.append("下から %+.1fM" % ((pred - proj[pos + 1][0]) / 1e6))
            A("")
            A("  %s%s%s  %s%d位%s   %s%s%s"
              % (C["dim"], pad("%s の予想順位" % a.until, 16), C["0"],
                 C["b"] + C["c"], pos + 1, C["0"], C["dim"], " / ".join(det), C["0"]))
        marg = "   ".join("%d位 %+.1fM" % (r, (sc - last_bd[r]) / 1e6)
                          for r in RANKS if r in last_bd and r <= 50)
        if marg:
            A("  %s%s%s  %s" % (C["dim"], pad("ボーダーとの差", 16), C["0"], marg))
        A("")
        A("  %s直近%s" % (C["dim"], C["0"]))
        for g in view[-a.rows:]:
            span = "%s〜%s" % (g["t0"].strftime("%H:%M"), g["t1"].strftime("%H:%M")) \
                if g["kind"] in ("停止", "オート", "マイセカイ") and g["t1"] > g["t0"] \
                else g["t1"].strftime("%H:%M")
            col = C["g"] if g["kind"] == "周回" else (
                C["y"] if g["kind"] in ("オート", "マイセカイ")
                else (C["r"] if g["kind"] in ("停止", "不明") else C["0"]))
            body = ("%s%d" % (g["kind"], g["k"])) if g["k"] else g["kind"]
            mins = (g["t1"] - g["t0"]).total_seconds() / 60.0
            if g["kind"] in ("停止", "オート") and mins >= 6:
                body += "・%d分" % mins
            A("      %s  %s  %s%s%s"
              % (pad(span, 12), pad(("+%s" % "{:,}".format(g["d"])) if g["d"] else "—", 10, True),
                 col, body, C["0"]))
        sys.stdout.write("\n".join(out))
        sys.stdout.flush()

    try:
        while True:
            try:
                t, rows, by_rank = board()
            except Exception:
                time.sleep(a.every)
                continue
            if t is None:
                time.sleep(a.every)
                continue
            for r in rows:
                nm = str(r.get("userName", ""))
                if nm and 0 < int(r.get("rank", 0)) <= TRACK:
                    h = hist.setdefault(nm, [])
                    if not h or h[-1][0] != t:
                        h.append((t, int(r["score"])))
            hit = [r for r in rows if str(r.get("userName", "")) == a.name] \
                or [r for r in rows if str(r.get("userName", "")).startswith(a.name)]
            if hit:
                rk, sc = int(hit[0]["rank"]), int(hit[0]["score"])
                last_nb = {"up": by_rank.get(rk - 1), "down": by_rank.get(rk + 1)}
                last_bd = dict((r, by_rank[r]) for r in RANKS if r in by_rank)
                if t not in seen:
                    seen.add(t)
                    kind, k, d = feed(t, sc)
                    try:
                        with open(logpath, "a", encoding="utf-8") as lf:
                            lf.write("%s\t%d\t%d\t%d\t%s%s\n"
                                     % (t.strftime("%Y-%m-%d %H:%M"), rk, sc, d, kind, k or ""))
                    except Exception:
                        pass
                render(t, rk, sc)
            time.sleep(a.every)
    except KeyboardInterrupt:
        print("\n終了。")


main()
