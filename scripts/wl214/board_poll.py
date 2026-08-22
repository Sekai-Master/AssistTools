#!/usr/bin/env python3
"""章ランキング板を高頻度ポーリングして、指定プレイヤーの (時刻, 順位, 章Pt) を CSV に落とす。

使い方:  board_poll.py <名前の前方一致> <出力CSV> [終了時刻 HH:MM]
例:      board_poll.py "プレイヤー名の前方一致" ch3_poll.csv 04:06

- 板の実体は約3分刻み・タイムスタンプは実時刻から約+125秒ずれて刻印される（2026-08-22 校正）
- 名前はコマンドライン引数でのみ渡す。このリポジトリに走者名を書かないこと
- 失敗は <出力CSV>.err に残る。終わったら必ず hits と .err を確認すること
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

def log_problem(msg):
    """失敗を握り潰さずサイドカーに残し、続いたら標準出力にも上げる。

    2026-08-22、Win から叩いたら 403 が返り続けたのに except: pass のせいで
    空のCSVを吐き続け、終了時刻まで誰も気づけない状態になった。無音の失敗は
    「データが無い」ではなく「観測できていない」なので、必ず見えるところに出す。
    """
    stamp = datetime.datetime.now().strftime('%H:%M:%S')
    with open(out + '.err', 'a', encoding='utf-8') as e:
        print(stamp, msg, file=e)


polls = hits = fails = misses = 0
while end_t is None or datetime.datetime.now() < end_t:
    polls += 1
    try:
        req = urllib.request.Request('https://api.sekai.best/event/live_latest_chapter',
                                      headers={'User-Agent': 'sekaimaster-assist/1.0'})
        with urllib.request.urlopen(req, timeout=25) as r:
            d = json.load(r)
        rows = d.get('data', d).get('eventRankings', [])
        if not rows:
            log_problem('eventRankings が空')
        found = False
        for row in rows:
            if str(row.get('userName', '')).startswith(name):
                w.writerow([datetime.datetime.now().strftime('%H:%M:%S'),
                            row.get('timestamp', ''), row.get('rank', ''), row.get('score', '')])
                f.flush()
                hits += 1
                found = True
                break
        if not found:
            misses += 1
            log_problem('名前が板に無い（rows=%d）' % len(rows))
            if misses in (3, 10, 30):
                print('WARN: %d 回続けて名前が板に見つからない。'
                      '章が替わって改名した／圏外に落ちた可能性' % misses, flush=True)
        else:
            misses = 0
        fails = 0
    except Exception as ex:
        fails += 1
        log_problem('%s: %s' % (type(ex).__name__, ex))
        if fails in (3, 10, 30):
            print('WARN: %d 回連続で取得に失敗（%s）。'
                  '%s.err を見ること' % (fails, type(ex).__name__, out), flush=True)
    time.sleep(60)

print('POLL DONE polls=%d hits=%d fails=%d' % (polls, hits, fails), flush=True)
if hits == 0:
    print('⚠️ 1件も取れていない。名前の前方一致・UA・章の指定を疑うこと', flush=True)
