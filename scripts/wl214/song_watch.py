#!/usr/bin/env python3
"""オートが止まっている間、5分おきに「いま復帰したときの最適曲」を出す。

Nori 依頼（2026-08-27）「13:27 までに復帰しなかった場合、ポイントを最大化する
楽曲の選定を13:30以降5分おきに作成」。

⚠️毎回そのまま鳴らすと 5分x3時間 = 36通になる。**推奨が変わった時と、
  走者が復帰した時だけ**出す。変わらない間は黙る。

周期は「曲長 + ロスタイム34秒」。板の増分からは測らない（3分刻みの量子化で
5回程度の観測から出すと真値から8秒ずれ、結論が逆になる）。
"""
import argparse
import datetime
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auto_watch import songs                 # noqa: E402
from stall_watch import tail_board           # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def best_song(remain, sec, oh, ch=5, exclude=None):
    rows = []
    for s in songs(ch, oh=oh):
        n = min(remain, int(sec // s["cycle"]))
        rows.append((n * s["perPlay"], n, s))
    rows.sort(key=lambda r: (-r[0], r[2]["cycle"]))
    return rows[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--remain", type=int, default=58)
    ap.add_argument("--unit", type=int, default=74585, help="いまの曲の1回ぶんPt（消化数の追跡用）")
    ap.add_argument("--until", default="16:30")
    ap.add_argument("--oh", type=float, default=34.0)
    ap.add_argument("--every", type=float, default=300.0)
    ap.add_argument("--current", default="0.0000034", help="いま積んである曲")
    ap.add_argument("--min-gain", type=int, default=200000,
                    help="いまの曲との差がこれを超えたときだけ鳴らす（既定20万Pt＝周回1.7周）")
    a = ap.parse_args()
    uh, um = map(int, a.until.split(":"))

    last_song = None
    base = None          # 監視開始時のPt
    print("曲の選定を開始（5分おき・推奨が変わったときだけ出す）")
    while True:
        now = datetime.datetime.now()
        end = now.replace(hour=uh, minute=um, second=0, microsecond=0)
        if now >= end:
            print("%s を過ぎたので選定を終了" % a.until)
            return
        rows = tail_board(20)
        if rows:
            cur = rows[-1][2]
            if base is None:
                base = cur
            done = int(round((cur - base) / float(a.unit)))
            remain = max(0, a.remain - done)
            if done > 0:
                print("オート再開を確認（%d回消化・残り%d回）。選定を終了します" % (done, remain))
                return
        else:
            remain = a.remain
        sec = (end - now).total_seconds()
        tot, n, s = best_song(remain, sec, a.oh)
        # ⚠️1回入るか入らないかで推奨が毎回ひっくり返る。差の実体は約7.5万Pt（周回0.6周）で、
        #   ロスタイムの推定幅（29〜40秒）のほうが大きい。**測れていない差で連絡を使わせない。**
        #   いまの曲との差が min-gain を超えたときだけ出す。
        cur_tot = 0
        for x in songs(5, oh=a.oh):
            if x["song"] == a.current:
                cur_tot = min(remain, int(sec // x["cycle"])) * x["perPlay"]
        gain = tot - cur_tot
        if s["song"] != last_song and s["song"] != a.current and gain >= a.min_gain:
            print("%s 時点で復帰するなら → 【%s】%s（周期%.0f秒・%d回・%s Pt）"
                  "　いまの%sとの差 +%s（周回%.1f周ぶん）"
                  % (now.strftime("%H:%M"), s["song"], s["difficulty"], s["cycle"], n,
                     "{0:,}".format(tot), a.current, "{0:,}".format(gain), gain / 118790.0))
            last_song = s["song"]
        time.sleep(a.every)


if __name__ == "__main__":
    main()
