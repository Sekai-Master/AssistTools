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

# 章＝キャラ。色はページの構造の背骨に使う（装飾ではなく章の区切りそのもの）。
CHAPTERS = [
    (1, "東雲彰人", "#E8552F", "2026-08-17T20:00", "2026-08-19T20:00"),
    (2, "草薙寧々", "#2FBFA5", "2026-08-19T20:00", "2026-08-21T20:00"),
    (3, "MEIKO", "#D94C57", "2026-08-21T20:00", "2026-08-23T20:00"),
    (4, "東雲絵名", "#E8993A", "2026-08-23T20:00", "2026-08-25T20:00"),
    (5, "桃井愛莉", "#EF6FA6", "2026-08-25T20:00", "2026-08-27T20:00"),
]
BONUS = {1: 821.0, 2: 752.5, 3: 826.5, 4: 927.0, 5: 912.5}
DOW = "月火水木金土日"


def jload(p):
    with io.open(p, encoding="utf-8") as f:
        return json.load(f)


def chapter_of(datestr):
    """その日（04:00 区切り）の主たる章。境界日はブロックが夜にあるので後半の章を採る。"""
    d = datetime.datetime.strptime(datestr, "%Y-%m-%d") + datetime.timedelta(hours=22)
    for ch, _, _, a, b in CHAPTERS:
        if datetime.datetime.strptime(a, "%Y-%m-%dT%H:%M") <= d < datetime.datetime.strptime(b, "%Y-%m-%dT%H:%M"):
            return ch
    return 5


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
        total = s.get("actualPt") or 0
        autoPt = s.get("autoPt") or 0
        daily.append({
            "date": date, "label": lbl, "ch": ch, "source": "declared",
            "totalPt": total, "autoPt": autoPt, "mysPt": mysPt,
            "lapPt": max(0, total - autoPt - mysPt),
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
        for s in day["slots"]:
            if not s.get("filled"):
                continue
            slots_total += 1
            for i, x in enumerate(s["supporters"]):
                if not x.get("id"):
                    continue
                manslots += 1
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

    return {
        "generatedAt": rep["generatedAt"],
        "final": {"pt": final["pt"], "rank": final.get("rank"), "t": final.get("t")},
        "chapters": [{"ch": c, "chara": n, "color": col, "from": a, "to": b,
                      "bonus": BONUS[c]} for c, n, col, a, b in CHAPTERS],
        "daily": daily,
        "income": income,
        "measuredTotal": tot,
        "hourly": hourly,
        "blocks": rep.get("blocks", []),
        "series": ser,
        "supporters": supporters,
        "supporterCount": len(supporters),
        "slotsTotal": slots_total,
        "manSlots": manslots,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", required=True, help="出力する .html")
    ap.add_argument("--report", default=REPORT)
    ap.add_argument("--shifts", default=SHIFTS)
    ap.add_argument("--params", default=PARAMS)
    a = ap.parse_args()

    data = build(jload(a.report), jload(a.shifts), jload(a.params))
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
