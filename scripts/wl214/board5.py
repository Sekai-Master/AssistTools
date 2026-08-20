#!/usr/bin/env python3
import datetime, statistics
exec(open('board.py').read().split('T211 = ')[0])
T = {211: datetime.datetime(2026,7,19,11,0), 214: datetime.datetime(2026,8,17,11,0)}

print("=== ch1終(h=48)→h=69 の21時間で、圏内の人はどれだけ積んだか ===")
print("（ボーダーの値ではなく『人』の増分。ボーダーが凍っていても人は動いている）\n")
res={}
for ev in (211,214):
    ser, snaps = load(ev, T[ev]); hs=sorted(snaps)
    a = max(h for h in hs if h <= 48.0); b = max(h for h in hs if h <= 69.0)
    A = {n:s for n,sq in ser.items() for h,s in sq if abs(h-a)<1e-9}
    B = {n:s for n,sq in ser.items() for h,s in sq if abs(h-b)<1e-9}
    both = set(A)&set(B)
    g = sorted((B[n]-A[n]) for n in both)
    dh = b-a
    run = [x for x in g if x/dh > 0.3e6]
    q=lambda p: g[int(p*(len(g)-1))]
    print(f"event{ev}  h={a:.1f}→{b:.1f}（{dh:.1f}h）  追跡 {len(both)}人")
    print(f"  増分 中央 {statistics.median(g)/1e6:6.2f}M  平均 {statistics.mean(g)/1e6:6.2f}M"
          f"  四分位 {q(.25)/1e6:5.2f}〜{q(.75)/1e6:6.2f}M  最大 {g[-1]/1e6:6.2f}M")
    print(f"  0.3M/h超で走っていた人 {len(run)}/{len(both)}人  その合計 {sum(run)/1e6:.0f}M")
    print(f"  ボーダー(rank100) {snaps[a][100]:,} → {snaps[b][100]:,}  ({(snaps[b][100]/snaps[a][100]-1)*100:+.2f}%)")
    res[ev]=(statistics.median(g)/dh, statistics.mean(g)/dh, len(run)/len(both))
    print()

r211, r214 = res[211], res[214]
print("=== 214 / 211 の比 ===")
print(f"  1人あたり時速（中央）  {r214[0]/1e6:.3f} vs {r211[0]/1e6:.3f} M/h  → 比 {r214[0]/r211[0]:.3f}")
print(f"  1人あたり時速（平均）  {r214[1]/1e6:.3f} vs {r211[1]/1e6:.3f} M/h  → 比 {r214[1]/r211[1]:.3f}")
print(f"  稼働率                {r214[2]*100:.0f}% vs {r211[2]*100:.0f}%")
FIN211=214983112
ser,snaps=load(211,T[211]); hs=sorted(snaps); b211=max(h for h in hs if h<=69.0)
ser2,snaps2=load(214,T[214]); hs2=sorted(snaps2); b214=max(hs2)
mult = FIN211/snaps[b211][100]
base = snaps2[b214][100]
print(f"\n=== 予測 ===")
print(f"  211 の h=69→終値 倍率 = {mult:.3f}")
print(f"  そのまま適用        : {base*mult/1e8:.2f}億")
for lbl,k in (('人の時速（中央）で補正', r214[0]/r211[0]), ('人の時速（平均）で補正', r214[1]/r211[1])):
    adj = base*(1+(mult-1)*k)
    print(f"  {lbl}: {adj/1e8:.2f}億")
