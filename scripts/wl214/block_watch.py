#!/usr/bin/env python3
"""ブロック中の増分を「周回 / オート / マイセカイ / 停止」に分類して、稼働の実態を出す。

なぜ作ったか（2026-08-26）:
  8/25 の16時間ブロックで、走者は 16:40〜18:10 の約1時間半、**周回を止めてオートに
  切り替えていた**。Pt は入り続けるので「増分ゼロ」の停止検出には一切かからず、
  こちらは「16時間まるごと周回した」前提で着地を計算していた。
  結果、日別モデルが実測より 826万（2.9%）上に浮き、その約半分がこの1.5時間だった。
  **「Ptが止まった」と「周回が止まった」は別物**で、判断に効くのは後者。

分類の考え方:
  周回・オートはどちらも「1回ぶんのPt」が章ボーナスで決まる固定値なので、増分は
  その整数倍になる。マイセカイは単価の1/10（ch4/ch5 では 850）の倍数。
  この3つの格子は互いに素に近いので、増分を割ってみれば区別がつく。

使い方:
    python block_watch.py <board_poll の CSV> [--ch 5]
"""
import csv, datetime, os, sys

import sys as _sys
if hasattr(_sys.stdout, "reconfigure"):
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# 章ごとの実測値。⚠️新しい章に入ったらここを実測で更新すること。
#   周回は board_poll の増分から、オートはオート専用窓の増分の最大公約数から取れる。
UNITS = {
    3: {"lap": 107975, "auto": 69125, "mys": 750},
    4: {"lap": 120157, "auto": 76685, "mys": 850},
    5: {"lap": 118440, "auto": 75530, "mys": 850},
}


def classify(d, u):
    """増分 d を格子で説明する。返り値は (種別, 回数)。"""
    if d == 0:
        return ("停止", 0)
    for k in range(1, 13):                      # オートは1回ぶんが小さいので先に見る
        if abs(d - k * u["auto"]) <= 3:
            return ("オート", k)
    for k in range(1, 9):
        if abs(d - k * u["lap"]) / max(d, 1) < 0.03:
            return ("周回", k)
    if d % u["mys"] == 0:
        return ("マイセカイ", d // u["mys"])
    return ("不明", 0)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    ch = int(sys.argv[sys.argv.index("--ch") + 1]) if "--ch" in sys.argv else 5
    u = UNITS[ch]
    seen, rows = set(), []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["upstream_ts"] in seen:
                continue
            seen.add(r["upstream_ts"])
            t = datetime.datetime.fromisoformat(r["upstream_ts"].replace("Z", "+00:00")) \
                + datetime.timedelta(hours=9)
            rows.append((t.replace(tzinfo=None), int(r["score"])))
    rows.sort()
    if len(rows) < 2:
        sys.exit("点が足りない")

    print(f"ch{ch}  1周 {u['lap']:,} / オート1回 {u['auto']:,} / マイセカイ刻み {u['mys']}")
    print(f"{'から':>5} {'まで':>5} {'増分':>10} {'分':>4}  内容")
    agg = {}
    laps = 0
    spans = []          # (種別, 開始, 終了) 周回が途切れた区間を拾うため
    for (t0, s0), (t1, s1) in zip(rows, rows[1:]):
        d, dt = s1 - s0, (t1 - t0).total_seconds() / 60
        kind, k = classify(d, u)
        agg[kind] = agg.get(kind, 0) + dt
        if kind == "周回":
            laps += k
        if not spans or spans[-1][0] != kind:
            spans.append([kind, t0, t1])
        else:
            spans[-1][2] = t1
        label = f"{kind}{k}回" if kind in ("周回", "オート") else kind
        print(f"{t0:%H:%M} {t1:%H:%M} {d:>10,} {dt:>4.0f}  {label}")

    total = sum(agg.values())
    print(f"\n=== 稼働の内訳（{rows[0][0]:%H:%M}〜{rows[-1][0]:%H:%M} / {total/60:.2f}h）===")
    for kind, mins in sorted(agg.items(), key=lambda x: -x[1]):
        print(f"  {kind:<8} {mins:>6.0f}分  {mins/total*100:>5.1f}%")
    lapmin = agg.get("周回", 0)
    if lapmin:
        print(f"\n  周回 {laps} 周 / {lapmin/60:.2f}h → {laps/(lapmin/60):.2f}周/h"
              f" / 1周 {lapmin*60/laps:.1f}秒")
    # ⚠️ここが本題。周回が途切れている区間を名指しで出す。
    breaks = [s for s in spans if s[0] != "周回" and (s[2] - s[1]).total_seconds() / 60 >= 10]
    print(f"\n=== 周回が10分以上途切れた区間 ===")
    if breaks:
        for kind, a, b in breaks:
            print(f"  ⚠️ {a:%H:%M}〜{b:%H:%M}（{(b-a).total_seconds()/60:.0f}分）… {kind}")
        lost = sum((b - a).total_seconds() / 60 for _, a, b in breaks)
        print(f"  合計 {lost:.0f}分 = {lost/60:.2f}時間。"
              f"**周回なら {lost/60*u['lap']*29:,.0f} Pt 相当の枠**")
    else:
        print("  なし（ブロックを通して周回が続いている）")


main()
