#!/usr/bin/env python3
"""NAS の borders.db から実測ボーダーを吸い出して live.json を作る。
ページは Cloudflare Pages にあり NAS にも sekai.best にも直接届かない（CORS）ので、
観測値はこのファイル経由で渡す。ランナーの実測は runner に手で足す。"""
import json, subprocess, datetime, sys, os

# Win の既定コンソール（cp932）でも絵文字つきの出力が落ちないようにする
import sys as _sys
if hasattr(_sys.stdout, "reconfigure"):
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")

T0 = datetime.datetime(2026, 8, 17, 20, 0)
SQL = """SELECT datetime(timestamp,'+9 hours'),
  MAX(CASE WHEN rank=100 THEN score END),
  MAX(CASE WHEN rank=500 THEN score END),
  MAX(CASE WHEN rank=1000 THEN score END),
  MAX(CASE WHEN rank=50 THEN score END)
 FROM border_snapshots WHERE event_id=214 AND board_type='overall'
 GROUP BY timestamp HAVING MAX(CASE WHEN rank=100 THEN score END) IS NOT NULL
 ORDER BY timestamp;"""
out = subprocess.run(
    ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=25", "nas",
     f'sqlite3 -readonly -separator "|" -cmd ".timeout 20000" '
     f'/volume1/docker/sekai-border-tracker/data/borders.db "{SQL}"'],
    capture_output=True, text=True, timeout=180)
if out.returncode != 0:
    sys.exit("ssh失敗: " + out.stderr[:200])

pts = []
for line in out.stdout.strip().split("\n"):
    if not line.strip():
        continue
    ts, r100, r500, r1000, r50 = (line.split("|") + ["", "", "", "", ""])[:5]
    t = datetime.datetime.fromisoformat(ts)
    h = round((t - T0).total_seconds() / 3600, 3)
    pts.append([h, int(r100), int(r500) if r500 else None,
                int(r1000) if r1000 else None, int(r50) if r50 else None])

# 1点/30分に間引く（グラフ用。最新3点は必ず残す）
thin, last = [], -99
for p in pts[:-3]:
    if p[0] - last >= 0.5:
        thin.append(p); last = p[0]
thin += pts[-3:]

# 章ごとのボーダー（章の頭からの経過時間で並べる）。
# ch1 と同じ経過時間で比べると「その章がどれだけ熱いか」が一目で出る。
# chara_id: 11=東雲彰人 15=草薙寧々 25=MEIKO 19=東雲絵名 7=桃井愛莉
# 出典は src/pages/deck/lib/characters.ts（配信データの ch との対応表。characters.test.ts で
# bonuses.json と突合済み）。バーチャル・シンガーは 21〜26 で 21=初音ミク 24=巡音ルカ
# 25=MEIKO 26=KAITO。event211 の章ボードが 2/12/16/20/26 を使っていることでも裏が取れる。
# 一度 MEIKO を 21 と書いて ch3 を丸ごと取りこぼしかけた（2026-08-20）。下の警告はその再発防止。
CHARA = {1: 11, 2: 15, 3: 25, 4: 19, 5: 7}
CHSQL = """SELECT chara_id, datetime(timestamp,'+9 hours'),
  MAX(CASE WHEN rank=50 THEN score END),
  MAX(CASE WHEN rank=100 THEN score END),
  MAX(CASE WHEN rank=200 THEN score END),
  MAX(CASE WHEN rank=500 THEN score END)
 FROM border_snapshots WHERE event_id=214 AND board_type='chapter'
 GROUP BY chara_id, timestamp HAVING MAX(CASE WHEN rank=100 THEN score END) IS NOT NULL
 ORDER BY chara_id, timestamp;"""
cout = subprocess.run(
    ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=25", "nas",
     f'sqlite3 -readonly -separator "|" -cmd ".timeout 20000" '
     f'/volume1/docker/sekai-border-tracker/data/borders.db "{CHSQL}"'],
    capture_output=True, text=True, timeout=180)
if cout.returncode != 0:
    sys.exit("ssh失敗(chapter): " + cout.stderr[:200])

by_chara = {}
for line in cout.stdout.strip().split("\n"):
    if not line.strip():
        continue
    cid, ts, c50, c100, c200, c500 = (line.split("|") + [""] * 6)[:6]
    by_chara.setdefault(int(cid), []).append((datetime.datetime.fromisoformat(ts),
        int(c50) if c50 else None, int(c100), int(c200) if c200 else None,
        int(c500) if c500 else None))

chapters = {}
for n, cid in CHARA.items():
    rows = by_chara.get(cid)
    if not rows:
        # 開始時刻を過ぎている章のデータが無いのは異常（chara_id の取り違えが典型）
        if datetime.datetime.now() >= T0 + datetime.timedelta(hours=48 * (n - 1)):
            print(f"  !! ch{n}(chara{cid}) は開始済みなのに観測ゼロ。chara_id を疑うこと",
                  file=sys.stderr)
        continue
    base = T0 + datetime.timedelta(hours=48 * (n - 1))   # その章の開始
    ser, last = [], -99
    for t, c50, c100, c200, c500 in rows:
        h = round((t - base).total_seconds() / 3600, 3)
        if h < -0.1 or h > 48.5:
            continue                                     # 別章の残骸を弾く
        if h - last < 0.5 and rows[-1][0] != t:
            continue                                     # 1点/30分に間引く
        last = h
        ser.append([h, c50, c100, c200, c500])
    if ser:
        chapters[str(n)] = ser
    print(f"  ch{n}(chara{cid}): {len(rows)}点 → {len(ser)}")

# ランナーの実測（申告ベース。増えたらここに足す）
runner = [
    {"h": 6.0,  "pt": 18650000, "rank": 136, "note": "周回終了時。順位から逆算"},
    {"h": 6.2,  "pt": 19304940, "rank": 127, "note": "マイセカイ全回収後・本人申告"},
    {"h": 13.0, "pt": 22500365, "rank": 278, "note": "8/18 09:00。エビのオート後・天地のオート前・本人申告"},
    {"h": 22.0, "pt": 29246705, "rank": 415, "note": "8/18 18:00。天地オート後・周回前。Pt・順位とも本人申告"},
    {"h": 30.18, "pt": 51610635, "rank": 260, "note": "8/19 02:11。周回ブロック終了時・マイセカイ込み・順位も本人申告（ゲーム内表示）"},
    {"h": 36.98, "pt": 52298385, "rank": 326, "note": "8/19 08:59。マイセカイ後・本人申告"},
    {"h": 48.0,  "pt": 62207685, "rank": None, "note": "8/19 20:00。ch1（彰人）最終。章Pt＝総合Pt"},
    {"h": 54.0,  "pt": 79872185, "rank": 232, "note": "8/20 02:00。ch2 は17,664,500で102位"},
    {"h": 70.167, "pt": 86798180, "rank": 234, "note": "8/20 18:10。オート後。走者はch2画面で観測したので申告は章Pt 24,590,495（章238位）。ch1最終 62,207,685 と合算して総合86,798,180。総合順位はラダーからの換算（200位93,298,030 / 300位75,562,369）"},
    {"h": 70.517, "pt": 87442180, "rank": 215, "note": "8/20 18:31。午後のマイセカイ後。総合Pt・総合順位とも本人申告（18:10のぶんは章画面の見間違いだった旨の訂正あり）。18:10 の 86,798,180 から +644,000 で、ch2 のマイセカイ1回 620,730 とほぼ一致する"},
    {"h": 77.967, "pt": 107983600, "rank": 149, "note": "8/21 01:58。8/20 の周回ブロック終了時（マイセカイ前）。総合Pt・総合順位とも本人申告。18:31 の 87,442,180 から +20,541,420 を 6.967h（19:00〜01:58）で割ると時速 2,948,515 Pt/h。同じブロックで測った単価100,240で割ると 29.41 周/h で、8/19 のブロック（29.37）と一致した"},
    {"h": 94.5, "pt": 115593155, "rank": 230, "note": "8/21 18:30。日中オート・マイセカイ後。総合Pt・総合順位とも本人申告（ゲーム内表示）。01:58 からの増分 7,609,555 は、日中オート99回（ch2 752.5%・63,595/回）＋マイセカイ2回（621,093/回）のモデル 7,538,091 と +0.95% で一致。日中オートが ch2 側（20:00より前）で消化されたことも確定"},
    {"h": 104.0, "pt": 144009935, "rank": 134, "note": "8/22 04:00。夜間ブロック（19:00〜28:00）終了時。総合Pt・総合順位とも本人申告（ゲーム内表示）。この値から ch2 最終を 56,370,970 と置いたが、8/22 に総合板と章板を同一 upstream_ts で突き合わせて ベース(ch1+ch2)=118,470,365 が確定し、**ch2 最終は 56,262,680** に訂正（−108,290）。ずれの原因はこの申告が 04:00 ちょうどではなく 04:03〜04:05 に取られていたこと。夜間はランキング板の3分ポーリング×ラップ計測で全周を実測: 在室2時間はちょうど60周・途切れ実質ゼロ、平均単価 107,95x〜107,99x/周でモデル（107,975）のど真ん中"},
]
# --- 圏内（総合100位以内）に入って以降は、総合板から自動で拾う ---
# 走者名はリポジトリに置かない。環境変数 WL214_RUNNER_NAME に前方一致で渡す。
#   例: WL214_RUNNER_NAME="なまえ" python genlive.py
# 総合板の値は「ゲーム内のPtそのもの」なので、申告や順位換算より強い。
name = os.environ.get("WL214_RUNNER_NAME", "").strip()
if name:
    q = (f"SELECT datetime(timestamp,'+9 hours'), rank, score FROM border_snapshots "
         f"WHERE event_id=214 AND board_type='overall' AND user_name LIKE '{name}%' "
         f"ORDER BY timestamp;")
    r = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=25", "nas",
         f'sqlite3 -readonly -separator "|" -cmd ".timeout 20000" '
         f'/volume1/docker/sekai-border-tracker/data/borders.db "{q}"'],
        capture_output=True, text=True, timeout=180)
    rows = [l for l in r.stdout.strip().splitlines() if l.strip()]
    have = {round(x["h"], 2) for x in runner}
    added = 0
    # グラフが潰れるので30分に1点へ間引く（最新は必ず残す）
    last = -99.0
    for i, line in enumerate(rows):
        ts, rk, sc = line.split("|")
        h = round((datetime.datetime.fromisoformat(ts) - T0).total_seconds() / 3600, 3)
        if i < len(rows) - 1 and h - last < 0.5:
            continue
        last = h
        if round(h, 2) in have:
            continue
        runner.append({"h": h, "pt": int(sc), "rank": int(rk),
                       "note": "総合ボードから自動取得（ゲーム内Pt・順位そのもの。申告ではない）"})
        added += 1
    print(f"総合ボードから走者 {added} 点を追加（板の全 {len(rows)} 点から間引き）")
else:
    print("WL214_RUNNER_NAME 未設定 → 走者の自動取得はスキップ")

# 前回の live.json からは引き継がない。上の runner リストが唯一の正本。
# （引き継ぐ作りにしていたら、経過時刻を訂正したときに古い点が生き残って重複した）
runner.sort(key=lambda r: r["h"])

live = {
    "_readme": ("borders.db（NAS）から生成した実測。border は [イベント経過h, 100位, 500位, 1000位, 50位] の5要素。"
                "chapters は章番号→[章頭からの経過h, 50位, 100位, 200位, 500位] の5要素。"
                "runner は走者の実測。h<110 は本人申告、以降は総合ボードからの自動取得（ゲーム内の値そのもの）。"),
    "generatedAt": datetime.datetime.now().replace(microsecond=0).isoformat(),
    "latest": {"h": pts[-1][0], "r100": pts[-1][1], "r500": pts[-1][2],
               "r1000": pts[-1][3], "r50": pts[-1][4]},
    "border": thin,
    "chapters": chapters,
    "runner": runner,
}
json.dump(live, open("live.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(f"観測点 {len(pts)} → 間引き {len(thin)} / 最新 経過{pts[-1][0]}h 100位 {pts[-1][1]:,}")
