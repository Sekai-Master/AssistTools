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

# Win の既定コンソール（cp932）でも絵文字つきの出力が落ちないようにする
import sys as _sys
if hasattr(_sys.stdout, "reconfigure"):
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")

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
hbase = None
if base is None:
    base, hbase = last_known()
    print(f"起点: live.json の最新 runner 点 h={hbase} pt={base:,}")
else:
    print(f"起点: 引数指定 pt={base:,}")

ts, rows = board()
print(f"板: {ts}  個別ランク {len(rows)} 件")

# 起点からの経過時間。⚠️これを見ないと「直上の別人」を掴む。
elapsed = None
if hbase is not None:
    import datetime
    t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
    t += datetime.timedelta(hours=9)
    elapsed = (t - datetime.datetime(2026, 8, 17, 20, 0)).total_seconds() / 3600 - hbase
    print(f"起点からの経過 {elapsed:.2f} 時間")

cand = [r for r in rows if int(r["score"]) >= base]
if not cand:
    print("⚠️ 起点以上のスコアが総合板に無い。圏外に落ちたか、起点が古すぎる。")
    for r in sorted(rows, key=lambda x: int(x["score"]))[:5]:
        print(f"     {r['rank']}位 {int(r['score']):,}")
    sys.exit(1)

best = min(cand, key=lambda r: int(r["score"]) - base)
delta = int(best["score"]) - base
print()
print(f"★ 候補: {best['rank']}位 / {int(best['score']):,} Pt / 表示名 {best['userName']!r}")
print(f"   起点からの増分 {delta:,}")

# --- 誤爆の検出 -------------------------------------------------------------
# ⚠️2026-08-22 実測: 起点が9時間古い状態で回したら、走者ではなく「起点の直上にいた
#   別人」を掴んだ（増分22万。走者は実際には177万伸びていた）。時間が経つほど
#   起点を追い越す人が増えるので、「直上」＝走者 は短時間しか成り立たない。
BAD = False
if elapsed is not None and elapsed > 0:
    # 板は3分刻みなので、経過が短いと増分ゼロが正常。0.5時間までは下限を課さない。
    floor_ = 0.30e6 * max(0.0, elapsed - 0.5)
    ceil_ = rate * elapsed + 1.0e6   # 周回しっぱなしでもこの程度が上限
    if delta == 0:
        # 増分ちょうど0＝起点と同一の行。9桁のスコアが別人と完全一致する確率は無視できるので、
        # これは「別人を掴んだ」ではなく「走者が止まっている」。休止ブロック中は毎回ここに来る。
        print("   → 増分ちょうど0。起点と同一の行なので走者本人。**停止中**（休止ブロック／未計測）")
    elif elapsed > 0.5 and delta < floor_:
        print(f"   ⚠️ 増分が {elapsed:.1f} 時間ぶんとして少なすぎる（下限の目安 {floor_:,.0f}）。"
              f"**別人を掴んでいる疑いが濃い。**")
        BAD = True
    elif delta > ceil_:
        print(f"   ⚠️ 増分が多すぎる（上限の目安 {ceil_:,.0f}）。起点が古いか別人。")
        BAD = True
    if elapsed > 1.0:
        print(f"   ⚠️ 起点が {elapsed:.1f} 時間古い。この方式は起点が新しいときだけ信用できる。"
              f"live.json を再生成して起点を更新すること")
else:
    print("   ⚠️ 起点を引数で渡したので経過時間が分からず、増分の妥当性を検査できない。"
          "live.json 起点（引数なし）で回すほうが安全")
nb = sorted((abs(int(r["score"]) - int(best["score"])), r) for r in rows if r is not best)[:1]
if nb and nb[0][0] < max(delta, 1) * 0.5:
    print(f"   ⚠️ 隣が {nb[0][0]:,} しか離れていない（{nb[0][1]['rank']}位）。取り違えの恐れ")
    BAD = True
if BAD:
    print()
    print("   → 確度が低い。名前が分かっているなら NAS の DB を名前で引いて突き合わせること:")
    print("      ssh nas \"sqlite3 <db> \\\"SELECT datetime(timestamp,'+9 hours'),rank,score,user_name "
          "FROM border_snapshots WHERE event_id=214 AND board_type='overall' "
          "AND user_name LIKE '<名前>%' ORDER BY timestamp DESC LIMIT 3;\\\"\"")
    sys.exit(2)
