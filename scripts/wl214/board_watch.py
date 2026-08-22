#!/usr/bin/env python3
"""board_poll.py が書いている CSV を読んで、周回を格子で分解して表示する。

使い方:
    python board_watch.py <CSV>            # 20秒ごとに更新し続ける
    python board_watch.py <CSV> --once     # 1回だけ出して終わる
    python board_watch.py <CSV> --ch 4     # 章を指定（既定は3）
    python board_watch.py <CSV> --base N   # 総合Pt = N + 章Pt の N（既定は event214 の ch1+ch2）

総合Ptは「確定ベース（ch1+ch2）＋ 章Pt」で桁まで正確に出る（2026-08-22 に総合板と
章板を同一 upstream_ts で突き合わせて検証済み）。総合順位は板を1回叩いて
「自分より上のスコアが何件あるか」で出すので、**走者の名前を使わない**（改名に強い）。

1周のPtは係数 c について Pt(c)=floor(floor(c*(bonus+100)/100*10)/10 * base/100) * 35 の
飛び飛びの値しか取らないので、区間の増分から周回数が一意に決まることが多い。
「増分 ÷ おおよその単価を四捨五入」より正確で、分解できない区間は ? と出して隠さない。

⚠️ブロック外（周回終了後）の増分は格子に載らない。マイセカイ・オート・チャレライが
   混ざるため。周回中の窓だけを見ること。
"""
import csv, datetime, io, json, os, sys, time, urllib.request

BONUS = {1: 821, 2: 752.5, 3: 826.5, 4: 927, 5: 912}   # 章ごとのイベントボーナス
SONG = 74.8            # 独りんぼエンヴィーの曲長
BASE = 100             # 同 基礎点
LBMULT = 35            # 10炊き

args = [a for a in sys.argv[1:] if not a.startswith("--")]
ONCE = "--once" in sys.argv
CH = 3
if "--ch" in sys.argv:
    CH = int(sys.argv[sys.argv.index("--ch") + 1])
F = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), "ch_poll.csv")
# 確定ベース = ch1 62,207,685 + ch2 56,262,680（2026-08-22 実測。log §24）
BASEPT = 118470365
if "--base" in sys.argv:
    BASEPT = int(sys.argv[sys.argv.index("--base") + 1])
UA = "sekaimaster-assist/1.0"


def overall(total):
    """総合板を1回叩いて、total より上が何件あるかで順位を出す。名前は使わない。"""
    try:
        req = urllib.request.Request("https://api.sekai.best/event/live",
                                     headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.load(r)
        rows = d.get("data", d).get("eventRankings", [])
        ind = [int(x["score"]) for x in rows if int(x.get("rank", 0)) <= 100]
        b100 = min(ind) if ind else None
        if b100 is None:
            return None
        if total < b100:
            return (None, b100, rows[0].get("timestamp", ""))
        return (1 + sum(1 for v in ind if v > total), b100, rows[0].get("timestamp", ""))
    except Exception:
        return None


def unit(c):
    v = int(c * (BONUS[CH] + 100) / 100 * 10) / 10
    return int(v * BASE / 100) * LBMULT


# ⚠️許容する係数は「実測された分布」に固定する。広く取ると外れ値を飲み込んで
#   しまい、本来「格子外」と警告すべき区間を平然と「2周」と表示する
#   （2026-08-22 に 315-349 で取っていて +207,830 を係数320.5の2周として通した。
#    実測分布は 330-339 で、この区間はどの周回数でも成立しない＝別の収入が混ざっている）。
CMIN, CMAX = 330, 339
LAT = {c: unit(c) for c in range(CMIN, CMAX + 1)}
LO, HI = LAT[CMIN], LAT[CMAX]


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def render():
    seen = {}
    with io.open(F, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            seen[r["upstream_ts"]] = r
    snaps = sorted(seen.values(), key=lambda r: r["upstream_ts"])
    if not ONCE:
        clear()
    print("◆ 章ボード ライブ計測  ch%d（ボーナス %s%%）  %s 更新  板の点 %d"
          % (CH, BONUS[CH], datetime.datetime.now().strftime("%H:%M:%S"), len(snaps)))
    print("  板は約3分刻み。ラベルは実時刻より最大2分ほど遅れて付く\n")
    print("  %-6s %-6s %12s %10s %5s %9s" % ("板時刻", "章内", "ch3 Pt", "増分", "周", "単価"))
    prev = None
    laps = tot = 0
    first = last = None
    unresolved = 0
    lines = []
    for r in snaps:
        t = datetime.datetime.fromisoformat(r["upstream_ts"][:19]) + datetime.timedelta(hours=9)
        s = int(r["score"])
        if prev is None:
            lines.append("  %-6s %-6s %12s %10s %5s %9s"
                         % (t.strftime("%H:%M"), r["rank"] + "位", "{:,}".format(s), "—", "—", "—"))
        else:
            d = s - prev[1]
            if d == 0:
                lines.append("  %-6s %-6s %12s %10s %5s %9s"
                             % (t.strftime("%H:%M"), r["rank"] + "位", "{:,}".format(s), "0", "—", "停止"))
            else:
                ks = [k for k in range(1, 12) if LO <= d / k <= HI]
                k = ks[0] if len(ks) == 1 else 0
                if k:
                    # ⚠️窓は「最初に増分が出た区間の終点」から測る。始点から測ると、
                    #   先頭区間は途中から周回が始まっているぶん窓が短く出て、
                    #   レートが物理上限を超える（2026-08-22 に33.2周/hを出して発覚）。
                    if first is None:
                        first = t          # この区間ぶんは通算から除く
                    else:
                        laps += k
                        tot += d
                        last = t
                else:
                    unresolved += 1
                note = "{:,}".format(round(d / k)) if k else "★格子外"
                lines.append("  %-6s %-6s %12s %+10d %5s %9s"
                             % (t.strftime("%H:%M"), r["rank"] + "位", "{:,}".format(s), d,
                                (str(k) if k else "?"), note))
        prev = (t, s)
    for ln in lines[-18:]:
        print(ln)
    print()
    if laps and first and last and last > first:
        mins = (last - first).total_seconds() / 60
        cyc = mins * 60 / laps
        print("  ■ 通算 %d周 / %s Pt / %.0f分（先頭の不完全な区間は除外）" % (laps, "{:,}".format(tot), mins))
        print("  ■ 平均単価 %s Pt/周（モデル 係数333＝%s）"
              % ("{:,}".format(round(tot / laps)), "{:,}".format(LAT[333])))
        print("  ■ レート %.2f 周/h（1周 %.1f秒・OH %.1f秒）  時速 %s Pt/h"
              % (laps / (mins / 60), cyc, cyc - SONG, "{:,}".format(round(tot / (mins / 60)))))
    else:
        print("  まだ周回の増分が出ていません")
    if unresolved:
        print("  ⚠️★格子外が %d 区間ある。周回だけでは説明できない増分が混ざっている"
              % unresolved)
        print("     （マイセカイ・オート・チャレライ、あるいは炊き数を落とした周回を疑う。"
              "許容係数は %d-%d）" % (CMIN, CMAX))
    if prev:
        total = BASEPT + prev[1]
        print()
        print("  ◇ 総合 %s Pt（確定ベース %s ＋ 章 %s）"
              % ("{:,}".format(total), "{:,}".format(BASEPT), "{:,}".format(prev[1])))
        ov = overall(total)
        if ov is None:
            print("  ◇ 総合順位: 板の取得に失敗")
        elif ov[0] is None:
            print("  ◇ 総合順位: 100位圏外（100位 %s → あと %s）"
                  % ("{:,}".format(ov[1]), "{:,}".format(ov[1] - total)))
        else:
            print("  ◇ 総合 %d位   100位 %s → マージン %s"
                  % (ov[0], "{:,}".format(ov[1]), "{:+,}".format(total - ov[1])))


if ONCE:
    render()
else:
    while True:
        try:
            render()
        except Exception as e:
            print("…", e)
        time.sleep(20)
