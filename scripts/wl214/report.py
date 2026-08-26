#!/usr/bin/env python3
"""event214 の走行記録を集計して report.json を吐く。走者・支援者へ公開するページの入力。

なぜ作るか（2026-08-27 Nori 依頼）:
  イベントが終わると板もライブAPIも消える。手元に残るのは NAS の borders.db と
  params.json の申告値だけ。**終わる前に集計の道筋を通しておく**（当日は再実行するだけ）。

⚠️**精度は期間で3階層ある。混ぜると「10日間ずっと精密に測れていた」という嘘になる。**

    8/17〜8/21 07:35   日次のみ。走者の申告値（params.json の schedule）
    8/22 07:36〜        10分刻み。borders.db の総合トップ100（走者が圏内に入って以降）
    特定ブロック        1〜3分刻み。板の直ポーリング（全周実測）

  走者は章ごとに改名するので、DB は名義を繋いで読む（NAMES）。

出力: report.json（このスクリプトと同じ場所）。ページ側はこれだけを読む。

使い方:
    python report.py                 # 集計して report.json を書く
    python report.py --verify        # 既知の申告値と突き合わせて差分を出す（書かない）
"""
import argparse
import datetime
import io
import json
import os
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
PARAMS = os.path.join(HERE, "..", "..", "public", "wl214", "params.json")
LIVE = os.path.join(HERE, "..", "..", "public", "wl214", "live.json")
OUT = os.path.join(HERE, "report.json")
DB = "/volume1/docker/sekai-border-tracker/data/borders.db"
EVENT = 214
T0 = datetime.datetime(2026, 8, 17, 20, 0)
TEND = datetime.datetime(2026, 8, 27, 20, 0)

# 走者の名義。章ごとに改名するので全部繋いで1本の系列にする。
# ⚠️**走者名はリポジトリに書かない**（scripts/wl214/README.md の規約）。環境変数で渡す。
#     WL214_RUNNER_NAMES="名義1,名義2,..."   （カンマ区切り・章ごとの改名を全部）
# ⚠️部分一致で引くと別人を拾う（「歌姫」で3人の別プレイヤーが引っかかった）。**完全一致で引く。**
NAMES = [n for n in os.environ.get("WL214_RUNNER_NAMES", "").split(",") if n.strip()]

# 章の境界（JST）と、章ごとの実測単価 (周回, オート, マイセカイ刻み)。
CHAPTERS = [
    (1, "東雲彰人", datetime.datetime(2026, 8, 17, 20), datetime.datetime(2026, 8, 19, 20)),
    (2, "草薙寧々", datetime.datetime(2026, 8, 19, 20), datetime.datetime(2026, 8, 21, 20)),
    (3, "MEIKO", datetime.datetime(2026, 8, 21, 20), datetime.datetime(2026, 8, 23, 20)),
    (4, "東雲絵名", datetime.datetime(2026, 8, 23, 20), datetime.datetime(2026, 8, 25, 20)),
    (5, "桃井愛莉", datetime.datetime(2026, 8, 25, 20), datetime.datetime(2026, 8, 27, 20)),
]
UNITS = {1: (107310, 68810, 750), 2: (99330, 63700, 700),
         3: (107975, 69125, 750), 4: (120157, 76685, 850), 5: (118049, 75530, 850)}
CHALLENGE = 25440          # チャレライ1回（8/27 02:06 の孤立窓。8/22 ch3 実測は 24,840）


def chapter_at(t):
    for ch, _, a, b in CHAPTERS:
        if a <= t < b:
            return ch
    return 5


def sql(q):
    r = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=25", "nas",
         'sqlite3 -readonly -separator "|" -cmd ".timeout 20000" {0} "{1}"'.format(DB, q)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    # ⚠️returncode 0 でも stdout が None になりうる（refit_border.py と同じ事故）
    if r.returncode != 0 or r.stdout is None:
        sys.exit("ssh失敗（rc={0}）: {1}".format(r.returncode, (r.stderr or "")[:200]))
    return [ln.split("|") for ln in r.stdout.strip().splitlines() if ln.strip()]


def runner_series():
    """走者の (時刻, 順位, Pt) を DB から全名義ぶん取って1本に繋ぐ。"""
    names = ",".join("'{0}'".format(n.replace("'", "''")) for n in NAMES)
    rows = sql("SELECT datetime(timestamp,'+9 hours'), rank, score FROM border_snapshots "
               "WHERE event_id={0} AND board_type='overall' AND user_name IN ({1}) "
               "ORDER BY timestamp;".format(EVENT, names))
    out = []
    for t, rk, sc in rows:
        out.append((datetime.datetime.strptime(t, "%Y-%m-%d %H:%M:%S"), int(rk), int(sc)))
    out.sort()
    # ⚠️同時刻の重複と、単調でない点（別人が同名義になった等）を落とす
    clean = []
    for t, rk, sc in out:
        if clean and (t == clean[-1][0] or sc < clean[-1][2]):
            continue
        clean.append((t, rk, sc))
    return clean


def split_blocks(ser, gap_min=20, idle_min=25):
    """「走者が続けて何かしていた区間」ごとにまとめる。

    切るのは2種類:
      ①**欠測**（DBの巡回が飛んだ。既定20分超）… またぐと別セッションの値が混ざる
      ②**停止**（Ptが増えていない時間。既定25分超）… 手を止めた場所

    ⚠️①だけで切ると足りない（2026-08-27 に踏んだ）。DB は走者が寝ていても10分おきに
      巡回するので欠測にならず、ブロックが35〜47時間の塊になった。その中で単価が
      変わる（8/23 夜のオートは 63,280、8/24 夜は 76,685）と片方しか検出できず、
      もう片方がまるごと「不明」に落ちる。**単価の検出単位は活動の単位に合わせる。**
    """
    out, cur, last_move = [], [], None
    for t, rk, sc in ser:
        if cur:
            gap = (t - cur[-1][0]).total_seconds() / 60.0
            idle = (t - last_move).total_seconds() / 60.0 if last_move else 0
            if gap > gap_min or idle > idle_min:
                out.append(cur)
                cur, last_move = [], None
        if cur and sc > cur[-1][2]:
            last_move = t
        elif not cur:
            last_move = t
        cur.append((t, rk, sc))
    if cur:
        out.append(cur)
    return [b for b in out if len(b) >= 2 and b[-1][2] > b[0][2]]


def detect_units(deltas, mys, fallback_lap, fallback_auto):
    """ブロックの増分から「オート1回」「周回1周」の単価を実データで検出する。

    なぜ定数表をやめたか（2026-08-27）:
      章ごとに (lap, auto, mys) を定数で持っていたが、**単価は章の中でも動く**。
      8/23 夜（ch4 初日）のオートは 63,280 で、定数表の 76,685 と21%違った。
      走者が支援編成を絵名に差し替える前で、ボーナスが 748% 相当のまま回していたため
      （log §33。マイセカイの刻み850＝900%超は差し替えた後の観測）。
      定数で当てると、この夜の 750万 Pt がまるごと「不明」に落ちる。

    検出の作法:
      **オートは厳密に一定、周回は卓の質で1周ごとに±1%揺れる。** この非対称を使う。
      1. まず ±0.1% で説明できる単価を探す（＝オート）
      2. オートで説明できた増分を除き、残りから ±3% で説明できる単価を探す（＝周回）
      逆順にすると、緩い許容幅の周回がオートの増分まで食う。
    """
    def cands(ds, lo, hi):
        c = set()
        for d in ds:
            for k in range(1, 13):
                u = d / float(k)
                if lo <= u <= hi:
                    c.add(int(round(u)))
        return sorted(c)

    def score(u, ds, tol):
        hit, used = 0, []
        for d in ds:
            k = int(round(d / float(u)))
            if 1 <= k <= 12 and abs(d - k * u) <= u * tol * k:
                hit += 1
                used.append(d)
        return hit, used

    def upscale(u, ds, tol):
        """u の半分が採れてしまう問題を潰す。

        ⚠️k×L は必ず 2k×(L/2) でもあるので、**単価の半分は常に本物と同数以上を説明する**。
          ヒット数最大で選ぶと必ず半分（さらに1/4…）が勝つ。実際 8/25 の周回が
          423周→843周 に化けた（2026-08-27）。
          → 倍にしても説明力がほとんど落ちないなら、倍のほうが本物。
        """
        while True:
            h, _ = score(u, ds, tol)
            h2, _ = score(u * 2, ds, tol)
            if h and h2 >= h * 0.9 and u * 2 <= 140000:
                u *= 2
            else:
                return u

    pool = [d for d in deltas if d > 0 and d % mys != 0]

    # ── オートを先に採る ──────────────────────────────────────
    # ⚠️順序が逆だと壊れる。周回は許容幅が広い（1周ごとに卓の質で±1%揺れる）ので、
    #   先に走らせるとオートの増分まで食う。**オートは厳密に一定**なので ±0.1% で
    #   先に抜き、残りを周回に当てる。
    # 窓は章の既知オート単価の 0.75〜1.30 倍。8/23 夜の 63,280（= ch4 定数の 0.825倍。
    #   支援編成の差し替え前でボーナスが低いまま回していた。log §33）を拾うために広めに取る。
    # ⚠️ヒット数だけで選ぶと近い偽物に負ける。8/25 の 16:40〜18:10（走者が周回を止めて
    #   オートに切り替えた窓・log §35）で 79,485 を拾い、本物の 76,685 を落とした。
    #   6区間ぶんの 230,055（＝76,685×3 ちょうど）がまるごと「不明」になった。
    #   → **章の実測定数を事前分布として使う。** ヒット数が最良の8割以上ある候補のうち、
    #     定数に最も近いものを採る。定数は実測で確定した値なので事前分布として妥当。
    scored = []
    for u in cands(pool, fallback_auto * 0.75, fallback_auto * 1.30):
        h, _ = score(u, pool, 0.001)
        if h >= 3:
            scored.append((h, u))
    auto = None
    if scored:
        top = max(h for h, _ in scored)
        near = [u for h, u in scored if h >= top * 0.7]   # 0.8 だと 76,685(6件) が 8件×0.8=6.4 に届かず落ちた
        auto = min(near, key=lambda u: abs(u - fallback_auto) / float(fallback_auto))
        auto = upscale(auto, pool, 0.001)
        if auto > fallback_auto * 1.30:
            auto = None
    rest = pool
    if auto:
        rest = [d for d in pool if not any(abs(d - k * auto) <= auto * 0.001 * k
                                           for k in range(1, 13))]

    # ── 残りから周回を採る ────────────────────────────────────
    # ⚠️オートぶんを除かずに探すと、**オートしかないブロックで「周回＝オート×2」**を拾う
    #   （8/23 夜のオート専用ブロックで 126,560 = 63,280×2 と出た。2026-08-27）。
    # 窓は章の既知単価の ±15%。周回は章の中では卓の質で±1%、ch4 のモデル差でも
    #   −3.7% しか動かないので十分。
    lap = best = None
    for u in cands(rest, fallback_lap * 0.85, fallback_lap * 1.15):
        h, _ = score(u, rest, 0.015)
        if h >= 3 and (best is None or h > best or (h == best and u > lap)):
            best, lap = h, u
    return (lap or fallback_lap), (auto or fallback_auto)


def load_shifts(path):
    """支援シフト（brain 側・非公開）を読んで「周回が回っていた時間帯」の集合にする。

    ⚠️これが無いと板の増分だけでは決まらない場面がある。実例（2026-08-27）:
      8/26 01:48→02:00 の +605,330 は
        「オート8回」= 604,240（差1,090・許容内） … 12分で8回＝90秒/回。天地は182.4秒なので**不可能**
        「周回5周」  = 590,975〜605,330      … 141秒/周。実測帯（122〜127秒）に近い
      板だけだとオート側の許容が狭いぶん先に当たってしまう。シフト表には
      25:00〜26:00（＝01:00〜02:00）の枠に支援者4人が入っており、**周回で確定**する。
    返り値: {日付文字列: set(周回していた時刻)} ではなく、判定用の区間リスト。
    """
    if not path or not os.path.exists(path):
        return []
    with io.open(path, encoding="utf-8") as f:
        data = json.load(f)
    spans = []
    for day in data.get("days", []):
        base = datetime.datetime.strptime(day["date"], "%Y-%m-%d")
        for s in day.get("slots", []):
            if not s.get("filled"):
                continue
            h = int(s["slot"].split(":")[0])
            # 24:00〜28:00 は翌日の 00:00〜04:00
            start = base + datetime.timedelta(hours=h)
            spans.append((start, start + datetime.timedelta(hours=1),
                          s.get("effectiveSum"), s.get("filled")))
    spans.sort()
    return spans


def in_shift(spans, t):
    for a, b, _, _ in spans:
        if a <= t < b:
            return True
    return False


def solve(d, lap, auto, mys, allow_chal=True, shift=False):
    """増分 d を 周回 / オート / マイセカイ / チャレライ に分解する。

    ⚠️周回は1周の単価が卓の質で±1%揺れるので厳密な格子に乗らない。オートとマイセカイは
      厳密。したがって**まず厳密なほうで説明を試し、残りを周回に当てる**。
    ⚠️マイセカイの 600,950 が「周回5」に化ける（§25）。850の倍数ぴったりで1周あたりが
      1.2%超ずれるときはマイセカイを採る。
    返り値 dict(lap=, auto=, mys=, chal=, unexplained=)
    """
    r = {"lap": 0, "auto": 0, "mys": 0, "chal": 0, "unexplained": 0}
    if d <= 0:
        return r
    for chal in ((0, 1) if allow_chal else (0,)):
        d2 = d - chal * CHALLENGE
        if d2 < 0:
            continue
        if d2 == 0:
            r["chal"] = chal
            return r
        # 純マイセカイ（刻みぴったり・周回として当てはめると単価が外れる）
        if d2 % mys == 0:
            k = int(round(d2 / float(lap)))
            dev = abs(d2 / float(k) - lap) / float(lap) if k else 1.0
            if k < 1 or dev > 0.012:
                r["mys"], r["chal"] = d2 // mys, chal
                return r
        # 純オート / 純周回。**支援シフトが入っている時間帯は周回を先に当てる。**
        # ⚠️順序を固定すると必ずどちらかを取り違える。オートの許容は狭い(±0.4%)ので、
        #   無条件に先に当てると周回の増分まで食う（8/26 02:00 の実例は docstring 参照）。
        def as_auto():
            a = int(round(d2 / float(auto)))
            if 1 <= a <= 15 and abs(d2 - a * auto) <= auto * 0.004 * a and d2 % mys != 0:
                return a
            return None

        def as_lap():
            k = int(round(d2 / float(lap)))
            if 1 <= k <= 12 and abs(d2 - k * lap) <= lap * 0.030 * k:
                return k
            return None

        first, second = (("lap", as_lap), ("auto", as_auto)) if shift \
            else (("auto", as_auto), ("lap", as_lap))
        for kind, fn in (first, second):
            got = fn()
            if got:
                r[kind], r["chal"] = got, chal
                return r
        # オート＋マイセカイの混在（どちらも厳密なので剰余で解ける）
        for a in range(1, 12):
            rest = d2 - a * auto
            if rest <= 0:
                break
            if rest % mys == 0:
                r["auto"], r["mys"], r["chal"] = a, rest // mys, chal
                return r
    r["unexplained"] = d
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="申告値と突き合わせるだけ（report.json を書かない）")
    ap.add_argument("--shifts", default=os.path.join(os.path.expanduser("~"), "brain", "log", "wl214-shifts.json"),
                    help="支援シフト（brain 側・非公開）。周回とオートの判別に使う")
    a = ap.parse_args()

    if not NAMES:
        sys.exit("環境変数 WL214_RUNNER_NAMES が空。走者の名義をカンマ区切りで渡すこと"
                 "（章ごとに改名しているので全部）。リポジトリには書かない。")
    with io.open(PARAMS, encoding="utf-8") as f:
        params = json.load(f)

    spans = load_shifts(a.shifts)
    print("支援シフト: {0}枠 読み込み".format(len(spans)))
    ser = runner_series()
    print("DB 実測系列: {0}点  {1:%m/%d %H:%M} 〜 {2:%m/%d %H:%M}".format(len(ser), ser[0][0], ser[-1][0]))

    # ── 日別に分解する ─────────────────────────────────────────
    # ⚠️1日の区切りは **04:00**（オートのクォータのリセット）。00:00 で切ってはいけない。
    #   ①走者のブロックは 19:00〜26:00（＝翌02:00）で、00:00 で切ると夜が2日に割れる
    #   ②オートは1日99回が上限なので、04:00 で切ると「オート ≤ 99回/日」がそのまま検算になる。
    #     暦日で切ると 8/26 が126回になり、上限を超えて意味を成さなかった（2026-08-27）
    # ⚠️**飛んだ区間を分解してはいけない。** 走者が圏内に入る前は板の階層をまたいだ
    #   瞬間しか記録が無く、8/19 05:03 → 8/21 16:12 のような「増分 5,923万」が出る。
    #   これを格子に掛けると当然説明できず、初版は説明率が 61% まで落ちた。
    days, gaps, blocks = {}, [], []
    runs = split_blocks(ser)
    # ブロックごとに単価を検出し、時刻 -> 単価 の引き当て表にする。
    # ⚠️ブロック内の増分だけを回すと、**ブロック境界の増分（12分間隔＝正常な巡回）が
    #   丸ごと落ちる**。初版はこれを「飛び」に計上し、8/26 09:36 の +161,850 などを
    #   取りこぼした（2026-08-27）。増分は全部見て、単価だけブロックから引く。
    for run in runs:
        ch = chapter_at(run[0][0])
        f_lap, f_auto, mys = UNITS[ch]
        deltas = [b[2] - a[2] for a, b in zip(run, run[1:]) if b[2] > a[2]]
        lap, auto = detect_units(deltas, mys, f_lap, f_auto)
        blocks.append({"from": run[0][0], "to": run[-1][0], "ch": ch,
                       "lapUnit": lap, "autoUnit": auto, "mysStep": mys,
                       "pt": run[-1][2] - run[0][2],
                       "hours": round((run[-1][0] - run[0][0]).total_seconds() / 3600.0, 2),
                       "laps": 0, "autos": 0, "mysSteps": 0, "chals": 0, "unexplainedPt": 0})

    def units_at(t):
        """その時刻を含む（か直近の）ブロックの単価。境界の増分もこれで拾える。"""
        best = None
        for b in blocks:
            if b["from"] <= t <= b["to"]:
                return b
            gap = min(abs((t - b["from"]).total_seconds()), abs((t - b["to"]).total_seconds()))
            if best is None or gap < best[0]:
                best = (gap, b)
        return best[1] if best else None

    # ── マイセカイの回収を先に確定する ─────────────────────────
    # ⚠️1区間ずつ判定すると必ず取り違える。8/26 18:33 の +600,950 は 850 の倍数
    #   ぴったり（707刻み）だが、5周ぶんとしても 1周 120,190 で、その夜の実測幅
    #   117,005〜120,190 の**内側に入る**。「1周あたりが平均から1.2%超ずれるなら
    #   マイセカイ」という §25 のガードは、検出した単価が高めに出ると素通りする。
    #   決め手は隣の区間: 600,950 ＋ 185,300 = 786,250 で、これは 17時の回収額そのもの。
    #   → **連続する 850 の倍数を1回の回収としてまとめ、合計が回収の規模なら採る。**
    #   誤爆の確率は「隣り合う2区間がどちらも偶然 850 の倍数」＝ 1/850^2 で無視できる。
    HARVEST = (400, 1100)          # 1回の回収で得るメモリ数の想定レンジ
    idx = [(i, t0, t1, s1 - s0) for i, ((t0, _, s0), (t1, _, s1))
           in enumerate(zip(ser, ser[1:])) if s1 > s0]
    mys_marked = set()
    i = 0
    while i < len(idx):
        b0 = units_at(idx[i][2])
        mys0 = b0["mysStep"] if b0 else 850
        if idx[i][3] % mys0 != 0:
            i += 1
            continue
        j, tot = i, 0
        while j < len(idx) and idx[j][3] % mys0 == 0 and \
                (j == i or (idx[j][1] - idx[j - 1][2]).total_seconds() <= 60):
            tot += idx[j][3]
            j += 1
        steps = tot // mys0
        if HARVEST[0] <= steps <= HARVEST[1]:
            for k in range(i, j):
                mys_marked.add(idx[k][0])
        i = max(j, i + 1)

    for n, ((t0, _, s0), (t1, _, s1)) in enumerate(zip(ser, ser[1:])):
        d = s1 - s0
        if d <= 0:
            continue
        dt = (t1 - t0).total_seconds() / 60.0
        if dt > 20:
            gaps.append({"from": t0.strftime("%Y-%m-%dT%H:%M"), "to": t1.strftime("%Y-%m-%dT%H:%M"),
                         "minutes": round(dt, 1), "pt": d})
            continue
        b = units_at(t1)
        lap, auto, mys = b["lapUnit"], b["autoUnit"], b["mysStep"]
        if n in mys_marked:
            got = {"lap": 0, "auto": 0, "mys": d // mys, "chal": 0, "unexplained": 0}
        else:
            got = solve(d, lap, auto, mys, shift=in_shift(spans, t1))
        key = (t1 - datetime.timedelta(hours=4)).strftime("%Y-%m-%d")
        e = days.setdefault(key, {"lapPt": 0, "autoPt": 0, "mysPt": 0, "chalPt": 0,
                                  "unexplainedPt": 0, "laps": 0, "autos": 0, "mysSteps": 0,
                                  "chals": 0, "total": 0, "unexplainedCount": 0})
        for fld, cnt in (("laps", got["lap"]), ("autos", got["auto"]),
                         ("mysSteps", got["mys"]), ("chals", got["chal"])):
            e[fld] += cnt
            b[fld] += cnt
        e["lapPt"] += got["lap"] * lap
        e["autoPt"] += got["auto"] * auto
        e["mysPt"] += got["mys"] * mys
        e["chalPt"] += got["chal"] * CHALLENGE
        e["unexplainedPt"] += got["unexplained"]
        e["unexplainedCount"] += 1 if got["unexplained"] else 0
        e["total"] += d
        b["unexplainedPt"] += got["unexplained"]

    print()
    print("=== DB 実測ぶんの日別内訳（8/22 以降）===")
    print("（日の区切りは 04:00 ＝ オートのクォータのリセット）")
    print("%-11s %11s %11s %10s %9s %8s %6s %6s %5s" %
          ("日", "合計", "周回Pt", "オートPt", "マイセカイ", "不明", "周回", "オート", "不明n"))
    tot = {"total": 0, "lapPt": 0, "autoPt": 0, "mysPt": 0, "chalPt": 0, "unexplainedPt": 0,
           "laps": 0, "autos": 0}
    for k in sorted(days):
        e = days[k]
        for f in tot:
            tot[f] += e[f]
        print("%-11s %11s %11s %10s %9s %8s %6d %6d %5d" %
              (k, "{0:,}".format(e["total"]), "{0:,}".format(e["lapPt"]),
               "{0:,}".format(e["autoPt"]), "{0:,}".format(e["mysPt"]),
               "{0:,}".format(e["unexplainedPt"]), e["laps"], e["autos"], e["unexplainedCount"]))
    print("%-11s %11s %11s %10s %9s %8s %6d %6d" %
          ("合計", "{0:,}".format(tot["total"]), "{0:,}".format(tot["lapPt"]),
           "{0:,}".format(tot["autoPt"]), "{0:,}".format(tot["mysPt"]),
           "{0:,}".format(tot["unexplainedPt"]), tot["laps"], tot["autos"]))
    # ⚠️自分の矛盾を申告させる。オートは1日99回が上限なので、超えたら分類が間違っている。
    over = [(k, days[k]["autos"]) for k in sorted(days) if days[k]["autos"] > 99]
    if over:
        print("")
        print("⚠️オートがクォータ上限(99回/日)を超えている日がある＝周回をオートと読んでいる:")
        for k, n in over:
            print("   {0}  {1}回（+{2}）".format(k, n, n - 99))
    share = tot["total"] or 1
    print()
    print("連続区間で説明できた割合: %.2f%%（不明 %s Pt / %d区間）" %
          (100.0 * (share - tot["unexplainedPt"]) / share,
           "{0:,}".format(tot["unexplainedPt"]), sum(days[k]["unexplainedCount"] for k in days)))
    gp = sum(g["pt"] for g in gaps)
    print("飛び（20分超の欠測）: %d区間 / %s Pt。ここは分解しない" % (len(gaps), "{0:,}".format(gp)))
    for g in sorted(gaps, key=lambda x: -x["pt"])[:8]:
        print("   %s -> %s  %.0f分  +%s" % (g["from"][5:], g["to"][5:], g["minutes"], "{0:,}".format(g["pt"])))

    # ── 申告値との突き合わせ ────────────────────────────────
    print()
    print("=== 申告値との突き合わせ（params.schedule の確定日）===")
    known = [(s["label"], s.get("actualPt"), s.get("autoPt"), s.get("autoPlays"))
             for s in params["schedule"] if s.get("actualPt")]
    for lbl, act, apt, ap_ in known:
        print("  %-5s 申告 合計 %11s / オート %10s (%s回)  ← DB実測は 8/22 以降のみ" %
              (lbl, "{0:,}".format(act), "{0:,}".format(apt or 0), ap_))

    # ── 1時間ごとの集計（支援者の実効値と突き合わせる）────────────
    hourly = {}
    for (t0, _, s0), (t1, _, s1) in zip(ser, ser[1:]):
        d = s1 - s0
        if d <= 0 or (t1 - t0).total_seconds() > 1200:
            continue
        b = units_at(t1)
        lap, auto, mys = b["lapUnit"], b["autoUnit"], b["mysStep"]
        got = solve(d, lap, auto, mys, shift=in_shift(spans, t1))
        key = t1.strftime("%Y-%m-%dT%H")
        e = hourly.setdefault(key, {"laps": 0, "autos": 0, "mysSteps": 0, "pt": 0,
                                    "lapPt": 0, "seconds": 0})
        e["laps"] += got["lap"]
        e["autos"] += got["auto"]
        e["mysSteps"] += got["mys"]
        e["lapPt"] += got["lap"] * lap
        e["pt"] += d
        e["seconds"] += (t1 - t0).total_seconds()
    for key, e in hourly.items():
        e["lapUnit"] = round(e["lapPt"] / e["laps"]) if e["laps"] else None
        e["lapsPerHour"] = round(e["laps"] / (e["seconds"] / 3600.0), 2) if e["seconds"] else None
        e["ptPerHour"] = round(e["pt"] / (e["seconds"] / 3600.0)) if e["seconds"] else None
    # シフト（支援者と実効値）を時間キーで貼る
    for start, end, effsum, filled in spans:
        key = start.strftime("%Y-%m-%dT%H")
        if key in hourly:
            hourly[key]["supportEffectiveSum"] = effsum
            hourly[key]["supportFilled"] = filled

    if a.verify:
        print("\n--verify なので report.json は書いていない")
        return

    # ⚠️文字列化は最後にやる。先に潰すと units_at() の比較が str vs datetime で落ちる
    for b in blocks:
        b["from"] = b["from"].strftime("%Y-%m-%dT%H:%M")
        b["to"] = b["to"].strftime("%Y-%m-%dT%H:%M")

    out = {
        "_readme": "event214 走行記録の集計。精度は期間で3階層（docstring 参照）。"
                   "8/21以前は走者の申告値（日次）、8/22 07:36以降は borders.db の10分刻み実測。",
        "generatedAt": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "event": {"id": EVENT, "start": T0.strftime("%Y-%m-%dT%H:%M"),
                  "end": TEND.strftime("%Y-%m-%dT%H:%M"),
                  "chapters": [{"ch": c, "chara": n, "from": f.strftime("%Y-%m-%dT%H:%M"),
                                "to": t.strftime("%Y-%m-%dT%H:%M")} for c, n, f, t in CHAPTERS]},
        "measuredDaily": days,
        "hourly": hourly,
        "blocks": blocks,
        "gaps": gaps,
        "measuredTotal": tot,
        "declaredDaily": [{"label": s.get("label"), "actualPt": s.get("actualPt"),
                           "autoPt": s.get("autoPt"), "autoPlays": s.get("autoPlays"),
                           "mysekaiPt": s.get("mysekaiPt"), "hours": s.get("hours"),
                           "blocks": s.get("blocks")} for s in params["schedule"]],
        "series": [{"t": t.strftime("%Y-%m-%dT%H:%M"),
                    "h": round((t - T0).total_seconds() / 3600.0, 3),
                    "rank": rk, "pt": sc} for t, rk, sc in ser],
        "units": dict((str(k), {"lap": v[0], "auto": v[1], "mysekaiStep": v[2]})
                      for k, v in UNITS.items()),
        "challengePt": CHALLENGE,
    }
    with io.open(OUT, "w", encoding="utf-8") as f:
        f.write(json.dumps(out, ensure_ascii=False, indent=1))
    print("\n書いた: {0}（{1:,} bytes）".format(OUT, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
