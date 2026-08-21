#!/usr/bin/env python3
"""章ランキング板を高頻度ポーリングして、指定プレイヤーの (時刻, 順位, 章Pt) を CSV に落とす。

使い方:  board_poll.py <名前の前方一致> <出力CSV> [終了時刻 HH:MM]
例:      board_poll.py "プレイヤー名の前方一致" ch3_poll.csv 04:06

- 板の実体は約3分刻み・タイムスタンプは実時刻から約+125秒ずれて刻印される（2026-08-22 校正）
- 名前はコマンドライン引数でのみ渡す。このリポジトリに走者名を書かないこと
- macOS でスリープを防ぐには `caffeinate -i board_poll.py ...` で起動する。
  Windows は電源設定でスリープを切るか `powercfg /change standby-timeout-ac 0`
"""
import csv, datetime, json, os, sys, time, urllib.request

name = sys.argv[1]
out  = sys.argv[2]
end  = sys.argv[3] if len(sys.argv) > 3 else None
end_t = None
if end:
    h, m = map(int, end.split(':'))
    now = datetime.datetime.now()
    end_t = now.replace(hour=h, minute=m, second=0)
    if end_t <= now:
        end_t += datetime.timedelta(days=1)

new = not os.path.exists(out)
f = open(out, 'a', newline='')
w = csv.writer(f)
if new:
    w.writerow(['local_ts', 'upstream_ts', 'rank', 'score'])
    f.flush()

while end_t is None or datetime.datetime.now() < end_t:
    try:
        req = urllib.request.Request('https://api.sekai.best/event/live_latest_chapter',
                                      headers={'User-Agent': 'sekaimaster-assist/1.0'})
        with urllib.request.urlopen(req, timeout=25) as r:
            d = json.load(r)
        for row in d.get('data', d).get('eventRankings', []):
            if str(row.get('userName', '')).startswith(name):
                w.writerow([datetime.datetime.now().strftime('%H:%M:%S'),
                            row.get('timestamp', ''), row.get('rank', ''), row.get('score', '')])
                f.flush()
                break
    except Exception:
        pass
    time.sleep(60)
print('POLL DONE')
