#!/usr/bin/env python3
"""いま復帰したとして、退勤までのオートで Pt を最大にする曲を出す。

なぜ要るか（2026-08-27 Nori 依頼）:
  走者のオートが止まり、13:27（＝残り回数 x 周期 を退勤から逆算した締切）までに
  戻らないと 99 回を消化しきれない。**時間が減るほど、1回あたりの点を捨てて
  周期の短い曲へ降りる**のが最適になる。その境目を5分おきに出す。

最適化するもの: min(残り回数, 残り時間 ÷ 周期) x 1回のPt
  回数が縛るなら1回の点が高い曲、時間が縛るなら短い曲。

⚠️周期は「曲長 + ロスタイム34秒」。**板の増分から実測しない**。
  板は3分刻みなので、5回程度の観測から周期を出すと量子化誤差が大きすぎて
  逆の結論が出る（2026-08-27 に実際に踏んだ。180秒と出したが真値は188秒）。
  ロスタイム34秒の根拠は今朝の天地35回・123分（サンプルが多い窓）と走者の手元実測。

使い方:
    python pick_song.py --remain 58 --until 16:30 [--at HH:MM] [--top 5]
"""
import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auto_watch import songs, UNITS          # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--remain", type=int, required=True, help="残りのオート回数")
    ap.add_argument("--until", default="16:30", help="オートを回せる終わりの時刻")
    ap.add_argument("--at", help="復帰時刻 HH:MM（既定は今）")
    ap.add_argument("--oh", type=float, default=34.0, help="1回あたりのロスタイム（秒）")
    ap.add_argument("--ch", type=int, default=5)
    ap.add_argument("--top", type=int, default=5)
    a = ap.parse_args()

    now = datetime.datetime.now()
    if a.at:
        h, m = map(int, a.at.split(":"))
        now = now.replace(hour=h, minute=m, second=0, microsecond=0)
    uh, um = map(int, a.until.split(":"))
    end = now.replace(hour=uh, minute=um, second=0, microsecond=0)
    sec = (end - now).total_seconds()
    if sec <= 0:
        print("退勤時刻を過ぎている")
        return

    rows = []
    for s in songs(a.ch, oh=a.oh):
        n = min(a.remain, int(sec // s["cycle"]))
        rows.append((n * s["perPlay"], n, s))
    rows.sort(key=lambda r: (-r[0], r[2]["cycle"]))
    cur = [r for r in rows if r[2]["song"] == "0.0000034"]
    best = rows[0]

    print("{0} 復帰 / 残り {1} 回 / {2} まで {3:.0f} 分 / ロスタイム {4:.0f} 秒".format(
        now.strftime("%H:%M"), a.remain, a.until, sec / 60, a.oh))
    print("")
    print("{0:<22} {1:<7} {2:>6} {3:>8} {4:>5} {5:>12}".format(
        "曲", "難易度", "周期", "1回Pt", "消化", "総額"))
    for tot, n, s in rows[:a.top]:
        print("{0:<22} {1:<7} {2:>5.0f}秒 {3:>8,} {4:>4}回 {5:>12,}".format(
            s["song"][:22], s["difficulty"], s["cycle"], s["perPlay"], n, tot))
    if cur and cur[0][2]["song"] != best[2]["song"]:
        d = best[0] - cur[0][0]
        print("")
        print("→ いまの 0.0000034 から「{0}」へ替えると {1:+,} Pt（周回 {2:.1f} 周ぶん）".format(
            best[2]["song"], d, d / 118790.0))
    elif cur:
        print("")
        print("→ 0.0000034 のままで最善")


if __name__ == "__main__":
    main()
