#!/usr/bin/env python3
"""最終日のオート消化を監視して、16:30 の退勤までに残り回数を消化できるかを判定する。

なぜ作ったか（2026-08-27）:
  最終日の収入は「日中オート99回」「マイセカイ2回」「夕方の周回2時間」の3本。
  このうち日中オートだけは**走者が職場にいる間に進む**ので、こちらから見えないと
  「16:30 に終わってみたら88回だった」（8/26 の実績）を繰り返す。
  8/26 は回っている間 3.6〜3.7分/回と理論どおりで、足りなかったのは止めていた時間だった
  （log §35）。**止まりを早く見つけることが監視の目的**で、ペースの微調整ではない。

  もうひとつの用途が昼休憩（12:00〜13:00）の曲変更の打診（2026-08-27 Nori）。
  残り回数が退勤までに終わらないなら、1周期の短い曲へ替えたほうが総額が上がる。

曲の選択（判定式の根拠）:
  1周期は「曲長 + OH」、1回の収入は musicScoreData.json の譜面データを
  efficiency.ts のスコア式と calcLivePt.ts の丸めに通した値（ch5・走者の編成）:

      曲                 難易度  周期    1回Pt   Pt/秒   天地比
      初音天地開闢神話  master 215.4秒  75,530  350.6   ±0
      メルト            expert 215.1秒  75,530  351.1  +0.1%
      ワールドイズマイン master 203.8秒  75,285  369.4  +5.4%
      月光              master 190.0秒  72,940  383.9  +9.5%
      ガランド          master 163.7秒  70,420  430.2 +22.7%
      独りんぼエンヴィー expert 107.8秒  62,370  578.6 **+65%**

  **天地は「1回あたり」で公開707曲中の1位**（event_rate が130で頭打ちなので、
  rate130 かつ最長の天地が上限。メルトが同値タイ）。曲を変えるのは常に
  「1回の点を下げて速度を買う」方向にしかならない。
  したがって選択は閾値ではなく **min(残り回数, 時間÷周期) x 1回Pt の最大化**。
  回数(99)が縛るなら天地、時間が縛るなら短い曲。

  利得の実例（残り回数 / 退勤までの時間）:
      55回 / 3.75h  天地が最適（余裕あり）              差 0
      70回 / 3.75h  月光       +422,940 ＝ 周回 3.6周ぶん
      90回 / 3.75h  ガランド  +1,091,580 ＝ 周回 9.2周ぶん
      50回 / 2.00h  独りんぼ   +626,010 ＝ 周回 5.3周ぶん

  ⚠️**「利得は周回1〜2周ぶんが上限」は誤り**（2026-08-27 に訂正）。曲長比の仮定で
    短い曲を最大28%過小評価していたため。実データでは最大10周ぶん動く。

データ源:
  NAS の borders.db（総合トップ100に走者が入っているので9〜12分刻みで拾える）。
  ライブプロセス（nas_live.py）が落ちていても動くように、板ではなく DB を見る。

使い方:
    python auto_watch.py                    # 今日の04:00以降を集計
    python auto_watch.py --since 09:00      # 起点を指定
    python auto_watch.py --until 16:30      # 退勤時刻（既定 16:30）
    python auto_watch.py --quota 99         # 1日の上限回数（既定 99）
    python auto_watch.py --json             # 機械可読（cron から叩く用）
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

DB = "/volume1/docker/sekai-border-tracker/data/borders.db"
EVENT = 214
# ⚠️走者名はリポジトリに書かない（README の規約）。
#   優先順位: --name > 環境変数 WL214_RUNNER_NAME > scripts/wl214/.runner（gitignore 済み）
#   ⚠️.runner を用意していないと cron から叩いたときに落ちる（2026-08-27 に踏みかけた）。
HERE = os.path.dirname(os.path.abspath(__file__))


def _default_runner():
    v = os.environ.get("WL214_RUNNER_NAME")
    if v:
        return v
    f = os.path.join(HERE, ".runner")
    if os.path.exists(f):
        with io.open(f, encoding="utf-8") as fh:
            names = [x.strip() for x in fh if x.strip()]
        if names:
            return names[-1]      # 最後の行＝いまの章の名義
    return ""


RUNNER = _default_runner()

# 章ごとの実測値。nas_live.py の UNITS と同じ値を保つこと。
UNITS = {3: (107975, 69125, 750), 4: (120157, 76685, 850), 5: (118049, 75530, 850)}

AUTO_SONG = "初音天地開闢神話"
OH_DEFAULT = 33.0           # ソロオートの曲外時間（src/lib/overhead.ts の OVERHEAD_SEC.auto）
BONUS = {3: 826.5, 4: 927.0, 5: 912.5}   # 章ごとのイベントボーナス%（実測に合わせた端数込み）
LB_MULT = 35                # ライブボーナス10炊きの倍率（LIVE_BONUS_MULTIPLIERS[10]）
MUSIC_DIR = os.path.join(HERE, "..", "..", "public", "MusicDatas")


def live_pt(coef, base, bonus, mult=LB_MULT):
    """獲得イベントPt。src/pages/analyzer/lib/calcLivePt.ts の livePtFromCoefficient と同じ丸め。

    ⚠️割り算を最後まで遅らせて整数で処理する（float でやると切り捨てが1つ余分に走る）。
    """
    b100 = int(round(bonus * 100))
    step2x10 = (coef * (b100 + 10000)) // 1000
    step3 = (step2x10 * base) // 1000
    return step3 * mult


def auto_score(entry, talent, lead, inner):
    """オートのスコア。src/pages/ranking/lib/efficiency.ts と同じ式。

        rate  = baseScoreAuto + Σ(実効スコアアップ% × skillScoreAuto[i] / 100)
        score = floor(rate × 総合力 × 4)

    ソロ/オートは「編成5枚が1回ずつ ＋ 最後にリーダーがもう1回 = 6回」。
    1〜5回目の発動順は選べないので5枚は平均値（inner/5）で置き、6回目にリーダーを置く。
    """
    w = entry.get("skillScoreAuto")
    b = entry.get("baseScoreAuto")
    if not isinstance(w, list) or len(w) < 6 or not isinstance(b, (int, float)):
        return None
    if any(not isinstance(x, (int, float)) for x in w[:6]):
        return None
    avg = inner / 5.0
    rate = b + sum((avg if i < 5 else lead) * w[i] / 100.0 for i in range(6))
    return int(rate * talent * 4)


def songs(ch, oh=OH_DEFAULT, talent=336000, lead=120, inner=600, limit=6):
    """公開曲すべてについて (名前, 周期秒, 1回のPt) を出し、Pt/秒 の上位に絞って返す。

    ⚠️**オートのスコアは曲長に比例しない。**（2026-08-27 に前提を捨てた）
      当初は「天地の実測スコアを曲長比でスケールする」で組み、§35 の表と桁まで
      一致したので正しいと思ったが、それは同じ仮定から作った表なので circular だった。
      musicScoreData.json の baseScoreAuto / skillScoreAuto を使って実データで解くと、
      短い曲ほどスキルの寄与が相対的に大きく、**独りんぼエンヴィーは 44,625（旧）ではなく
      62,370（実データ）**。曲変更の利得を3〜10倍過小評価していた。

    モデルの裏取り（天地MASTER・係数164 を章別ボーナスに通した結果）:
      ch3 826.5% -> 69,125（実測 69,125・差0） / ch5 912.5% -> 75,530（実測 75,530・差0）
      ch4 927.0% -> 76,615（実測 76,685・差 −70。実ボーナスが 927.6% 前後）
    """
    with io.open(os.path.join(MUSIC_DIR, "musicScoreData.json"), encoding="utf-8") as f:
        sd = json.load(f)
    with io.open(os.path.join(MUSIC_DIR, "transformedMusics.json"), encoding="utf-8") as f:
        mu = json.load(f)
    ms = mu if isinstance(mu, list) else mu.get("musics", mu)
    bonus = BONUS[ch]
    out = []
    for m in ms:
        mid, er, mt = str(m.get("id")), m.get("event_rate"), m.get("music_time")
        if not m.get("published") or mid not in sd:
            continue
        if not isinstance(er, (int, float)) or not isinstance(mt, (int, float)):
            continue
        ent = sd[mid]
        if not isinstance(ent, dict):
            continue
        best = None
        for diff, e in ent.items():                 # 難易度は最良のものを採る
            if not isinstance(e, dict):
                continue
            s = auto_score(e, talent, lead, inner)
            if s is None:
                continue
            pt = live_pt(100 + s // 20000, er, bonus)
            if best is None or pt > best[0]:
                best = (pt, diff, s)
        if best:
            out.append({"song": m.get("title"), "difficulty": best[1], "cycle": mt + oh,
                        "perPlay": best[0], "coef": 100 + best[2] // 20000})
    # ⚠️ここで Pt/秒 の上位に絞ってはいけない。回数と時間の効き方が中間の局面では、
    #   Pt/秒 が中位の曲（月光・ガランド）が最適になる。絞り込みは
    #   「実際の残り回数と残り時間で総額を出したあと」に main 側でやる。
    out.sort(key=lambda p: -p["perPlay"] / p["cycle"])
    return out


def song_length(title):
    """曲長（秒）。周期の較正に使う。"""
    with io.open(os.path.join(MUSIC_DIR, "transformedMusics.json"), encoding="utf-8") as f:
        mu = json.load(f)
    ms = mu if isinstance(mu, list) else mu.get("musics", mu)
    for m in ms:
        if m.get("title") == title and isinstance(m.get("music_time"), (int, float)):
            return m["music_time"]
    return None


AUTO_TOL = 0.003        # オート1回ぶんの許容幅（比例）


def detect_unit(deltas, mys, default):
    """観測された増分からオート1回ぶんの単価を推定する。

    なぜ推定するか（2026-08-27）:
      オートの単価は固定だと思っていたが、**イベントボーナスが上がると動く**。
      8/26 の 75,530 が 8/27 未明に 75,600（+70）へ上がり、±3 Pt の固定幅で
      判定していた板が全区間「不明」に落ちた。周回でキャラランクが上がれば
      ボーナスは微増しうるので、単価は定数ではなく**その日の観測から取る**。

    やり方: マイセカイ（850の倍数）を除いた増分を候補単価 u で割り、
    「ほぼ整数倍」になる本数が最も多い u を採る。u は候補自身の 1/k から作る。
    """
    cand = set()
    for d in deltas:
        if d <= 0 or d % mys == 0:
            continue
        for k in range(1, 9):
            u = d / float(k)
            if default * 0.90 <= u <= default * 1.10:
                cand.add(round(u))
    best = (0, default)
    for u in sorted(cand):
        hits = 0
        for d in deltas:
            if d <= 0 or d % mys == 0:
                continue
            k = int(round(d / float(u)))
            if 1 <= k <= 12 and abs(d - k * u) <= u * AUTO_TOL * k:
                hits += 1
        if hits > best[0]:
            best = (hits, u)
    return best[1], best[0]


def solve(d, auto, mys, chal=None):
    """増分 d を「オート a 回 ＋ マイセカイ m 刻み（＋チャレライ 0/1回）」に分解する。

    ⚠️9〜12分刻みで見ると、マイセカイの回収とオートが同じ区間に入る。
      オート単体の格子だけで見ると、その区間まるごと「不明」に落ちてオートを取りこぼす。
    ⚠️オートの単価は日をまたいで動く（8/27 に +70）ので、**厳密な剰余では解けない**。
      オートぶんを引いた残りが 850 の倍数に「ほぼ」乗るかで見る。
    ⚠️チャレライ（1日1回・04:00リセット）は周回ともオートとも別式で、格子に乗らない。
      同じ区間にオートと同居すると1回ぶん落とすので、0回か1回を明示的に引いて試す。
      既定値は 8/27 02:06 の孤立窓で観測した 25,440（8/22 ch3 実測 24,840 の +2.4%）。
    返り値 (a, m, c)。説明できなければ None。
    """
    if d < 0:
        return None
    # ⚠️「オートa回＋マイセカイm刻み」を無差別に総当たりすると、a が3以上のとき許容幅が
    #   850/2 を超えて**どんな値でも説明できてしまう**。純オート → 純マイセカイ →
    #   混在、の順に、狭いほうから当てる。
    for c in ((0, 1) if chal else (0,)):
        d2 = d - c * (chal or 0)
        if d2 == 0 and c:
            return (0, 0, c)
        if d2 <= 0:
            continue
        a = int(round(d2 / float(auto)))                       # 純オート
        if 1 <= a <= 15 and abs(d2 - a * auto) <= auto * AUTO_TOL * a and d2 % mys != 0:
            return (a, 0, c)
        if d2 % mys == 0:                                      # 純マイセカイ
            return (0, d2 // mys, c)
        # 混在は**厳密一致だけ**を採る。
        # ⚠️ここに許容幅を入れると、説明できない増分を「オートN回＋マイセカイM刻み」に
        #   誤差ごと吸わせてしまう（2026-08-27 のバックテストで、8/26 09:36 の未分類
        #   +161,850 を誤差260Ptで「オート2回」と読み、申告91回に対し93回と答えた）。
        #   単価は detect_unit がその窓の実測から取っているので、本物なら誤差は出ない。
        #   説明できない増分は**説明できないと出す**。
        for a in range(1, 8):
            rest = d2 - a * auto
            if rest <= 0:
                break
            if rest % mys == 0:
                return (a, rest // mys, c)
    return None


def fetch(since_utc, who=RUNNER):
    sql = (
        "SELECT datetime(timestamp,'+9 hours'), score FROM border_snapshots "
        "WHERE event_id={ev} AND board_type='overall' AND user_name LIKE '%{who}%' "
        "AND timestamp >= '{ts}' ORDER BY timestamp;"
    ).format(ev=EVENT, who=who, ts=since_utc)
    remote = 'sqlite3 -readonly -separator "|" -cmd ".timeout 20000" {db} "{sql}"'.format(db=DB, sql=sql)
    r = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=25", "nas", remote],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    # ⚠️returncode 0 でも stdout が None になりうる（refit_border.py と同じ事故）
    if r.returncode != 0 or r.stdout is None:
        sys.exit("ssh失敗（rc={0}）: {1}".format(r.returncode, (r.stderr or "")[:200]))
    rows = []
    for line in r.stdout.strip().splitlines():
        if not line.strip():
            continue
        t, sc = line.split("|")
        rows.append((datetime.datetime.strptime(t, "%Y-%m-%d %H:%M:%S"), int(sc)))
    return rows


def hm(minutes):
    m = int(round(minutes))
    return "{0}時間{1:02d}分".format(m // 60, m % 60) if m >= 60 else "{0}分".format(m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="04:00", help="集計の起点 HH:MM（既定 04:00＝クォータのリセット）")
    ap.add_argument("--until", default="16:30", help="退勤時刻 HH:MM（既定 16:30）")
    ap.add_argument("--quota", type=int, default=99)
    ap.add_argument("--ch", type=int, default=5)
    ap.add_argument("--stall", type=float, default=25.0, help="この分数を超えて加算が無ければ停止とみなす")
    ap.add_argument("--song", default=AUTO_SONG, help="いまオートで回している曲（切り替えたら渡す）")
    ap.add_argument("--challenge", type=int, default=25440, help="チャレライ1回のPt。0で無効")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--name", default=RUNNER,
                    help="走者名の部分一致。⚠️章ごとに改名するので過去日を見るときは要指定")
    ap.add_argument("--day", help="YYYY-MM-DD。過去日でバックテストする用（既定は今日）")
    ap.add_argument("--now", help="HH:MM。--day と併用して『その時刻に見た場合』を再現する")
    a = ap.parse_args()

    if not a.name:
        sys.exit("走者名が空。環境変数 WL214_RUNNER_NAME か --name で渡すこと")
    lap, auto, mys = UNITS[a.ch]
    # 曲を切り替えたら1回ぶんの増分も変わる。分解に使う単位をそこに合わせる。
    # ⚠️天地は実測値（UNITS）を優先する。モデル値だと 35 Pt ずれて格子から落ちる。
    if a.song != AUTO_SONG:
        sel = [s for s in songs(a.ch) if s["song"] == a.song]
        if not sel:
            sys.exit("知らない曲: {0}".format(a.song))
        auto = sel[0]["perPlay"]
    now = datetime.datetime.now()
    if a.day:
        d0 = datetime.datetime.strptime(a.day, "%Y-%m-%d")
        nh, nm_ = map(int, (a.now or "23:59").split(":"))
        now = d0.replace(hour=nh, minute=nm_)
    # ⚠️日付は now から作る。固定値を置くと日を跨いだ瞬間に窓が消える
    sh, sm = map(int, a.since.split(":"))
    uh, um = map(int, a.until.split(":"))
    t_since = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
    if t_since > now:
        t_since -= datetime.timedelta(days=1)
    t_until = now.replace(hour=uh, minute=um, second=0, microsecond=0)

    rows = fetch((t_since - datetime.timedelta(hours=9, minutes=20)).strftime("%Y-%m-%dT%H:%M:%S"), a.name)
    rows = [r for r in rows if t_since - datetime.timedelta(minutes=20) <= r[0] <= now]
    if len(rows) < 2:
        sys.exit("スナップショットが足りない（{0}件）".format(len(rows)))

    # オートの単価はその日の観測から取り直す（8/27 に 75,530 -> 75,600 へ動いた）
    deltas = [s1 - s0 for (t0, s0), (t1, s1) in zip(rows, rows[1:])]
    if a.song == AUTO_SONG:
        det, hits = detect_unit([d for d in deltas if d < lap * 0.9], mys, auto)
        if hits >= 3 and abs(det - auto) <= auto * 0.05:
            auto = det

    n_auto = n_lap = n_mys = n_chal = 0
    unknown = []
    last_auto = None
    events = []
    for (t0, s0), (t1, s1) in zip(rows, rows[1:]):
        d = s1 - s0
        if d == 0:
            continue
        # 周回が混ざる区間（夕方）は先に周回として拾う。オート専用の時間帯では出ない。
        # ⚠️周回は1周の単価が±1%揺れるので格子で解けない。混在区間は「不明」に落ちる。
        #   この道具の担当は日中のオート窓で、夕方の分解は block_watch.py の仕事。
        # ⚠️マイセカイの 600,950 が「周回5」に化ける（§25 / block_watch.py と同じ罠）。
        #   850の倍数ぴったりで、かつ1周あたりが実測平均から1.2%超ずれるときはマイセカイを採る。
        #   2026-08-27 の 8/26 バックテストで実際に踏んだ（18:33 の 707刻みを5周と誤答した）。
        if d >= lap:
            k = int(round(d / float(lap)))
            dev = abs(d / float(k) - lap) / float(lap) if k else 1.0
            if k >= 1 and abs(d - k * lap) <= lap * 0.030 * k \
                    and not (d % mys == 0 and dev > 0.012):
                n_lap += k
                events.append((t1, "周回", k))
                continue
        got = solve(d, auto, mys, a.challenge or None)
        if got is None:
            unknown.append((t1, d))
            continue
        na, nm, nc = got
        if na:
            n_auto += na
            last_auto = t1
            events.append((t1, "オート", na))
        if nm:
            n_mys += nm
            events.append((t1, "マイセカイ", nm))
        n_chal += nc

    remain = max(0, a.quota - n_auto)
    t_rem = (t_until - now).total_seconds()
    since_last = (now - last_auto).total_seconds() / 60.0 if last_auto else None
    running = since_last is not None and since_last <= a.stall

    # 実測周期。⚠️「最初のオートから最後のオートまで ÷ 回数」で出してはいけない。
    #   就寝・昼休憩・勤務終わりの停止が全部混ざって、8/26 では 682秒/回（理論215秒）
    #   という無意味な値が出た。**連続して回っている区間だけ**から取る。
    # ⚠️「区間ごとの dt/k の中央値」も使わない。区間の切れ目で1回ぶん前後にずれるので、
    #   8/26 では 240秒 と出た（§35 の実測 223秒に対し +8%）。
    #   **連続稼働区間の総時間 ÷ 総回数**で出す。ずれが打ち消し合う。
    cyc = None
    seq = [(t, k) for t, kind, k in events if kind == "オート"]
    span = cnt = 0.0
    for (t0, _), (t1, k1) in zip(seq, seq[1:]):
        dt = (t1 - t0).total_seconds()
        if k1 and 0 < dt <= 25 * 60:          # 25分以上空いたら「止めていた」とみなす
            span += dt
            cnt += k1
    if cnt >= 10:
        cyc = span / cnt

    # 周期は実測のサイクルから OH を較正する（定数の 33秒 と 42.6秒 で食い違っていた）
    oh = OH_DEFAULT
    if cyc and a.song == AUTO_SONG:
        base_len = song_length(AUTO_SONG)
        if base_len and 0 <= cyc - base_len <= 90:
            oh = cyc - base_len
    plan = songs(a.ch, oh=oh)
    for p in plan:
        fits = int(t_rem // p["cycle"]) if t_rem > 0 else 0
        p["canDo"] = fits
        p["plays"] = min(remain, fits)
        p["total"] = p["plays"] * p["perPlay"]
        p["finishes"] = fits >= remain
    cur = [p for p in plan if p["song"] == a.song][0]
    best = max(plan, key=lambda p: p["total"])
    switch = best["song"] != cur["song"] and best["total"] > cur["total"]
    # 表示は「現行＋総額の上位」だけに絞る。707曲を並べても走者は選べない。
    plan.sort(key=lambda p: -p["total"])
    show = [cur] + [p for p in plan[:5] if p["song"] != cur["song"]]

    out = {
        "now": now.strftime("%Y-%m-%d %H:%M"),
        "autoDone": n_auto, "quota": a.quota, "autoRemain": remain,
        "song": a.song, "autoUnit": auto,
        "lapCount": n_lap, "mysekaiSteps": n_mys, "challengeLives": n_chal,
        "lastAutoAt": last_auto.strftime("%H:%M") if last_auto else None,
        "minutesSinceLastAuto": round(since_last, 1) if since_last is not None else None,
        "running": running,
        "measuredCycleSec": round(cyc, 1) if cyc else None,
        "minutesToClockOut": round(t_rem / 60.0, 1),
        "plan": show,
        "switchTo": best["song"] if switch else None,
        "switchGain": (best["total"] - cur["total"]) if switch else 0,
        "unknown": [[t.strftime("%H:%M"), d] for t, d in unknown],
    }
    if a.json:
        print(json.dumps(out, ensure_ascii=False))
        return

    print("=== オート監視 {0}（章{1}・起点 {2}・{3}） ==="
          .format(now.strftime("%m/%d %H:%M"), a.ch, a.since, a.song))
    print("消化 {0} / {1} 回（残り {2} 回）  周回 {3} 周  マイセカイ {4} 刻み  チャレライ {5} 回"
          .format(n_auto, a.quota, remain, n_lap, n_mys, n_chal))
    print("オート単価 {0:,}{1}".format(auto, "（実測から検出）" if auto != UNITS[a.ch][1] else ""))
    if last_auto:
        print("最後のオート {0}（{1:.0f}分前）  状態: {2}"
              .format(last_auto.strftime("%H:%M"), since_last, "稼働中" if running else "⚠️止まっている"))
    else:
        print("⚠️起点以降、オートの加算がまだ無い")
    if cyc:
        print("実測周期 {0:.0f}秒/回（連続稼働区間の中央値・曲長+OH={1:.0f}秒）".format(cyc, cur["cycle"]))
    if unknown:
        print("⚠️分解できない増分: " + ", ".join("{0} +{1:,}".format(t, d) for t, d in unknown))
    print("")
    if t_rem <= 0:
        print("退勤時刻({0})を過ぎている。".format(a.until))
        return
    print("{0} まで残り {1}。残り {2} 回の消化見込み:".format(a.until, hm(t_rem / 60.0), remain))
    for p in show:
        mark = "OK" if p["finishes"] else "不足{0}回".format(remain - p["canDo"])
        print("  {0:<11}{1:<7} {2:5.0f}秒/回  最大{3:3d}回 -> {4:2d}回 {5:>10} Pt  [{6}]"
              .format(p["song"][:11], p["difficulty"], p["cycle"], p["canDo"], p["plays"], "{0:,}".format(p["total"]), mark))
    print("")
    if switch:
        print("-> 打診: 「{0}」({1})へ切り替えると +{2:,} Pt ＝ 周回 {3:.1f} 周ぶん"
              .format(best["song"], best["difficulty"], out["switchGain"], out["switchGain"] / float(lap)))
    else:
        print("-> 曲の変更は不要（現行の{0}が最善）".format(cur["song"]))


if __name__ == "__main__":
    main()
