/**
 * 状態機械と実世界の橋渡し。唯一の不純な層で、決定はしない（翻訳だけ）。
 * 「いつ何をするか」は machine.ts が全部決めていて、ここは effects を
 * setTimeout / startTransition / scrollTo / focus に置き換えるだけ。
 */
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigationType, type Location } from "react-router-dom";
import { flushStyles, markDivisions } from "./divisions";
import { initialState, reduce, stageAttrs, type StageEvent, type StageState } from "./machine";
import { resolvePlan, stageVars } from "./plan";
import { announceText, prefetchRoute } from "./routes";
import { createScrollMemory } from "./scrollMemory";
import { useMotionSetting } from "./settingsStore";
import { useReducedMotion, useTouchOnly } from "./environment";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function useRouteStage() {
  const location = useLocation();
  const navType = useNavigationType();
  const setting = useMotionSetting();
  const osReduce = useReducedMotion();
  const touchOnly = useTouchOnly();
  const plan = useMemo(
    () => resolvePlan(setting, { osReduce, touchOnly }),
    [setting, osReduce, touchOnly]
  );

  /** 実際に描画する location。URL より遅れて進む（沈んでいる間は前のページのまま）。 */
  const [shown, setShown] = useState<Location>(location);
  const [state, setState] = useState<StageState>(() =>
    initialState(location.key, location.pathname)
  );
  const [live, setLive] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef(state);
  const planRef = useRef(plan);
  const targetRef = useRef(location);
  const timers = useRef<number[]>([]);
  const sendRef = useRef<(e: StageEvent) => void>(() => {});
  const liveSeq = useRef(0);
  const scroll = useRef(createScrollMemory());

  // render 中に ref を書き換えないよう effect で同期する。send はイベント
  // ハンドラ・効果・タイマーからしか呼ばれないので、これで十分に新しい。
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const send = useCallback((event: StageEvent) => {
    const { state: next, effects } = reduce(stateRef.current, event, planRef.current);
    stateRef.current = next;
    setState(next);

    for (const eff of effects) {
      switch (eff.type) {
        case "cancelTimers":
          timers.current.forEach(clearTimeout);
          timers.current = [];
          break;
        case "timer":
          timers.current.push(
            window.setTimeout(
              () => sendRef.current({ type: "TIMER", kind: eff.kind, at: now() }),
              eff.after
            )
          );
          break;
        case "prefetch": {
          const key = targetRef.current.key;
          void prefetchRoute(eff.path)?.then((ok) => {
            if (!ok) sendRef.current({ type: "FAILED", key, at: now() });
          });
          break;
        }
        case "saveScroll":
          scroll.current.save(eff.key, window.scrollY);
          break;
        case "commit":
          // ★ 二重チラつき対策の中核。
          //   既に中身を持つ Suspense 境界に対する transition 内の更新では、
          //   React は fallback へ切り替えず前の木を保持したまま待つ。
          //   よって「無地 → 読み込み中… → 無地」が構造的に発生しない。
          //   浮上のトリガーは時間ではなく「新しい木が実際に commit された瞬間」
          //   （下の READY）なので、チャンクが遅ければ無地のまま待つだけになる。
          startTransition(() => setShown(targetRef.current));
          break;
        case "restoreScroll":
          window.scrollTo(0, eff.pop ? scroll.current.restore(eff.key) : 0);
          break;
        case "markDivisions": {
          // ディビジョンが1つも取れないページ（＝中身が空）では、ステージごと
          // フェードする従来の振り付けに落ちる。CSS 側は html[data-divs] で分岐する。
          const stage = stageRef.current;
          const count = stage ? markDivisions(stage) : 0;
          // ★ 属性 → スタイル確定 の順。逆にすると開始値が「印の無い状態」で
          //   確定してしまい、浮上のカスケードが丸ごと効かない。
          document.documentElement.dataset.divs = count > 0 ? "on" : "off";
          if (eff.flush && stage) flushStyles(stage);
          break;
        }
        case "focusStage":
          // preventScroll で自前のスクロール制御と競合させない。
          stageRef.current?.focus({ preventScroll: true });
          break;
        case "announce":
          // 同じ文字列を再セットしても DOM が変わらず読み上げられないので、
          // 交互に ZWSP を足して必ず差分を作る。
          liveSeq.current += 1;
          setLive(announceText(eff.kind, eff.path) + (liveSeq.current % 2 ? "​" : ""));
          break;
      }
    }
  }, []);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // URL 変化 → NAVIGATE
  useEffect(() => {
    if (location.key === stateRef.current.targetKey) return;
    targetRef.current = location;
    send({
      type: "NAVIGATE",
      key: location.key,
      path: location.pathname,
      pop: navType === "POP",
      at: now(),
    });
  }, [location, navType, send]);

  // transition が commit された＝lazy チャンク解決済み → READY
  useEffect(() => {
    send({ type: "READY", key: shown.key, at: now() });
  }, [shown, send]);

  // ★ ref.current を effect の実行時ではなく後始末の時点で読むこと。
  //   マウント時の配列を掎むと、cancelTimers 後に張り直されたタイマー
  //   （timers.current が別の配列に差し替わる）が1本も片付かない。
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const attrs = stageAttrs(state, plan);

  // ★ --neu-lift は html 上で動かす。--shadow-neu は @theme により :root に
  //   宣言されるので、子孫で --neu-lift を変えても var() は既に置換済みで
  //   追随しない（＝パネルの影は据え置きで中のボタンだけ平ら、という真逆の絵になる）。
  //   html 上なら :root の --shadow-neu 自体が再計算され、コンポーネントクラスと
  //   ユーティリティの両系統が同時に沈む。
  // plan は resolvePlan がモジュール定数を返すので参照が安定している。
  // 毎レンダー新しい object を作らないよう、ここで1回だけ畳んでおく。
  const vars = useMemo(() => stageVars(plan), [plan]);
  useLayoutEffect(() => {
    const el = document.documentElement;
    el.dataset.motion = attrs.motion;
    el.dataset.stage = attrs.stage;
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  }, [attrs.motion, attrs.stage, vars]);

  const preview = useCallback(() => send({ type: "PREVIEW", at: now() }), [send]);

  return { state, plan, attrs, shown, live, stageRef, preview };
}
