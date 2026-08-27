#!/usr/bin/env python3
"""走者・支援者へ見せる走行記録ページ（HTML 1枚）を組み立てる。

なぜスクリプトにするか（2026-08-27）:
  イベントは 8/27 19:59:59 に終わる。**終わってから作ると板もライブAPIも消えている**ので、
  終わる前に組み立てまで通しておいて、当日は report.py → これ、と回すだけにする。

入力（すべて既存のもの。ここでは計算しない）:
  scripts/wl214/report.json          … report.py が作る実測の集計
  ~/brain/log/wl214-shifts.json      … parse_shifts.py が作る支援シフト（⚠️実名入り・非公開）
  public/wl214/params.json           … 走者の申告値とモデル（前半5日ぶん）

出力: 引数で指定した .html（既定はスクラッチパッド）。**公開リポジトリに置かない。**
  支援者45人のハンドルが載るので、Artifact など限定共有の場所へ publish する。

⚠️精度の階層を必ずページ側にも出す。8/21 以前は日次の申告値しか無く、
  8/22 07:36 以降だけが10分刻みの実測。混ぜて「10日間ずっと精密」に見せない。
"""
import argparse
import collections
import datetime
import io
import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(HERE, "report.json")
SHIFTS = os.path.join(os.path.expanduser("~"), "brain", "log", "wl214-shifts.json")
PARAMS = os.path.join(HERE, "..", "..", "public", "wl214", "params.json")
LIVE = os.path.join(HERE, "..", "..", "public", "wl214", "live.json")

# 章＝キャラ。色はページの構造の背骨に使う（装飾ではなく章の区切りそのもの）。
# 名義は走者が章ごとに改名したもの（borders.db の user_name から確認）。
# 繋げると 傘村トータ「おはよう、僕の歌姫」の歌詞になる。
# ⚠️改名は章境界ちょうどではない。ch4 は 8/24 03:12〜03:24 に「泣かないで、」→
#   「泣かないでよ」へ、章の変わり目から7時間半遅れて変わっている（log §33）。
CHAPTERS = [
    (1, "東雲彰人", "#E8552F", "2026-08-17T20:00", "2026-08-19T20:00", ["「君を愛した"]),
    (2, "草薙寧々", "#2FBFA5", "2026-08-19T20:00", "2026-08-21T20:00", ["僕を許して」"]),
    (3, "MEIKO", "#D94C57", "2026-08-21T20:00", "2026-08-23T20:00", ["泣かないで、"]),
    (4, "東雲絵名", "#E8993A", "2026-08-23T20:00", "2026-08-25T20:00", ["泣かないで、", "泣かないでよ"]),
    (5, "桃井愛莉", "#EF6FA6", "2026-08-25T20:00", "2026-08-27T20:00", ["僕の歌姫"]),
]
TEND = datetime.datetime(2026, 8, 27, 20, 0)   # イベント終了（19:59:59 の直後）
# ⚠️ch5 は 8/27 02:39 に 912.5 -> 913.2 へ上がった（走者が実機で確認）。
#   913.2% はオート 75,600・周回 118,055 を同時に再現する。
#   ch5 の大半は 912.5 だったが、差は単価で 0.06% なので1値で持つ。
BONUS = {1: 821.0, 2: 752.5, 3: 826.5, 4: 927.0, 5: 913.25}
DOW = "月火水木金土日"


# ── 協力ライブ（周回）のスコア式。src/pages/ranking/lib/efficiency.ts と同じ ──
#   rate  = baseScore + feverScore x 0.5 + Σ(実効値[i] x skillScoreMulti[i] / 100)
#   自スコア = floor(rate x 総合力 x 4)
#   係数  = 110 + floor(自スコア/17000) + min(16, floor(他4人合計/340000))
#           ↑ 他4人の項は上限16で飽和済み（log §17。他4人合計は約1,240万で上限の2倍以上）
#   単価  = calcLivePt の丸め x ライブボーナス10炊き(x35)
#
# ⚠️**素のモデルは実測を 1.8〜3.3% 下回る。** log §17 が「スコア式が走者の自スコアを
#   低く見積もっている」と指摘していた件で、原因は未特定のまま。
#   → 実測の単価（ch3 107,975 / ch4 120,157 / ch5 118,049）に最小二乗で合わせた
#     **較正係数 k=1.0320 を自スコアに掛ける**。3章とも残差 0.28% に収まる。
#   これは導出ではなく較正。枠どうしの**相対比較**には使えるが、絶対値を1桁目まで信じない。
RUNNER_EFF = 216.0        # 走者の実効値 = 先頭120 + (内部600 − 120) x 0.2
RUNNER_TALENT = 336000
SCORE_CALIB = 1.0320
OTHERS_TERM = 16          # 他4人スコアの項（飽和）
MULTI_MUSIC = "074"       # 独りんぼエンヴィー
MULTI_DIFF = "expert"
MULTI_RATE = 100          # event_rate


def jload(p):
    with io.open(p, encoding="utf-8") as f:
        return json.load(f)


def chapter_at(t):
    """時刻から章を引く。**枠の章判定はこちらを使う。**

    ⚠️日付から近似する chapter_of() を枠に使うと、8/23 08:00 が ch4 になって単価が
      10.5% 水増しされ、report.py 側（時刻ベース）と食い違う（2026-08-27 破壊者指摘）。
    """
    for ch, _, _, a, b, _n in CHAPTERS:
        if datetime.datetime.strptime(a, "%Y-%m-%dT%H:%M") <= t                 < datetime.datetime.strptime(b, "%Y-%m-%dT%H:%M"):
            return ch
    return 5


def chapter_of(datestr):
    """その日（04:00 区切り）の主たる章。境界日はブロックが夜にあるので後半の章を採る。"""
    d = datetime.datetime.strptime(datestr, "%Y-%m-%d") + datetime.timedelta(hours=22)
    for ch, _, _, a, b, _n in CHAPTERS:
        if datetime.datetime.strptime(a, "%Y-%m-%dT%H:%M") <= d < datetime.datetime.strptime(b, "%Y-%m-%dT%H:%M"):
            return ch
    return 5


def live_pt(coef, base, bonus, mult=35):
    b100 = int(round(bonus * 100))
    return (((coef * (b100 + 10000)) // 1000) * base) // 1000 * mult


def slot_unit(effs, enc_eff, bonus, score_data):
    """その部屋（走者＋支援4人・アンコ担当あり）で1周に入るPtを計算する。

    ⚠️走者が5枠のどこに入るかは分からないが、実測との照合で**±350 Pt（0.3%）**しか
      動かないので先頭固定でよい。アンコール枠（slot5）だけは重みが 0.148 と
      他枠（0.063〜0.078）の2倍以上あり、ここに誰が入るかが一番効く。
    """
    e = score_data[MULTI_MUSIC][MULTI_DIFF]
    w = e["skillScoreMulti"]
    room = [RUNNER_EFF] + list(effs)
    rate = e["baseScore"] + e["feverScore"] * 0.5         + sum(room[i] * w[i] / 100.0 for i in range(5)) + enc_eff * w[5] / 100.0
    score = int(rate * RUNNER_TALENT * 4 * SCORE_CALIB)
    coef = 110 + score // 17000 + OTHERS_TERM
    return live_pt(coef, MULTI_RATE, bonus), score, coef


def build(rep, shifts, params):
    ser = rep["series"]
    final = ser[-1] if ser else {"pt": 0, "rank": None}

    # ── 日別。8/21 以前は申告値、8/22 以降は実測 ────────────────
    mys_model = params["mysekai"]
    daily = []
    declared = {d["label"]: d for d in params["schedule"] if d.get("label")}
    for lbl in ["8/17", "8/18", "8/19", "8/20", "8/21"]:
        s = declared.get(lbl) or {}
        date = "2026-08-{0:02d}".format(int(lbl.split("/")[1]))
        ch = chapter_of(date)
        # マイセカイはモデル値（perHarvestPt を章のボーナス比で換算・1日2回）。
        # ⚠️実測ではない。8/17 の開幕だけ openingPt の実測がある。
        harvests = len(s.get("harvestHours") or []) or (1 if lbl == "8/17" else 2)
        per = mys_model["openingPt"] if lbl == "8/17" else \
            round(mys_model["perHarvestPt"] * (100 + BONUS[ch]) / (100 + BONUS[1]))
        mysPt = per * harvests
        # ⚠️**`actualPt` は日の合計ではなく「周回だけ」の値**（2026-08-27 破壊者指摘）。
        #   params 自身の note が裏を取っている:
        #     8/18「まる1日の獲得は 29,110,270」= actualPt 20,966,475 + autoPt 6,801,795 + マイセカイ 1,342,000
        #     8/20「行合計 28,111,415」        = 20,541,420 + 6,327,809 + 620,730 x 2
        #   初版はこれを日合計と読み、そこからさらにオートとマイセカイを引いていた。
        #   結果、支援者が最も濃く入った5晩の周回が実際の 61% に縮んで表示されていた。
        lapPt = s.get("actualPt") or 0
        autoPt = s.get("autoPt") or 0
        total = lapPt + autoPt + mysPt
        daily.append({
            "date": date, "label": lbl, "ch": ch, "source": "declared",
            "totalPt": total, "autoPt": autoPt, "mysPt": mysPt,
            "lapPt": lapPt,
            "autos": s.get("autoPlays"), "laps": None, "hours": s.get("hours"),
            "blocks": s.get("blocks"),
        })
    for date in sorted(rep["measuredDaily"]):
        if date < "2026-08-22":
            continue
        e = rep["measuredDaily"][date]
        daily.append({
            "date": date, "label": "8/{0}".format(int(date[-2:])), "ch": chapter_of(date),
            "source": "measured",
            "totalPt": e["total"], "autoPt": e["autoPt"], "mysPt": e["mysPt"],
            "lapPt": e["lapPt"], "chalPt": e["chalPt"], "unexplainedPt": e["unexplainedPt"],
            "autos": e["autos"], "laps": e["laps"], "mysSteps": e["mysSteps"],
        })
    for d in daily:
        dt = datetime.datetime.strptime(d["date"], "%Y-%m-%d")
        d["dow"] = DOW[dt.weekday()]

    # ── 支援者。誰が何コマ入ったか ────────────────────────────
    sup = collections.OrderedDict()
    slots_total = 0          # 枠（1時間）の数
    manslots = 0             # のべ人数（枠 x 入った人数）
    for day in shifts["days"]:
        dbase = datetime.datetime.strptime(day["date"], "%Y-%m-%d")
        for s in day["slots"]:
            if not any(x.get("id") or x.get("effective") for x in s["supporters"]):
                continue
            # 枠ごとの明細と同じ基準で、イベント終了後の枠は数えない
            if dbase + datetime.timedelta(hours=int(s["slot"].split(":")[0])) >= TEND:
                continue
            slots_total += 1
            for i, x in enumerate(s["supporters"]):
                # ⚠️名前が取れた人だけ数えると のべ人数を5〜10%過少に出す（破壊者指摘）。
                #   実効値だけある枠（名前の記録が無い代打）も1コマとして数える。
                if not (x.get("id") or x.get("effective")):
                    continue
                manslots += 1
                if not x.get("id"):
                    continue
                e = sup.setdefault(x["id"], {"name": x["id"], "slots": 0, "encore": 0,
                                             "effective": None, "days": set()})
                e["slots"] += 1
                if i == 0:
                    e["encore"] += 1
                if x.get("effective"):
                    e["effective"] = x["effective"]
                e["days"].add(day["date"])
    supporters = sorted(
        ({"name": v["name"], "slots": v["slots"], "encore": v["encore"],
          "effective": v["effective"], "days": len(v["days"])} for v in sup.values()),
        key=lambda v: (-v["slots"], v["name"]))

    # ── 時間帯別 ─────────────────────────────────────────────
    hourly = [dict(t=k, **v) for k, v in sorted(rep["hourly"].items())]

    # ── 稼働カレンダー（10日 x 24時間）────────────────────────
    # 実測（8/22以降）が無い前半は、シフト表の枠で「回していた時間」を埋める。
    # ⚠️2つの出所を1枚の絵に混ぜるので、セルにどちらか分かる印を必ず持たせる。
    hmap = {h["t"]: h for h in hourly}
    shift_hours = {}
    for day in shifts["days"]:
        base = datetime.datetime.strptime(day["date"], "%Y-%m-%d")
        for sl in day["slots"]:
            if not sl.get("filled"):
                continue
            t = base + datetime.timedelta(hours=int(sl["slot"].split(":")[0]))
            shift_hours[t.strftime("%Y-%m-%dT%H")] = sl["filled"]
    cal = []
    d0 = datetime.datetime(2026, 8, 17)
    for di in range(11):
        day = d0 + datetime.timedelta(days=di)
        cells = []
        for h in range(24):
            t = day + datetime.timedelta(hours=h)
            key = t.strftime("%Y-%m-%dT%H")
            m = hmap.get(key)
            sup = shift_hours.get(key)
            kind, val = None, 0
            if m:
                # ⚠️優先順位で決めない。周回のある時間にマイセカイが隠れて、
                #   1日2回あるはずの回収がカレンダー全体で3セルしか出なかった（2026-08-27）。
                #   **その1時間で Pt が最大だった活動**を代表にする。
                cand = [("lap", m.get("lapPt", 0), m.get("laps", 0)),
                        ("auto", m.get("autoPt", 0), m.get("autos", 0)),
                        ("mys", m.get("mysPt", 0), m.get("mysSteps", 0))]
                cand = [c for c in cand if c[1] > 0]
                if cand:
                    best = max(cand, key=lambda c: c[1])
                    kind, val = best[0], best[2]
            if kind is None and sup:
                kind, val = "shift", sup
            cells.append({"h": h, "kind": kind, "v": val,
                          "pt": (m or {}).get("pt", 0), "sup": sup,
                          "measured": bool(m)})
        cal.append({"date": day.strftime("%Y-%m-%d"),
                    "label": "8/{0}".format(day.day), "dow": DOW[day.weekday()],
                    "cells": cells})

    # ── シフト枠ごとの明細 ───────────────────────────────────
    # 各枠について「誰が入っていたか・その実効値・計算上の単価・周回速度・時速」を出す。
    # 実測（8/22 以降）がある枠はそれを使い、無い枠は**その日の周回Ptを枠の単価で按分**する。
    #   その日の周回Pt = 申告合計 − 申告オート − マイセカイ（モデル）
    #   一定の周回レート r を仮定すると  周回Pt = r x Σ(枠の単価)  なので  r = 周回Pt / Σ単価
    # ⚠️「枠ごとにレートが違う」ことは表現できない（1日1つのレートに均す）。
    #   実測のある日で照合できるように、モードを分けて出す。
    # 走者の累計Pt。live.json の申告系列（前半）と borders.db の実測（後半）を繋ぐ。
    T0DT = datetime.datetime(2026, 8, 17, 20)
    live = jload(LIVE)
    # ⚠️イベント開始時点（Pt=0）を明示的に入れる。無いと 8/17 のブロックが
    #   「開始側の観測なし」で落ちる（2026-08-27）。
    curve = [(T0DT, 0)]
    curve += [(T0DT + datetime.timedelta(hours=x["h"]), x["pt"]) for x in live.get("runner", [])]
    curve += [(datetime.datetime.strptime(p["t"], "%Y-%m-%dT%H:%M"), p["pt"]) for p in ser]
    curve.sort()

    def pt_at(t, tol_min=95):
        """t の時点の累計Pt。近くに観測が無ければ None（推定しない）。

        ⚠️遠い点から補間すると、寝ている時間やオートの時間を周回に混ぜてしまう。
          ブロックの端に観測がある場合だけ使う。
        """
        best = None
        for tt, pv in curve:
            d = abs((tt - t).total_seconds()) / 60.0
            if best is None or d < best[0]:
                best = (d, tt, pv)
        if best and best[0] <= tol_min:
            return best[2]
        return None

    score_data = jload(os.path.join(HERE, "..", "..", "public", "MusicDatas", "musicScoreData.json"))
    roster = {r["name"]: r for r in shifts.get("roster", [])}
    # シフト表に実効値が書かれている人は、名簿に無くてもそこから拾う
    seen_eff = {}
    for day in shifts["days"]:
        for sl in day["slots"]:
            for x in sl["supporters"]:
                if x.get("id") and x.get("effective"):
                    seen_eff.setdefault(x["id"], x["effective"])
    all_eff = [r["effective"] for r in shifts.get("roster", []) if r.get("effective")]
    all_eff.sort()
    SUB_EFF = all_eff[len(all_eff) // 2] if all_eff else 280.0   # 代打の実効値（名簿の中央値）
    daily_by_date = {d["date"]: d for d in daily}
    hmap2 = {h["t"]: h for h in hourly}
    slots_out = []
    for day in shifts["days"]:
        base = datetime.datetime.strptime(day["date"], "%Y-%m-%d")
        rows = []
        for sl in day["slots"]:
            # ⚠️`filled` は人数（0〜4）で真偽値ではない。ただし**名前が無い枠を落としてもいけない**。
            #   8/24 の 25:00〜27:00 は実効値だけあって名前が欠けているが実在の枠で、
            #   シフト表の穴は本人・霞・はちみーが埋めている（Nori）。
            #   イベント終了後のゴースト枠は下の TEND で落とすので、ここでは
            #   「名前か実効値のどちらかがある」ことだけを条件にする。
            if not any(x.get("id") or x.get("effective") for x in sl["supporters"]):
                continue
            h = int(sl["slot"].split(":")[0])
            t = base + datetime.timedelta(hours=h)
            # ⚠️シフト表にはイベント終了後の枠まで行が残っている（8/27 20:00・21:00）。
            #   落とさないと「79時間」の総計に走れない2時間が入る（2026-08-27 破壊者指摘）。
            if t >= TEND:
                continue
            # ⚠️章は**枠の開始時刻**で決める。日付から近似すると 8/23 08:00 が ch4 になり、
            #   単価が 10.5% 水増しされる（破壊者指摘。report.py 側とも食い違っていた）。
            ch = chapter_at(t)
            bonus = BONUS[ch]
            members = []
            effs = []
            subs = 0
            for i, x in enumerate(sl["supporters"]):
                nm = x.get("id")
                ef = x.get("effective")
                if ef is None and nm:
                    ef = (roster.get(nm) or {}).get("effective") or seen_eff.get(nm)
                sub = False
                if ef is None:
                    # ⚠️**空き枠を「人が足りない」と読んではいけない**（2026-08-27 Nori）。
                    #   シフト募集のある枠でツイボ（野良募集）は一度もしていない。表の穴は
                    #   Nori 本人・霞・はちみー が埋めている。実効値0で計算すると単価を
                    #   大きく取りこぼす。名簿の中央値を代打として置く。
                    ef, sub, subs = SUB_EFF, True, subs + 1
                members.append({"name": nm, "effective": ef, "encore": i == 0, "sub": sub})
                effs.append(ef)
            unit, score, coef = slot_unit(effs, effs[0], bonus, score_data)
            m = hmap2.get(t.strftime("%Y-%m-%dT%H"))
            rows.append({
                "t": t.strftime("%Y-%m-%dT%H:%M"), "date": day["date"], "hour": h,
                "ch": ch, "bonus": bonus, "members": members,
                "effectiveSum": round(sum(effs), 1), "filled": sl["filled"], "subs": subs,
                "unit": unit, "coef": coef,
                "laps": (m or {}).get("laps") or 0,
                "lapsPerHour": (m or {}).get("lapsPerHour"),
                # ⚠️`m.get("laps")` は 0 が falsy。**周回0周という実測**を「実測なし」と読み、
                #   オートのPtを周回として按分していた（8/25 17時。破壊者指摘）。
                #   観測があるかどうかは m の有無で判定する。
                "measured": m is not None,
            })
        # 実測が無い枠は、**その夜のブロック全体の増分**を単価で按分する。
        # ⚠️初版は params の日次 actualPt から オート・マイセカイ を引いて按分したが、
        #   **期間の切り方が合わない**。8/17 は周回ブロック（20:00〜02:00）の 18,650,000 が
        #   まるごと周回で、オートはその後（02:12〜04:00）に回っている。オートを引いたせいで
        #   23.1周/h と出たが、正しくは 29.1周/h（2026-08-27 に発見）。
        #   → **ブロックの開始と終了の実Pt を系列から取り、その差を按分する。**
        need = [r for r in rows if not r["measured"]]
        if need:
            t0 = datetime.datetime.strptime(need[0]["t"], "%Y-%m-%dT%H:%M")
            t1 = datetime.datetime.strptime(need[-1]["t"], "%Y-%m-%dT%H:%M") + datetime.timedelta(hours=1)
            p0, p1 = pt_at(t0), pt_at(t1)
            if p0 is not None and p1 is not None and p1 > p0:
                gain = p1 - p0
                # 窓の中に入っているマイセカイの回収を引く（params の harvestHours は経過時間）
                mys_in = 0
                # ⚠️`harvestHours` は**その日の時刻**（24超は翌日）。経過時間ではない。
                #   params の _timingNote が「既定は当日10:00 と 18:20」と書いており、
                #   harvestHoursDefault=[10.0, 18.35] と一致する。経過時間として扱うと
                #   8/19 の 19.85（＝19:51・周回窓の中での回収）が 8/18 15:51 に化けて、
                #   ch2 の回収 62万Pt がまるごと周回に混ざる（破壊者指摘）。
                for hh in (declared.get("8/{0}".format(base.day), {}) or {}).get("harvestHours") or []:
                    th = base + datetime.timedelta(hours=hh)
                    if t0 <= th < t1:
                        mys_in += round(mys_model["perHarvestPt"] * (100 + bonus) / (100 + BONUS[1]))
                lapPt = max(0, gain - mys_in)
                usum = sum(r["unit"] for r in need)
                rate = lapPt / usum if usum else 0
                for r in need:
                    r["lapsPerHour"] = round(rate, 2)
                    r["laps"] = round(rate, 1)
                    r["estimated"] = True
                    r["estWindow"] = [t0.strftime("%m-%d %H:%M"), t1.strftime("%m-%d %H:%M")]
                    r["estMysSubtracted"] = mys_in
        for r in rows:
            r["ptPerHour"] = round((r["lapsPerHour"] or 0) * r["unit"])
        slots_out += rows

    # ── 収入の内訳は **実測窓に限定する** ────────────────────────
    # ⚠️前半の申告値と後半の実測を足して「全期間の内訳」にしてはいけない。
    #   初版はそれをやって、内訳の合計 269,677,821 が最終Pt 314,549,575 と 4,500万 合わなかった。
    #   原因は二重: ①申告の日次合計は板の実測と期間の切り方が違う
    #   ②走者が圏内に入る前は板が飛び飛びで、その間の 1億3千万 Pt はどの収入か分解できない。
    #   → **分解できた範囲だけを内訳として出し、その範囲が全体の何%かを併記する。**
    tot = rep["measuredTotal"]
    income = {
        "lapPt": tot["lapPt"], "autoPt": tot["autoPt"], "mysPt": tot["mysPt"],
        "chalPt": tot.get("chalPt", 0), "unexplainedPt": tot["unexplainedPt"],
        "scopeTotal": tot["total"],
        "scopeFrom": "2026-08-22T04:00",
        "eventTotal": final["pt"],
    }

    est_laps = sum(r["laps"] for r in slots_out if r.get("estimated"))
    est_lap_pt = sum(r["laps"] * r["unit"] for r in slots_out if r.get("estimated"))
    totals_all = {
        "laps": round(tot["laps"] + est_laps),
        "lapPt": round(tot["lapPt"] + est_lap_pt),
        "autos": tot["autos"] + sum(d.get("autos") or 0 for d in daily if d["source"] == "declared"),
        "autoPt": tot["autoPt"] + sum(d.get("autoPt") or 0 for d in daily if d["source"] == "declared"),
        "mysPt": tot["mysPt"] + sum(d.get("mysPt") or 0 for d in daily if d["source"] == "declared"),
    }

    # ⚠️日別の合計は全体に届かない。申告の日次値は夜ブロックしか数えておらず、
    #   8/22 04:00 までの実増分との差がそのまま抜ける（破壊者指摘・実測 4,538万）。
    #   **隠さず「日別に割り当てられていないぶん」として出す。**
    daily_sum = sum(d["totalPt"] for d in daily)
    return {
        "generatedAt": rep["generatedAt"],
        "totalsAll": totals_all,
        "eventEnd": TEND.strftime("%Y-%m-%dT%H:%M"),
        # ⚠️終了したかどうかは**実時刻**で判定する。最終スナップショットの時刻で見ると、
        #   sekai.best が終了時刻ちょうどで更新を止める（214 は 19:57 が最後）ため、
        #   イベントが終わっているのに「走行中」の文面が出る（2026-08-27 に踏んだ）。
        #   スナップショットの時刻は鮮度の表示（asOf）としてだけ使う。
        "isOver": datetime.datetime.now() >= TEND,
        "asOf": final.get("t"),
        "dailySum": daily_sum,
        "unassignedPt": final["pt"] - daily_sum,
        "final": {"pt": final["pt"], "rank": final.get("rank"), "t": final.get("t")},
        "chapters": [{"ch": c, "chara": n, "color": col, "from": a, "to": b,
                      "bonus": BONUS[c], "names": nm} for c, n, col, a, b, nm in CHAPTERS],
        "daily": daily,
        "income": income,
        "measuredTotal": tot,
        "hourly": hourly,
        "calendar": cal,
        "slots": slots_out,
        "blocks": rep.get("blocks", []),
        "series": ser,
        "supporters": supporters,
        "supporterCount": len(supporters),
        "slotsTotal": slots_total,
        "manSlots": manslots,
    }


# 章キャラの誕生日（マスタDB characterProfiles.json で確認済み）。
# event214 の上位陣は、この5つを連結した数字に**着地**させて終わる。
# 2026-08-27 の実測で、トップ100のうち21人がこの文法の値で終えていた。
BIRTHDAYS = [("1112", "東雲彰人", "11/12"), ("1105", "MEIKO", "11/5"),
             ("720", "草薙寧々", "7/20"), ("430", "東雲絵名", "4/30"),
             ("319", "桃井愛莉", "3/19")]


def decompose(score):
    """スコアの文字列を、章キャラの誕生日で右から貪欲に分解する。
    ⚠️長いコード（1112/1105）を先に試すこと。3桁を先に見ると 1112 が [112] に割れる。"""
    s = str(score)
    parts, i = [], len(s)
    while i > 0:
        for code, chara, mmdd in BIRTHDAYS:
            if i - len(code) >= 0 and s[i - len(code):i] == code:
                parts.append({"t": code, "chara": chara, "date": mmdd})
                i -= len(code)
                break
        else:
            i -= 1
            parts.append({"t": s[i], "chara": None, "date": None})
    return list(reversed(parts))


def landing_block(board, runner_pt):
    rows = board.get("data", board).get("eventRankings", [])
    out = []
    for e in sorted(rows, key=lambda r: r["rank"]):
        if e["rank"] > 100:
            continue
        parts = decompose(int(e["score"]))
        hits = [p for p in parts if p["chara"]]
        # ⚠️「どこかにコードが含まれる」で拾ってはいけない。9桁の数字に3桁のコードが
        #   偶然現れるので、トップ100のうち67人が該当してしまい意味を成さなかった。
        #   着地の証拠は **末尾がコードで終わっていること**。ここで初めて
        #   「合わせて終えた人」と「時間切れまで走った人」が分かれる（2026-08-27）。
        if not hits or not parts[-1]["chara"]:
            continue
        out.append({"rank": e["rank"], "pt": int(e["score"]), "name": e["userName"],
                    "parts": parts, "who": "＋".join(p["chara"] for p in hits),
                    "isRunner": int(e["score"]) == runner_pt})
    return {"rows": out, "total": min(100, len([e for e in rows if e["rank"] <= 100])),
            "codes": [{"t": c, "chara": ch, "date": d} for c, ch, d in BIRTHDAYS]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", required=True, help="出力する .html")
    ap.add_argument("--report", default=REPORT)
    ap.add_argument("--shifts", default=SHIFTS)
    ap.add_argument("--params", default=PARAMS)
    ap.add_argument("--board", default="",
                    help="最終ボードの JSON（api.sekai.best/event/live の生）。着地の節を出す")
    a = ap.parse_args()

    data = build(jload(a.report), jload(a.shifts), jload(a.params))
    if a.board:
        data["landing"] = landing_block(jload(a.board), data["final"]["pt"])
    tpl = io.open(os.path.join(HERE, "report_page.html"), encoding="utf-8").read()
    # ⚠️プレースホルダは "/*__DATA__*/null" 全体で置く。コメントだけ置換すると `{...}null` になって落ちる
    marker = "/*__DATA__*/null"
    if marker not in tpl:
        sys.exit("テンプレートに {0} が無い".format(marker))
    html = tpl.replace(marker, json.dumps(data, ensure_ascii=False))
    with io.open(a.out, "w", encoding="utf-8") as f:
        f.write(html)
    print("書いた: {0}（{1:,} bytes）".format(a.out, os.path.getsize(a.out)))
    print("  最終 {0:,} Pt / {1}位".format(data["final"]["pt"], data["final"]["rank"]))
    print("  支援者 {0}人 / {1}時間 / のべ {2}人コマ".format(
        data["supporterCount"], data["slotsTotal"], data["manSlots"]))
    inc = data["income"]
    tot = inc["scopeTotal"]
    print("  内訳の範囲 {0} 以降 {1:,} Pt（全体 {2:,} Pt の {3:.0f}%）".format(
        inc["scopeFrom"][5:10], tot, inc["eventTotal"], 100.0 * tot / inc["eventTotal"]))
    for k, lbl in (("lapPt", "周回"), ("autoPt", "オート"), ("mysPt", "マイセカイ"),
                   ("chalPt", "チャレライ"), ("unexplainedPt", "不明")):
        print("  {0:<10} {1:>13,}  {2:5.1f}%".format(lbl, inc[k], 100.0 * inc[k] / tot if tot else 0))


if __name__ == "__main__":
    main()
