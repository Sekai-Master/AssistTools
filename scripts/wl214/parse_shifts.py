#!/usr/bin/env python3
"""支援シフトのスプレッドシートを shifts.json に変換する（支援者名は匿名化）。

なぜ必要か（2026-08-27 Nori 指示）:
  走者向けの走行レポートに「時間枠ごとの周回速度・時速・支援者と実効値」を載せる。
  周回が何時から何時まで回っていたかも、板の増分から推測するのではなく
  **シフト表という一次資料**で確定できる。実際、8/26 02:00 の増分 605,330 は
  「オート8回」とも「周回5周」とも読めて板だけでは決まらなかった。

⚠️**出力をこのリポジトリにコミットしない。** AssistTools は PUBLIC リポジトリで、
  public/ 配下はそのまま公開配信される。シフト表には数十人ぶんの第三者のハンドルが載っている。
  Nori は「支援者名は入れていい（管理とランナーの数人に見せるだけ・どのみちハンドル）」と
  判断しているが、それは**限定共有の話**であって全世界公開の許可ではない。
  → 既定の出力先は brain 側（非公開）。公開ページに載せるなら Artifact など
    リンクを知る人だけが見られる場所に置くこと。
  --anonymize を付けると匿名ID（S01, S02, …）に置き換える。公開リポジトリに置く必要が
  出たときはこちらを使う。

入力:
  Google Drive MCP の read_file_content が返した JSON（{"fileContent": "...markdown table..."}）。
  スプシは対話的にしか取れないので、**取得はセッションで1回だけ**やってこれに食わせる。

使い方:
    python parse_shifts.py <drive-dump.json> [--map names.json]
"""
import argparse
import io
import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.expanduser("~"), "brain", "log", "wl214-shifts.json")

DAY_RE = re.compile(r"(\d+)日目\s+(\d+)/(\d+)\(([月火水木金土日])\)")
SLOT_RE = re.compile(r"^(\d{1,2}):00\\?~(\d{1,2}):00$")


def cells(line):
    """markdown の行をセルに割る。先頭と末尾の空セルは落とす。"""
    parts = [c.strip() for c in line.split("|")]
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def demojibake(s):
    """UTF-8 を latin-1 として読んでしまった名前を復元する。

    実例（2026-08-27）: 支援者の `σοραð¢` は
    バイト列 F0 9F 9A A2（＝U+1F6A2 🚢）を1バイトずつ文字として読んだもの。正しくは `σορα🚢`。
    **感謝を伝えるページで名前が壊れているのは出せない。**

    ⚠️単純な `s.encode("latin-1").decode("utf-8")` では直らない。名前には
      ギリシャ文字（σορα）のように latin-1 に入らない文字が混ざっていて encode で落ちる。
      **256未満の文字だけを生バイトとして扱い、それ以外は UTF-8 に符号化してから**
      全体を UTF-8 として読み直す。
    """
    if not s:
        return s
    out = bytearray()
    for ch in s:
        if ord(ch) < 256:
            out.append(ord(ch))
        else:
            out.extend(ch.encode("utf-8"))
    try:
        return out.decode("utf-8")
    except UnicodeDecodeError:
        return s


def is_num(s):
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


def parse_roster(text):
    """名簿（お名前 / 先頭 / 内部 / 実効 / 総合力 / アンコ）を拾う。

    枠ごとの「計算上の単価」を出すのに総合力とアンコ可否が要る。
    シフト側の表には実効値しか無いので、こちらを正本にする。
    """
    out = {}
    for ln in text.splitlines():
        # ⚠️名簿の行は先頭に空列が2つある（|  | 名前 | 先頭 | 内部 | 実効 | 総合力 | アンコ |）。
        #   cells() は先頭の空を1つしか落とさないので、生の split から数える。
        c = [x.strip() for x in ln.split("|")]
        if len(c) < 8:
            continue
        name, lead, inner, eff, tal, enc = demojibake(c[2]), c[3], c[4], c[5], c[6], c[7]
        if not name or name == "お名前":
            continue
        if not (is_num(lead) and is_num(inner) and is_num(eff) and is_num(tal)):
            continue
        out.setdefault(name, {
            "name": name, "lead": float(lead), "inner": float(inner),
            "effective": float(eff), "talentMan": float(tal),
            "encore": enc.upper() == "TRUE",
        })
    return out


def parse(text):
    """1日ぶんずつ「名前の表」と「実効値の表」を拾って対応づける。

    レイアウト（1日ぶん・列は 0 始まりで cells() 後）:
        0 空き枠 / 1 提出数 / 2 ランナー / 3 時間帯 / 4 アンコ / 5,6,7 3枠 / 8 時間帯 / 9 待機
    名前の表のすぐ下に、同じ形で中身が実効値になった表がある。
    """
    lines = text.split("\n")
    heads = []
    for i, ln in enumerate(lines):
        m = DAY_RE.search(ln)
        if m and "merged" in ln and (not heads or heads[-1][0] < i - 3):
            heads.append((i, int(m.group(2)), int(m.group(3))))

    days = []
    for n, (start, mon, dom) in enumerate(heads):
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        rows_name, rows_val = {}, {}
        for ln in lines[start:end]:
            c = cells(ln)
            if len(c) < 8:
                continue
            m = SLOT_RE.match(c[3].replace(" ", ""))
            if not m:
                continue
            slot = "{0:02d}:00".format(int(m.group(1)))
            body = [c[4], c[5], c[6], c[7]]        # アンコ + 3枠
            if any(is_num(x) and x for x in body):
                rows_val[slot] = [float(x) if is_num(x) and x else None for x in body]
            elif any(x for x in body):
                rows_name[slot] = [demojibake(x) or None for x in body]
            else:
                rows_name.setdefault(slot, [None] * 4)
        days.append({"_line": start, "month": mon, "day": dom,
                     "names": rows_name, "values": rows_val})
    return days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dump")
    ap.add_argument("-o", "--out", default=OUT, help="出力先。既定は brain/log/（非公開）")
    ap.add_argument("--anonymize", action="store_true",
                    help="支援者を匿名ID（S01…）にする。公開リポジトリに置くときだけ使う")
    a = ap.parse_args()

    with io.open(a.dump, encoding="utf-8") as f:
        text = json.load(f)["fileContent"]
    days = parse(text)
    roster = parse_roster(text)

    ids, order = {}, []
    for d in days:
        for slot in sorted(d["names"]):
            for nm in d["names"][slot]:
                if nm and nm not in ids:
                    order.append(nm)
                    ids[nm] = "S{0:02d}".format(len(order)) if a.anonymize else nm

    out_days = []
    for d in days:
        slots = []
        for slot in sorted(set(list(d["names"]) + list(d["values"]))):
            nm = d["names"].get(slot, [None] * 4)
            vl = d["values"].get(slot, [None] * 4)
            filled = [i for i in range(4) if nm[i] or vl[i]]
            slots.append({
                "slot": slot,
                "supporters": [{"id": ids.get(nm[i]) if nm[i] else None,
                                "effective": vl[i]} for i in range(4)],
                "filled": len(filled),
                "effectiveSum": round(sum(v for v in vl if v), 1) if any(vl) else None,
            })
        out_days.append({"date": "2026-{0:02d}-{1:02d}".format(d["month"], d["day"]),
                         "sourceLine": d["_line"], "slots": slots})

    res = {
        "_readme": "支援シフト表から抽出。"
                   "slot は開始時刻（24:00〜28:00 は翌日の00:00〜04:00）。"
                   "supporters は [アンコール, 枠1, 枠2, 枠3] の順。",
        "supporterCount": len(order),
        "roster": [roster[n] for n in order if n in roster],
        "rosterMissing": [n for n in order if n not in roster],
        "days": out_days,
    }
    with io.open(a.out, "w", encoding="utf-8") as f:
        f.write(json.dumps(res, ensure_ascii=False, indent=1))
    print("書いた: {0}（支援者 {1}人 / {2}日ぶん / 実名{3}）".format(
        a.out, len(order), len(out_days), "なし" if a.anonymize else "あり ⚠️公開リポジトリに置かない"))
    print("  名簿と突合: {0}人ぶんの総合力あり / 名簿に無い {1}人 {2}".format(
        len(res["roster"]), len(res["rosterMissing"]), res["rosterMissing"][:6]))

    for d in out_days:
        act = [s for s in d["slots"] if s["filled"]]
        if act:
            print("  {0}  枠 {1}〜{2}  埋まり {3}/{4}".format(
                d["date"], act[0]["slot"], act[-1]["slot"], len(act), len(d["slots"])))
        else:
            print("  {0}  （枠なし）".format(d["date"]))


if __name__ == "__main__":
    main()
