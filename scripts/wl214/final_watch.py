#!/usr/bin/env python3
"""最終盤（17:30〜19:59:59）の周回計測と、着地値の判断材料を出す。

なぜ必要か（2026-08-27 Nori「計測開始」）:
  この日の勝負は「走り切れるか」ではなく **どの着地値を選ぶか** に移っている。
  着地値は `X,430,319`（東雲絵名 4/30 ＋ 桃井愛莉 3/19）の形で 100万刻みに選べて、
  上げるほどポゴ（末尾 1112 ＝ 東雲彰人 11/12）の反撃コストが上がるが、
  到達が遅れて着地作業の余白が消える。**実測ペースが決めるので、走りながら測る。**

出すもの:
  1. ブロック開始からの実測時速・周/h
  2. 各着地値への到達見込み時刻（間に合わない候補は落とす）
  3. 着地済みライバルが**値を動かしたか**（＝着地解除。唯一の警報）

⚠️「着地済み」の判定は値の一致ではなく **観測時点のスナップショット**で持つ。
  値が変われば理由を問わず警報。額の大小で握り潰さない（+319 で順位が変わる世界）。
"""
import argparse
import io
import datetime
import os
import json
import sys
import time
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = "https://api.sekai.best/event/live"


def _default_runner():
    """⚠️走者名をソースに書かない（このリポジトリは PUBLIC）。
    優先順位: --runner > 環境変数 WL214_RUNNER_NAME > scripts/wl214/.runner の最終行。"""
    env = os.environ.get("WL214_RUNNER_NAME", "").strip()
    if env:
        return env
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".runner")
    try:
        with io.open(f, encoding="utf-8") as fh:
            names = [ln for ln in fh.read().splitlines() if ln.strip()]
        return names[-1] if names else ""
    except IOError:
        return ""
END = datetime.datetime(2026, 8, 27, 19, 59, 59)
LAP = 118049                      # 1周の代表値（係数で 115,255〜120,575 に振れる中央）
LB_PER_LAP = 10                   # 10炊き
STONE_PER_LB = 10                 # 石10 = 1LB
SUFFIX = "430319"                 # 走者の着地文法（絵名＋愛莉）


def fetch():
    req = urllib.request.Request(API, headers={"User-Agent": "wl214-final-watch"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    out = {}
    for e in d["data"]["eventRankings"]:
        out[e["userName"]] = (e["rank"], int(e["score"]))
    ts = max(e["timestamp"] for e in d["data"]["eventRankings"])
    t = datetime.datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S") + datetime.timedelta(hours=9)
    return t, out


def candidates(cur, target=None):
    """cur より上の X,430,319 を安いほうから並べる。
    ⚠️本命の着地値は必ず含める。cur が上がると先頭が切れて本命が表から溢れる
      （17:39 に 330,430,319 が消えた）ので、target を後ろに足してから重複を落とす。"""
    base = int(str(cur)[:3])
    res = [int("%d%s" % (base + i, SUFFIX)) for i in range(0, 12)]
    res = [v for v in res if v > cur][:6]
    if target and target > cur and target not in res:
        res = sorted(set(res + [target]))
    return res


def rival_counter(landed_value, target):
    """着地済みライバルが target を抜くのに要する額（末尾 1112 の最小値を取る前提）。"""
    v = (target // 10000) * 10000 + 1112
    while v <= target:
        v += 10000
    return v, v - landed_value


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runner", default=_default_runner(),
                    help="走者名。既定は scripts/wl214/.runner の最終行（gitignore 済み）")
    ap.add_argument("--target", type=int, default=330430319, help="本命の着地値（必ず表に出す）")
    ap.add_argument("--start", default="17:30", help="周回ブロックの開始 HH:MM")
    ap.add_argument("--every", type=float, default=170.0)
    ap.add_argument("--anchor", help="ブロック起点を明示 HH:MM=Pt（再起動しても実測の基準を保つ）")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--report-every", type=float, default=600.0,
                    help="定時報告の間隔（秒）。警報はこれと無関係に即出す")
    ap.add_argument("--rate", type=float, default=3497485.0, help="見込みに使う時速の既定（8/26夜の最良2.5h）")
    a = ap.parse_args()

    sh, sm = map(int, a.start.split(":"))
    t0 = datetime.datetime.now().replace(hour=sh, minute=sm, second=0, microsecond=0)
    anchor = None            # (時刻, Pt) ブロック開始点
    if a.anchor:
        _t, _v = a.anchor.split("=")
        _h, _m = map(int, _t.split(":"))
        anchor = (datetime.datetime.now().replace(hour=_h, minute=_m, second=0, microsecond=0), int(_v))
    landed = {}              # 着地済みとみなしている値
    prev_reach = {}          # 着地値 -> 前回「届く」と判定したか
    last_report = datetime.datetime.min
    fails = 0

    while True:
        try:
            t, board = fetch()
            fails = 0
        except Exception as e:
            fails += 1
            if fails == 3:
                print("⚠️APIが3回続けて読めない。計測が止まっている")
            if a.once:
                return
            time.sleep(a.every)
            continue

        if a.runner not in board:
            print("⚠️走者『%s』が板に見当たらない（改名？）" % a.runner)
            if a.once:
                return
            time.sleep(a.every)
            continue
        rank, cur = board[a.runner]

        # ブロック開始点は「--start 以降で最初に見た値」で固定する
        if anchor is None and t >= t0:
            anchor = (t, cur)

        # ── 着地済みライバルの監視（値が動いたら警報） ──
        alerts = []
        for nm, (rk, sc) in board.items():
            if rk > 30 or nm == a.runner:
                continue
            if str(sc).endswith("1112") or str(sc).endswith("720") or str(sc).endswith("430"):
                if nm not in landed:
                    landed[nm] = sc
        # ⚠️着地解除の警報は**目標に届き得る相手だけ**に絞る。
        #   2026-08-27 17:54 に 28位（304M・20.6M下）で鳴った。届かない相手で鳴らし続けると
        #   本命（ポゴ）の解除を見落とす。判定は「最高速で残り時間を走り切っても届くか」。
        TOP_RATE = 3_500_000.0
        left_h_now = max(0.0, (END - datetime.datetime.now()).total_seconds() / 3600.0)
        for nm, v in list(landed.items()):
            if nm in board and board[nm][1] != v:
                sc_now = board[nm][1]
                # ⚠️「走者より上位なら鳴らす」は誤り。スコアは減らないので、**すでに目標より上の相手が
                #   動いても着地値との関係は変わらない**（2026-08-27 18:48 に3位・598M で鳴った）。
                #   関係するのは「いま目標より下にいて、残り時間で目標を跨げる相手」だけ。
                reachable = sc_now < a.target and sc_now + TOP_RATE * left_h_now >= a.target
                if reachable:
                    alerts.append("🚨【着地解除】%s（%d位）が %s → %s（+%s）／ 最高速で %s まで届く"
                                  % (nm, board[nm][0], format(v, ","), format(sc_now, ","),
                                     format(sc_now - v, ","),
                                     format(int(sc_now + TOP_RATE * left_h_now), ",")))
                landed[nm] = sc_now

        # ⚠️負にしない。終了時刻を過ぎると int() と % が噛み合わず「残り0h40m」と嘘が出る
        left_h = max(0.0, (END - datetime.datetime.now()).total_seconds() / 3600.0)

        rate = a.rate
        measured = False
        if anchor and t > anchor[0]:
            span = (t - anchor[0]).total_seconds() / 3600.0
            gained = cur - anchor[1]
            if span >= 0.15 and gained > 0:
                rate = gained / span
                measured = True

        # 到達見込みと、間に合う／間に合わないの線引き
        cands = []
        for v in candidates(cur, a.target):
            need = v - cur
            h = need / rate
            eta = datetime.datetime.now() + datetime.timedelta(hours=h)
            reach = eta <= END - datetime.timedelta(minutes=8)   # 着地作業に8分見る
            cands.append((v, need, eta, reach))

        # ── 警報1: 着地候補が射程から落ちた（前回まで届いていたものが届かなくなった） ──
        for v, need, eta, reach in cands:
            was = prev_reach.get(v)
            if was is True and not reach:
                alerts.append("⏳【射程外】%s は間に合わなくなった（見込み %s）"
                              % (format(v, ","), eta.strftime("%H:%M")))
            prev_reach[v] = reach

        due = (datetime.datetime.now() - last_report).total_seconds() >= a.report_every
        if alerts or due or a.once or anchor is None:
            head = "%s  走者%d位 %s ／ 残り%dh%02dm" % (
                t.strftime("%H:%M"), rank, format(cur, ","), int(left_h), (left_h % 1) * 60)
            if measured:
                head += " ／ 実測 %s/h（%.1f周/h）" % (format(int(rate), ","), rate / LAP)
            else:
                head += " ／ 見込み %s/h（想定値）" % format(int(rate), ",")
            print(head)
            for v, need, eta, reach in cands:
                laps = need / LAP
                stones = laps * LB_PER_LAP * STONE_PER_LB
                pogo = landed.get("ポゴの時間だぁあ！！")
                cnt = ""
                if pogo:
                    cv, cd = rival_counter(pogo, v)
                    cmin = cd / 3500000 * 60
                    cnt = " ／ ポゴ着手期限 %s" % (END - datetime.timedelta(minutes=cmin)).strftime("%H:%M")
                mark = "★" if v == a.target else ("  " if reach else "✗")
                print("   %s %s  %4.1f周 %6s石  着%s%s"
                      % (mark, format(v, ","), laps,
                         format(int(round(stones, -1)), ","), eta.strftime("%H:%M"), cnt))
            for al in alerts:
                print("   " + al)
            last_report = datetime.datetime.now()

        if a.once or datetime.datetime.now() >= END:
            return
        time.sleep(a.every)


if __name__ == "__main__":
    main()
