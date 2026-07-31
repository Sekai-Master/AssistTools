import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * ルート描画中の例外を受け止める。
 *
 * netlify.toml は SPA フォールバック（未知パスを index.html へ 200 で返す）なので、
 * タブを開いたまま再デプロイされると、古いハッシュのチャンク要求に JS ではなく
 * HTML が 200 で返り、import() が MIME エラーで reject する
 * （Vite + SPA ホスティングの定番事故）。
 * 遷移演出を被せた状態でこれが起きると「無地のまま永久に待つ」になり、失敗が
 * 成功と見分けられなくなるので、必ず見える形にする。
 *
 * resetKey（pathname）が変わったら状態を捨てる。失敗したページから別ページへ
 * 逃げられるようにするため。
 */
interface Props {
  resetKey: string;
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  failed: boolean;
  seenKey: string;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, seenKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.seenKey) {
      return { failed: false, seenKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 握り潰さない。失敗は検知可能にしておく。
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
