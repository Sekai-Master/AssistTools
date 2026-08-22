#!/usr/bin/env python3
"""総合ボードから走者を「スコアの連続性」で見つけ、いまの表示名を報告する。

なぜ名前で引かないか:
  走者は章ごとにゲーム内名を変える。sekai.best は 2026-08-18 03:30 を最後に userId を
  返さなくなっており（直近スナップショットの充足率は overall 0/119）、ID で追う手が無い。
  一方、**総合ボードのスコアはイベント通算なので章境界でも連続する**。総合100位以内に
  いる限り、直前の観測値に最も近い（かつ下回らない）行が走者。名前は結果として分かる。

使い方:
    python find_runner.py                 # live.json の最後の走者Ptを起点にする
    python find_runner.py 155791125       # 起点を直接指定
    python find_runner.py 155791125 3.3e6 # 起点と想定時速（Pt/h）を指定

走者名はこのファイルにも live.json にも書かない。出力にだけ現れる。
"""
import json, os, sys, urllib.request

UA = "sekaimaster-assist/1.0"
URL = "https://api.sekai.best/event/live"
HERE = os.path.dirname(os.path.abspath(__file__))
LIVE = os.path.join(HERE, "..", "..", "public", "wl214", "live.json")


def board():
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        d = json.load(r)
    rows = d.get("data", d).get("eventRankings", [])
    return rows[0].get("timestamp", ""), [r for r in rows if int(r.get("rank", 0)) <= 100]


def last_known():
    with open(LIVE, encoding="utf-8") as f:
        d = json.load(f)
    pts = d.get("runner", [])
    if not pts:
        sys.exit("live.json に runner の点が無い。起点を引数で渡すこと")
    last = max(pts, key=lambda x: x["h"])
    return int(last["pt"]), float(last["h"])


base = int(float(sys.argv[1])) if len(sys.argv) > 1 else None
rate = float(sys.argv[2]) if len(sys.argv) > 2 else 3.3e6   # 想定の上限時速
if base is None:
    base, h = last_known()
    print(f"起点: live.json の最新 runner 点 h={h} pt={base:,}")
else:
    print(f"起点: 引数指定 pt={base:,}")

ts, rows = board()
print(f"板: {ts}  個別ランク {len(rows)} 件")

# 走者は「起点以上」かつ「起点＋想定上限より下」。その中で起点にいちばん近い行。
cand = [r for r in rows if int(r["score"]) >= base]
if not cand:
    print("⚠️ 起点以上のスコアが総合板に無い。圏外に落ちたか、起点が古すぎる。")
    print("   直近の板の下位5件:")
    for r in sorted(rows, key=lambda x: int(x["score"]))[:5]:
        print(f"     {r['rank']}位 {int(r['score']):,}")
    sys.exit(1)

best = min(cand, key=lambda r: int(r["score"]) - base)
delta = int(best["score"]) - base
print()
print(f"★ 走者: {best['rank']}位 / {int(best['score']):,} Pt / 表示名 {best['userName']!r}")
print(f"   起点からの増分 {delta:,}")

# 誤爆の警告。近傍が詰まっていると別人を掴む。
nb = sorted((abs(int(r["score"]) - int(best["score"])), r) for r in rows
            if r is not best)[:1]
if nb:
    gap, other = nb[0]
    if gap < max(delta, 1) * 0.5:
        print(f"   ⚠️ 隣が {gap:,} しか離れていない（{other['rank']}位）。"
              f"取り違えの恐れがあるので、板の間隔を詰めて再確認すること")
if delta > rate * 2:
    print(f"   ⚠️ 増分が想定時速の2時間ぶん（{rate*2:,.0f}）を超えている。起点が古い可能性")
