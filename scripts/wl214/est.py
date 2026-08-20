#!/usr/bin/env python3
"""event214 の現在値から総合ボーダー終値を推定する。
使い方: est.py "2026-08-18 00:30" 100=15226200 500=8374450 1000=5619809
過去WL3（205/207/211）の「同じ経過時間でのシェア」で割り戻す。アンカーは線形補間（階段関数は禁止）。"""
import json, sys, os, datetime

T0 = datetime.datetime(2026, 8, 17, 20, 0)          # event214 開始 JST
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wl_ref_series.json")
cache = json.load(open(CACHE))


def share_at(key, hours):
    d = cache[key]
    s = d["series"]
    if hours >= s[-1][0]:
        return 1.0
    for i in range(1, len(s)):
        if s[i][0] >= hours:
            (ha, va), (hb, vb) = s[i - 1], s[i]
            f = (hours - ha) / (hb - ha)
            return (va + f * (vb - va)) / d["final"]
    return None


now = datetime.datetime.fromisoformat(sys.argv[1])
elapsed = (now - T0).total_seconds() / 3600.0
vals = dict(kv.split("=") for kv in sys.argv[2:])
print(f"# event214 経過 {elapsed:.2f}h（{now:%m-%d %H:%M} JST）")
for rank, cur in vals.items():
    cur = float(cur)
    ests = []
    for ev in (205, 207, 211):
        sh = share_at(f"{ev}-{rank}", elapsed)
        if sh:
            ests.append((ev, sh, cur / sh))
    lo, hi = min(e[2] for e in ests), max(e[2] for e in ests)
    mid = sorted(e[2] for e in ests)[len(ests) // 2]
    detail = " ".join(f"{ev}:{sh*100:.2f}%→{v/1e8:.2f}億" for ev, sh, v in ests)
    print(f"{rank:>5}位 現在 {cur:,.0f} | {detail} | 推定 {lo/1e8:.2f}〜{hi/1e8:.2f}億 (中央 {mid/1e8:.2f}億)")
