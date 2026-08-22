// ESLint の設定。依存（typescript-eslint / react-hooks / react-refresh）は
// 最初から package.json に入っていたのに、この設定ファイルだけが無く
// `npm run lint` が起動すらしていなかった（issue #5）。
//
// ★ 方針: **既存のコードを大量に書き換えないと通らない規則は入れない。**
//   lint が赤いまま放置されるくらいなら、緑で回り続ける方が価値がある。
//   厳しくするのは後からいつでもできる。
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // ★ 生成物は見ない。特に .vite（依存のプリバンドル）は他人が生成した
    //   ミニファイ済みコードで、放っておくとエラーの9割がここから出る。
    ignores: [
      "dist/**",
      "coverage/**",
      "public/**",
      ".vite/**",
      ".playwright-mcp/**",
      // 旧 vanilla 版の保管。参照用に置いてあるだけで保守対象ではない。
      "legacy/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // ★ 全角スペースは日本語の文章では正当な文字。既定のままだと
      //   コメント・文言・JSX のテキストで 2900 件以上エラーになる。
      //   コードの中に紛れ込んだものだけを見たいので、文章側は除外する。
      "no-irregular-whitespace": [
        "error",
        {
          skipStrings: true,
          skipComments: true,
          skipTemplates: true,
          skipJSXText: true,
          // 全角スペースを半角へ直す関数は、正規表現に全角スペースそのものが要る。
          skipRegExps: true,
        },
      ],
      /*
       * ★ react-hooks v7 の新しい規則（React Compiler 由来）は warn に落とす。
       *
       *   refs: `ref={s.stageRef}` のように、フックが返した ref を JSX へ渡す
       *         だけでも「レンダー中に ref を読んだ」と判定される。24件出るが
       *         どれも正当なコードで、通すには構造を組み替える必要がある。
       *   set-state-in-effect: 「データが来たら初期値を1回だけ決める」形。
       *         直すなら設計の変更で、lint を動かす作業とは別。
       *
       *   動いていてテストもあるコードを lint のために書き換えるのは順序が逆。
       *   赤で止めずに warn で見え続ける形にして、直すかどうかは別途決める（issue #5）。
       */
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // 先頭に _ を付けた引数は「意図的に使わない」の合図として認める。
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // ビルド時にだけ動く Node のスクリプト。ブラウザの globals は要らない。
    files: ["scripts/**/*.{js,mjs}", "*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright でページを検証するスクリプト。Node で動くが、
    // page.evaluate() に渡す関数の中身は**ブラウザ側で実行される**ので
    // document / getComputedStyle を参照する。両方の globals が要る。
    files: ["scripts/**/verify_*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  }
);
