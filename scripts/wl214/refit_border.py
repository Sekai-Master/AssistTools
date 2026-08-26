#!/usr/bin/env python3
"""ボーダー終値予測を「いまの実測」でアンカーし直し、params.json に書き戻す。

なぜスクリプトにするか:
  予測値は定数なので放置すると腐る。実際 event214 では h=69 に置いた 2.60億 を5日放置し、
  前提（214が211を+24%上回る）が崩れたあとも表示され続けた（log §26/§34）。
  **報告のたびにこれを回して再アンカーする**のが正しい運用。

手法（§20 の終値比法。変えていない）:
  予測終値 = いまの実測値 × median(参照イベントの「終値 / 同位相の値」)
  位相はイベント長に対する経過割合で揃える。参照は WL3 の4本（202/205/207/211）。

使い方:
    python refit_border.py            # 最新スナップショットでアンカー
    python refit_border.py --at 20:00              # 今日の20:00以前で最新のスナップショット
    python refit_border.py --at 20:00 --day 2026-08-26  # 日付も指定する
    python refit_border.py --dry      # params.json を書き換えず表示だけ
"""
import json, os, subprocess, sys, datetime, statistics, urllib.request

import sys as _sys
if hasattr(_sys.stdout, "reconfigure"):
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
PARAMS = os.path.join(HERE, "..", "..", "public", "wl214", "params.json")
CACHE = os.path.join(HERE, "wl_ref_graph.json")
T0 = datetime.datetime(2026, 8, 17, 20, 0)      # event214 開始 JST
SPAN = 240.0                                     # event214 の長さ(h)
EVS = (202, 205, 207, 211)                       # 参照: WL3 の4本
RANKS = (20, 30, 40, 50, 100)
UA = {"User-Agent": "sekaimaster-assist/1.0"}


def ref_graphs():
    """参照イベントのボーダー曲線。無ければ sekai.best から取ってキャッシュする。"""
    g = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    dirty = False
    for ev in EVS:
        for rk in RANKS:
            k = f"{ev}-{rk}"
            if k in g:
                continue
            url = f"https://api.sekai.best/event/{ev}/rankings/graph?rank={rk}"
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
            rows = d.get("data", d).get("eventRankings", [])
            if not rows:
                sys.exit(f"{k}: 参照データが空")
            t0 = datetime.datetime.fromisoformat(rows[0]["timestamp"].replace("Z", "+00:00"))
            g[k] = {"series": [[(datetime.datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")) - t0)
                                .total_seconds() / 3600, int(r["score"])] for r in rows]}
            dirty = True
            print(f"  取得 {k}: {len(rows)}点")
    if dirty:
        json.dump(g, open(CACHE, "w", encoding="utf-8"))
    for v in g.values():
        v["span"] = v["series"][-1][0]
        v["final"] = v["series"][-1][1]
    return g


def at(series, h):
    """線形補間。階段関数で読むと同位相の比較がずれる。"""
    prev = None
    for hh, val in series:
        if hh >= h:
            if prev is None:
                return val
            h0, v0 = prev
            return v0 + (val - v0) * (h - h0) / (hh - h0) if hh > h0 else val
        prev = (hh, val)
    return series[-1][1]


def live_borders(cutoff=None):
    """NAS の borders.db から 214 の最新スナップショットを取る。"""
    cond = f"AND timestamp <= '{cutoff}' " if cutoff else ""
    sql = (f"SELECT datetime(timestamp,'+9 hours'), rank, score FROM border_snapshots "
           f"WHERE event_id=214 AND board_type='overall' AND rank IN ({','.join(map(str, RANKS))}) "
           f"AND score<>123456789 {cond}"
           f"AND timestamp = (SELECT MAX(timestamp) FROM border_snapshots "
           f"WHERE event_id=214 AND board_type='overall' {cond});")
    r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=25", "nas",
                        f'sqlite3 -readonly -separator "|" -cmd ".timeout 20000" '
                        f'/volume1/docker/sekai-border-tracker/data/borders.db "{sql}"'],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    # ⚠️returncode が 0 でも stdout が None になりうる（text=True の復号事故）。両方見る。
    if r.returncode != 0 or r.stdout is None:
        sys.exit(f"ssh失敗（rc={r.returncode} stdout={r.stdout is not None}）: {(r.stderr or '')[:200]}")
    cur, ts = {}, None
    for line in r.stdout.strip().splitlines():
        if not line.strip():
            continue
        t, rk, sc = line.split("|")
        ts = t
        cur[int(rk)] = int(sc)
    if not cur:
        sys.exit("スナップショットが取れなかった")
    return ts, cur


def main():
    cutoff = None
    if "--at" in sys.argv:
        hhmm = sys.argv[sys.argv.index("--at") + 1]
        h, m = map(int, hhmm.split(":"))
        # DB は UTC。JST の指定時刻を UTC に直す
        # ⚠️日付も渡せるようにする。now() の日付に固定すると、日をまたいで
        #   「昨日の20:00」を指定したとき未来時刻になり、cutoff が効かず黙って最新を使う。
        day = sys.argv[sys.argv.index("--day") + 1] if "--day" in sys.argv else None
        base = (datetime.datetime.strptime(day, "%Y-%m-%d") if day else datetime.datetime.now())
        jst = base.replace(hour=h, minute=m, second=0, microsecond=0)
        cutoff = (jst - datetime.timedelta(hours=9)).strftime("%Y-%m-%dT%H:%M:%S")
    g = ref_graphs()
    ts, cur = live_borders(cutoff)
    tj = datetime.datetime.fromisoformat(ts)
    H = (tj - T0).total_seconds() / 3600
    frac = H / SPAN
    print(f"アンカー {tj:%m/%d %H:%M} JST  h={H:.2f}（進行 {frac*100:.1f}%）\n")

    out = {}
    print(f"{'順位':>4} {'現在値':>13} {'中央':>13} {'下限':>13} {'上限':>13}  LOO誤差")
    for rk in RANKS:
        if rk not in cur:
            print(f"{rk:>4}  スナップショットに無い（スキップ）")
            continue
        mult = {e: g[f"{e}-{rk}"]["final"] / at(g[f"{e}-{rk}"]["series"], frac * g[f"{e}-{rk}"]["span"])
                for e in EVS}
        ms = sorted(mult.values())
        med = statistics.median(ms)
        # leave-one-out。**MAEを精度として引用しない**（アンカー依存で大きく動く。log §34追補）
        errs = []
        for tgt in EVS:
            m = statistics.median([mult[e] for e in EVS if e != tgt])
            gg = g[f"{tgt}-{rk}"]
            errs.append(at(gg["series"], frac * gg["span"]) * m / gg["final"] - 1)
        # レンジは参照倍率の min/max。**n=4 の最小最大であって信頼区間ではない。**
        # ⚠️2026-08-26 の破壊レビューで潰した設計ミス: ここには「片側にしか誤差が出て
        #   いないときは対称に広げない」という分岐を書いていたが、**到達不能だった**。
        #   err_tgt = median(他3本の倍率)/倍率_tgt − 1 なので、最小倍率のイベントでは必ず
        #   err>0、最大倍率のイベントでは必ず err<0 になり、errs は構造上つねに両側を含む。
        #   「片側だった」という 08-25 の観察は符号ではなく**大きさ**の偏りの話で、
        #   この分岐条件では表現できていなかった。存在しない安全性を主張するコメントは害。
        lo, hi = cur[rk] * ms[0], cur[rk] * ms[-1]
        out[str(rk)] = {"lo": round(lo), "mid": round(cur[rk] * med), "hi": round(hi),
                        "cur": cur[rk], "mult": round(med, 4)}
        print(f"{rk:>4} {cur[rk]:>13,} {cur[rk]*med:>13,.0f} {lo:>13,.0f} {hi:>13,.0f}  "
              + " ".join(f"{e*100:+.1f}" for e in sorted(errs)))

    if "--dry" in sys.argv:
        print("\n--dry なので params.json は書き換えていない")
        return
    missing = [r for r in RANKS if str(r) not in out]
    if missing:
        # ⚠️全置換すると、DB のスナップショットからランクが欠けたときに params から
        #   その系列が黙って消え、グラフはそれを描かないまま凡例の判定だけ変える。
        #   「消えた」ことがどこにも出ないので、止めるのが正しい。
        sys.exit(f"⚠️ ランク {missing} がスナップショットに無い。params は書き換えない。"
                 f"別の時刻でアンカーするか、収集を確認すること")
    d = json.load(open(PARAMS, encoding="utf-8"))
    b = d["border"]
    b["finalByRank"] = out
    b["_finalByRankNote"] = (
        f"★{tj:%Y-%m-%d %H:%M} JST（h={H:.1f}・進行{frac*100:.1f}%）でアンカーした上位帯の終値予測。"
        "scripts/wl214/refit_border.py で生成。**定数なので報告のたびに回し直すこと。** "
        "手法は§20の終値比法（現在値 × 参照WL3 4本の「終値/同位相値」の中央）。"
        "cur=アンカー時点の実測、mult=採用した倍率の中央。"
        "⚠️LOO の MAE を精度として引用しないこと（アンカー依存で大きく動く。log §34追補）。")
    if "100" in out:
        b["lowPt"], b["centralPt"], b["highPt"] = out["100"]["lo"], out["100"]["mid"], out["100"]["hi"]
        # ⚠️note も必ず一緒に動かす。数値だけ更新して note に古いアンカー時刻が残ると、
        #   次の運用者が鮮度を誤認する（2026-08-26 に実際にそうなっていた）。
        head = (f"★{tj:%Y-%m-%d %H:%M} JST（h={H:.1f}・進行{frac*100:.1f}%）でアンカーし直した値。"
                f"refit_border.py が自動更新している。旧アンカーの記述は下に残す。" + chr(10)*2)
        if not b.get("note", "").startswith("★" + tj.strftime("%Y-%m-%d")):
            b["note"] = head + b.get("note", "")
    d["version"] = f"{tj:%Y-%m-%dT%H:%M}+09:00"
    open(PARAMS, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    print(f"\nparams.json を更新（version {d['version']}）")


main()
