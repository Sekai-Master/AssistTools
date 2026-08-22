#!/usr/bin/env python3
"""周回ブロックを板の差分から解析する（周回数・平均単価・レート）。

log §22/§24 の「格子」。ch3・ボーナス826.5%・独りんぼエンヴィー(base=100)・10炊き(×35) なら
1周のPtは係数 c について Pt(c)=floor(floor(c*9.265*10)/10)*35 の飛び飛びの値しか取らない。
区間の増分をこの格子で分解すると、周回数が一意に決まることが多い。

⚠️ブロック外（周回終了後）の増分は格子に載らない。チャレンジライブ・マイセカイ・オートが
   混ざるため。窓はブロック内で閉じること（2026-08-22 実測で確認）。
⚠️章が変わったら BONUS を変えること（ch1 821 / ch2 752.5 / ch3 826.5 / ch4 927 / ch5 912）。

入力は board_poll.py 形式の CSV（複数可）。upstream_ts で重複排除して結合する。
使い方: python analyze_block.py a.csv b.csv ...
"""
import csv, io, sys, datetime

# Win の既定コンソール（cp932）でも絵文字つきの出力が落ちないようにする
import sys as _sys
if hasattr(_sys.stdout, "reconfigure"):
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BONUS = 826.5
BASE = 100          # 独りんぼエンヴィー event_rate
LBMULT = 35         # 10炊き
AUTO_PT = 69125     # ch3 のオート1回


def pt(c):
    v = int(c * (BONUS + 100) / 100 * 10) / 10
    return int(v * BASE / 100) * LBMULT


LAT = {c: pt(c) for c in range(300, 360)}


def jst(ts):
    d = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')) + datetime.timedelta(hours=9)
    return d.strftime('%H:%M')


def load(paths):
    seen = {}
    for p in paths:
        try:
            f = io.open(p, encoding='utf-8')
        except OSError:
            continue
        for r in csv.DictReader(f):
            ts = r['upstream_ts']
            if ts and ts not in seen:
                seen[ts] = (int(r['score']), r['rank'], r['local_ts'])
    return sorted(seen.items())


rows = load(sys.argv[1:])
if len(rows) < 2:
    print('データ不足'); sys.exit(1)

print('板の点数 %d  %s 〜 %s' % (len(rows), jst(rows[0][0]), jst(rows[-1][0])))
print()
print('%-6s %-6s %8s %4s %8s %7s %s' % ('from', 'to', 'delta', '周', '平均単価', '係数', '判定'))

tot_runs = 0
tot_delta = 0
tot_min = 0.0
unresolved = []
for (t0, (s0, r0, _)), (t1, (s1, r1, _)) in zip(rows, rows[1:]):
    d = s1 - s0
    mins = (datetime.datetime.fromisoformat(t1.replace('Z', '+00:00'))
            - datetime.datetime.fromisoformat(t0.replace('Z', '+00:00'))).total_seconds() / 60
    if d == 0:
        print('%-6s %-6s %8d %4s %8s %7s %s' % (jst(t0), jst(t1), d, '0', '-', '-', '停止'))
        tot_min += mins
        continue
    # k 周に分解できるか（平均係数が格子の範囲に収まるか）
    cands = []
    for k in range(1, 12):
        avg = d / k
        cs = [c for c in LAT if abs(LAT[c] - avg) <= LAT[333] * 0.02]
        if cs:
            cands.append((k, avg, min(cs, key=lambda c: abs(LAT[c] - avg))))
    # オート混入の可能性
    auto_mix = (d % AUTO_PT == 0)
    if cands:
        k, avg, c = cands[0]
        note = 'オート%d回とも解釈可' % (d // AUTO_PT) if auto_mix else ''
        print('%-6s %-6s %8d %4d %8.0f %7d %s' % (jst(t0), jst(t1), d, k, avg, c, note))
        tot_runs += k; tot_delta += d
    else:
        print('%-6s %-6s %8d %4s %8s %7s %s' % (jst(t0), jst(t1), d, '?', '-', '-', '分解できず'))
        unresolved.append((t0, t1, d))
    tot_min += mins

print()
if tot_runs:
    print('合計 %d 周 / %d Pt / %.1f 分' % (tot_runs, tot_delta, tot_min))
    print('  平均単価 %.0f Pt/周（係数 %.1f 相当）' % (tot_delta / tot_runs,
          tot_delta / tot_runs / LAT[333] * 333))
    print('  レート   %.2f 周/h（1周 %.1f 秒）' % (tot_runs / (tot_min / 60), tot_min * 60 / tot_runs))
    print('  時速     %.0f Pt/h' % (tot_delta / (tot_min / 60)))
if unresolved:
    print('  ⚠️分解できなかった区間: %d 件' % len(unresolved))
    for a, b, d in unresolved:
        print('     %s〜%s  %d' % (jst(a), jst(b), d))
