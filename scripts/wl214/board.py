#!/usr/bin/env python3
"""総合トップ100を「順位」ではなく「人」として追い、個人の積み上げから終値を予測する。
従来の予測は 100位の値を過去イベントの同経過シェアで割り戻すだけで、
誰が走っていて誰が寝ているかを一切見ていなかった。"""
import sys, datetime, collections, statistics, json

def load(ev, t0):
    ser = collections.defaultdict(list)      # name -> [(h, score)]
    snaps = collections.defaultdict(dict)    # h -> {rank: score}
    for line in open(f"top100_{ev}.psv", encoding="utf-8"):
        line = line.rstrip("\n")
        if not line: continue
        parts = line.split("|")
        if len(parts) < 4: continue
        ts, rank, score, name = parts[0], int(parts[1]), int(parts[2]), "|".join(parts[3:])
        t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
        h = round((t - t0).total_seconds()/3600, 3)
        ser[name].append((h, score))
        snaps[h][rank] = score
    for v in ser.values(): v.sort()
    return ser, snaps

def at(sq, h):
    """その人の h 時点のスコア。観測が無い区間は前後で線形補間、範囲外は端で止める。
    圏外に落ちている間は観測が無いので、この補間は『その間も緩やかに伸びた』と仮定する。"""
    if not sq: return None
    if h <= sq[0][0]: return sq[0][1]
    if h >= sq[-1][0]: return sq[-1][1]
    for i in range(1, len(sq)):
        if sq[i][0] >= h:
            (ha, va), (hb, vb) = sq[i-1], sq[i]
            return va if hb == ha else va + (h-ha)/(hb-ha)*(vb-va)
    return sq[-1][1]

def analyze(ev, t0, now_h, horizon, label):
    ser, snaps = load(ev, t0)
    hs = sorted(snaps)
    cutoff = max(h for h in hs if h <= now_h)
    # いま圏内にいる人（cutoff 時点の上位100）
    inboard = [(r, s) for r, s in snaps[cutoff].items() if r <= 100]
    inboard.sort()
    # 名前を引くために cutoff スナップショットを名前つきで再構成
    names_now = {}
    for n, sq in ser.items():
        for h, s in sq:
            if abs(h - cutoff) < 1e-9: names_now[n] = s
    print(f"\n=== {label} 経過{cutoff:.2f}h ===")
    print(f"  圏内人数 {len(names_now)} / 延べ登場者 {len(ser)}")
    # 直近windowの時速
    W = 6.0
    rates = {}
    for n, s_now in names_now.items():
        s_old = at(ser[n], cutoff - W)
        if s_old is None: continue
        rates[n] = max(0.0, (s_now - s_old)/W)
    act = [n for n,r in rates.items() if r > 0.3e6]
    print(f"  直近{W:.0f}hで走っている人 {len(act)}/{len(rates)}  "
          f"（走者の中央値 {statistics.median([rates[n] for n in act])/1e6:.2f}M/h）" if act else "  稼働ゼロ")
    return ser, snaps, cutoff, names_now, rates

T211 = datetime.datetime(2026,7,19,11,0)   # 7/19 20:00 JST = 11:00 UTC
T214 = datetime.datetime(2026,8,17,11,0)
analyze(211, T211, 67.0, 240, "event211（バックテスト）")
analyze(214, T214, 999, 240, "event214（現在）")
