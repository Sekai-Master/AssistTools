import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ActionButton } from "../../components/ui/ActionButton";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuTextarea } from "../../components/ui/NeuTextarea";
import { Segmented } from "../../components/ui/Segmented";
import {
  CONTACT_BODY_MAX,
  CONTACT_KINDS,
  CONTACT_REPLY_MAX,
  bodyProblem,
  charCount,
  replyLooksLikeAddress,
  type ContactKind,
} from "../../lib/contactRules";
import { useTheme } from "../../lib/theme";
import { ContactFallback } from "./ContactFallback";
import { useTurnstile } from "./useTurnstile";

type Failure = "input" | "verify" | "unavailable";
/** waiting は「押されたが確認（Turnstile）がまだ終わっていない」。token が来たら送る。 */
type Phase = "editing" | "waiting" | "sending" | "sent" | Failure;

const FAILURE_TEXT: Record<Failure, string> = {
  input: "入力に誤りがあります。内容（1〜2,000 字）と返信先（100 字まで）を確かめてください。",
  verify: "迷惑な送信を防ぐ確認に失敗しました。もう一度送るか、次の窓口からお願いします。",
  unavailable: "いまは送れません。時間をおいて送り直すか、次の窓口からお願いします。",
};

const KIND_OPTIONS = CONTACT_KINDS.map((k) => ({ value: k, label: k }));

/**
 * 送る前の説明。★ 事実だけ書く（「運営者だけが読みます」とは書かない。Claude も読む。レビュー 高-2）。
 * JSX の中で改行すると「。」のあとに空白が入るので、文字列で持つ。
 */
const BEFORE_SEND =
  "送った内容は、運営者の Google のアカウントに保存され、運営者と、運営者が使う AI のアシスタント（Claude）が読みます。" +
  "返信が要るときは返信先を書いてください。書いてもらったときは、こちらから連絡することがあります" +
  "（X の DM は、相手の設定によって送れないことがあります）。詳しくは";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function failureOf(status: number, data: unknown): Failure {
  if (status === 400 || status === 413) return "input";
  if (status === 403 && isRecord(data) && data.error === "verify") return "verify";
  return "unavailable";
}

/** 関数へ送る。成功は 200 かつ { ok: true } だけ。 */
async function postContact(payload: Record<string, string>): Promise<"ok" | Failure> {
  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok && isRecord(data) && data.ok === true) return "ok";
    return failureOf(res.status, data);
  } catch {
    return "unavailable";
  }
}

/**
 * 問い合わせの入力と送信。
 *
 * ★ 下書きを localStorage に残さない。残すとプライバシーポリシー第2項の台帳が増え、
 *   内容（個人の情報を含みうる）が端末に居残る。
 * ★ 送れなかったときは入力を消さない。代わりの窓口と「内容をコピー」を出す。
 */
export function ContactForm({ from }: { from: string }) {
  const { containerRef, status, token, activate, reset } = useTurnstile(useTheme());
  const [kind, setKind] = useState<ContactKind | "">("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [tried, setTried] = useState(false);
  const [phase, setPhase] = useState<Phase>("editing");
  const busy = useRef(false);
  const id = useId();

  const count = charCount(body.trim());
  const tooLong = count > CONTACT_BODY_MAX;
  const replyTooLong = charCount(reply.trim()) > CONTACT_REPLY_MAX;
  const replyOdd = reply.trim() !== "" && !replyTooLong && !replyLooksLikeAddress(reply);
  const turnstileFailed = status === "failed";
  // 確認の部品が落ちたら待つのをやめる（ボタンを「確認中」のまま止めない）
  const waiting = phase === "waiting" && !turnstileFailed;
  const inFlight = waiting || phase === "sending";
  const failure = phase === "input" || phase === "verify" || phase === "unavailable" ? phase : null;

  const send = useCallback(
    async (t: string) => {
      if (busy.current) return;
      busy.current = true;
      setPhase("sending");
      const result = await postContact({ kind, body, reply, page: from, ver: __APP_VERSION__, token: t });
      reset();
      busy.current = false;
      if (result !== "ok") return setPhase(result);
      setKind("");
      setBody("");
      setReply("");
      setTried(false);
      setPhase("sent");
    },
    [kind, body, reply, from, reset],
  );

  // 押したときに token が無かった（確認の途中・期限切れ）なら、届いた時点で送る
  useEffect(() => {
    if (waiting && token) void send(token);
  }, [waiting, token, send]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy.current || inFlight || turnstileFailed) return;
    setTried(true);
    if (!kind || bodyProblem(body) || replyTooLong) return;
    activate();
    if (token) void send(token);
    else setPhase("waiting");
  };

  /** 送れたあとに書き始めたら「受け付けました」を下げる。 */
  const edited = () => phase === "sent" && setPhase("editing");
  const copyText = [`種類: ${kind || "（未選択）"}`, `返信先: ${reply.trim() || "（なし）"}`, "", body.trim()].join("\n");

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      {/* ★ Turnstile を読み込むきっかけは、種類・内容・返信先に初めて触れたとき（キーボードで移ったときを含む）だけ。
          フォーム全体に付けると、説明の中のリンクや送るボタンでも読み込み、枠が広がって押した所がずれる（検分 高-1）。
          種類のボタンはクリックしてもフォーカスが移らないブラウザ（Safari）があるので、選んだときにも呼ぶ。 */}
      <div onFocus={activate} onInput={activate} className="space-y-4">
        <div className="space-y-2">
          <p id={`${id}-kind`} className="border-l-4 pl-2 text-sm font-bold text-slate-600" style={{ borderColor: "var(--unit-color)" }}>
            種類
          </p>
          <div role="group" aria-labelledby={`${id}-kind`}>
            <Segmented
              options={KIND_OPTIONS}
              value={kind}
              onChange={(v) => {
                activate();
                setKind(v as ContactKind);
                edited();
              }}
            />
          </div>
          {tried && !kind && <p className="text-xs font-bold text-rose-600">種類を選んでください</p>}
        </div>

        <Field label="内容" htmlFor={`${id}-body`}>
          <NeuTextarea
            id={`${id}-body`}
            rows={8}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              edited();
            }}
            aria-describedby={`${id}-count`}
            className="text-base"
          />
          <div className="flex justify-between gap-3 text-xs text-slate-500">
            <span className="font-bold text-rose-600">{tried && bodyProblem(body) === "empty" ? "内容を書いてください" : ""}</span>
            <span id={`${id}-count`} className={tooLong ? "font-bold text-rose-600" : "font-num"}>
              {`${count} / ${CONTACT_BODY_MAX}`}
            </span>
          </div>
        </Field>

        <Field label="返信先（任意）" htmlFor={`${id}-reply`} hint="X の ID（@ から）かメールアドレス。100 字まで">
          <NeuInput
            id={`${id}-reply`}
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              edited();
            }}
            autoComplete="off"
            className="text-base"
          />
          {replyOdd && <p className="text-xs text-amber-700">X の ID かメールアドレスの形ではないようです。このままでも送れます。</p>}
          {replyTooLong && <p className="text-xs font-bold text-rose-600">100 字までです</p>}
        </Field>
      </div>
      <p className="text-xs leading-6 text-slate-500">
        権利者の方は、所属の分かる連絡先（会社のドメインのメールなど）を返信先に書いてください。その連絡先に確かめてから、規約 第 3 条のとおり対応します。
      </p>

      <p className="text-sm leading-7 text-slate-600">
        {BEFORE_SEND}
        <Link to="/privacy" className="text-[color:var(--unit-color)] underline underline-offset-2">
          プライバシーポリシー
        </Link>
        。
      </p>

      {/* ★ Turnstile の枠は送るボタンのすぐ上。広がっても、上にある押せるもの（説明のリンク）は動かない。
          触れる前と失敗したときは枠を取らない。読み込み中は表示を出す（flexible の部品は高さ 65px）。 */}
      <div
        role="group"
        aria-label="迷惑な送信を防ぐ確認"
        className={status === "idle" || status === "failed" ? "hidden" : "min-h-[65px]"}
      >
        <div ref={containerRef} />
        {status === "loading" && <p className="text-xs leading-6 text-slate-500">確認の部品を読み込んでいます…</p>}
      </div>

      <ActionButton type="submit" disabled={inFlight || turnstileFailed || tooLong || replyTooLong}>
        {waiting ? "確認中…" : phase === "sending" ? "送っています…" : "送る"}
      </ActionButton>

      {phase === "sent" && (
        <p role="status" className="text-sm font-bold leading-7 text-slate-700">
          受け付けました。返信先を書いてもらったときは、こちらから連絡することがあります。
        </p>
      )}
      {failure ? (
        <ContactFallback message={FAILURE_TEXT[failure]} copyText={copyText} />
      ) : (
        turnstileFailed && (
          <ContactFallback
            message="確認の部品を読み込めませんでした。次の窓口から送ってください。書いた内容は下のボタンでコピーできます。"
            copyText={copyText}
          />
        )
      )}
    </form>
  );
}
