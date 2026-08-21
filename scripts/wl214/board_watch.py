#!/usr/bin/env python3
import csv,datetime,os,sys,time,statistics
F=sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'ch_poll.csv')
def render():
    rows=list(csv.DictReader(open(F)))
    seen={}
    for r in rows: seen[r['upstream_ts']]=r
    snaps=sorted(seen.values(), key=lambda r:r['upstream_ts'])
    os.system('clear')
    print(f'◆ 章ボード ライブ計測   {datetime.datetime.now():%H:%M:%S} 更新（板は約3分刻み）\n')
    prev=None; laps=0; pt=0; hist=[]
    for r in snaps:
        t=datetime.datetime.fromisoformat(r['upstream_ts'][:19])+datetime.timedelta(hours=9)
        s=int(r['score'])
        if prev:
            d=s-prev[1]
            if d>0:
                n=max(1,round(d/108000)); laps+=n; pt+=d
                hist.append((t,r['rank'],s,d,n))
        prev=(t,s)
    for t,rk,s,d,n in hist[-14:]:
        per=d/n
        mark='  ←1周単発' if n==1 else f'  ({n}周)'
        print(f'  {t:%H:%M}  {rk:>3}位  {s:>11,}  +{d:>8,}  {per:>9,.0f}/周{mark}')
    if laps:
        print(f'\n  ■ 通算 {laps}周 / 平均 {pt/laps:,.1f} Pt/周   （モデル: 係数333＝107,975）')
    if len(hist)>=2:
        span=(hist[-1][0]-hist[0][0]).total_seconds()/3600
        if span>0: print(f'  ■ 直近レート {sum(h[4] for h in hist)/span:.1f} 周/h（物理上限 29.5）')
while True:
    try: render()
    except Exception as e: print('…',e)
    time.sleep(20)
