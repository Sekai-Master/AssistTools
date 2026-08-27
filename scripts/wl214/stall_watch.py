#!/usr/bin/env python3
"""オートが止まったら1行吐く。止まっている間は黙る。Monitor から回す用。

なぜ cron ではなく Monitor か（2026-08-27 Nori 依頼）:
  「15分おきに確認して、止まってたら通知」。定時で毎回鳴らすとうるさく、
  鳴らない回に「見ているのか止まっているのか」が分からない。
  **状態が変わった瞬間だけ**出力する（稼働→停止、停止→再開）。

読むもの: NAS の板ログ `~/wl214/live-YYYYMMDD.log`（3分刻み）。
  ⚠️borders.db は 9〜12分刻みなので、15分の停止を見るには粗い。板のほうを見る。
  ⚠️ログのファイル名はプロセス起動時の日付で固定される（日付を跨いでも切り替わらない）ので、
    **その日のぶんと前日ぶんの両方**を見て、新しいほうを採る。

使い方:
    python stall_watch.py --stall 15 --every 300 --from 09:00 --to 20:00
"""
import argparse
import datetime
import subprocess
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def tail_board(lines=40):
    """板ログの末尾を (時刻, 順位, スコア) のリストで返す。取れなければ空。"""
    # ⚠️連結してから tail してはいけない。ls -t は新しい順なので、連結の末尾は
    #   **古いファイルの末尾**になる。実際それで前日 02:51 の行を「最新」と読んだ。
    #   ファイルごとに tail して、時刻でのソートは呼び出し側に任せる。
    cmd = ("for f in $(ls -t ~/wl214/live-*.log 2>/dev/null | head -2); do "
           "tail -%d \"$f\"; done" % lines)
    try:
        r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "nas", cmd],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=60)
    except Exception:
        return []
    if r.returncode != 0 or not r.stdout:
        return []
    out = []
    for ln in r.stdout.splitlines():
        p = ln.split("\t")
        if len(p) < 3:
            continue
        try:
            t = datetime.datetime.strptime(p[0].strip(), "%Y-%m-%d %H:%M")
            out.append((t, int(p[1]), int(p[2])))
        except ValueError:
            continue
    out.sort()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stall", type=float, default=15.0, help="この分数を超えて増えなければ停止とみなす")
    ap.add_argument("--every", type=float, default=300.0, help="見にいく間隔（秒）")
    ap.add_argument("--from", dest="t_from", default="09:00", help="監視する時間帯の開始")
    ap.add_argument("--to", dest="t_to", default="20:00", help="監視する時間帯の終わり")
    a = ap.parse_args()

    fh, fm = map(int, a.t_from.split(":"))
    th, tm = map(int, a.t_to.split(":"))
    state = None          # None / "run" / "stop"
    fails = 0
    print("停止監視を開始（%s〜%s・%.0f分止まったら鳴らす）" % (a.t_from, a.t_to, a.stall))

    while True:
        now = datetime.datetime.now()
        end = now.replace(hour=th, minute=tm, second=0, microsecond=0)
        if now >= end:
            print("監視終了（%s を過ぎた）" % a.t_to)
            return
        if now < now.replace(hour=fh, minute=fm, second=0, microsecond=0):
            time.sleep(a.every)
            continue

        rows = tail_board()
        if not rows:
            fails += 1
            # ⚠️1回の ssh 失敗で鳴らさない。3回続いたら「見えていない」ことを知らせる。
            #   黙って見えなくなるのが一番まずい。
            if fails == 3:
                print("⚠️板が3回続けて読めない。監視が効いていない可能性がある")
            time.sleep(a.every)
            continue
        fails = 0

        last_up = None
        for (t0, _, s0), (t1, _, s1) in zip(rows, rows[1:]):
            if s1 > s0:
                last_up = t1
        if last_up is None:
            last_up = rows[0][0]
        idle = (rows[-1][0] - last_up).total_seconds() / 60.0
        cur = rows[-1][2]
        new = "stop" if idle >= a.stall else "run"

        # 状態が変わった瞬間だけ出す
        if new != state:
            if new == "stop":
                print("⚠️オートが止まっています。最後の加算 %s（%.0f分前）／ 現在 %s Pt"
                      % (last_up.strftime("%H:%M"), idle, format(cur, ",")))
            elif state is not None:
                print("オート再開を確認（%s ／ %s Pt）"
                      % (last_up.strftime("%H:%M"), format(cur, ",")))
            state = new
        time.sleep(a.every)


if __name__ == "__main__":
    main()
