import { describe, expect, it, vi } from "vitest";
import { announceText, loadRoute, ROUTE_LOADERS, routeTitle } from "./routes";
import { READY_TOOLS, TOOL_CATEGORIES, TOOLS, toolsByCategory, unitOf } from "../tools";

describe("ROUTE_LOADERS", () => {
  // lazyOf は loadRoute(path)! と非 null assertion を使っているので、
  // loader の付け忘れは実行時クラッシュになる。ここで CI 側に落とす。
  it("遅延ロードするツールの path はすべて loader を持つ", () => {
    const lazyPaths = READY_TOOLS.map((t) => t.path).filter((p) => p !== "/settings");
    for (const path of lazyPaths) {
      expect(ROUTE_LOADERS, `${path} の loader が無い`).toHaveProperty(path);
    }
  });

  it("loader のキーはすべて実在するツールの path", () => {
    const known = new Set(TOOLS.map((t) => t.path));
    for (const path of Object.keys(ROUTE_LOADERS)) {
      expect(known, `${path} は TOOLS に無い`).toContain(path);
    }
  });
});

describe("loadRoute", () => {
  it("同じパスは1回しか import しない（先読みと lazy で二重ロードしない）", async () => {
    const loader = vi.fn(async () => ({ default: () => null }));
    const loaders = { "/x": loader };
    const a = loadRoute("/x", loaders);
    const b = loadRoute("/x", loaders);
    await a;
    expect(a).toBe(b);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("未登録のパスは undefined（/ や /settings は先読み対象外）", () => {
    expect(loadRoute("/settings", {})).toBeUndefined();
  });

  // ★ このテストは「自前キャッシュが reject を握り続けないこと」だけを見ている。
  //   loader をモックしているのでブラウザの module map を通らず、実ブラウザでの
  //   再試行可能性は保証しない（実際、実ブラウザでは再試行できない。routes.ts の
  //   コメント参照）。テスト名でその範囲を明示しておく。
  it("失敗しても自前キャッシュに reject を残さない（実ブラウザでの再試行可否とは別）", async () => {
    let attempt = 0;
    const loader = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("MIME type mismatch");
      return { default: () => null };
    });
    const loaders = { "/y": loader };

    await expect(loadRoute("/y", loaders)).rejects.toThrow();
    // reject の catch ハンドラが走るのを待ってから再試行する。
    await Promise.resolve();
    await expect(loadRoute("/y", loaders)).resolves.toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("routeTitle", () => {
  it("ハブと設定は専用の名前", () => {
    expect(routeTitle("/")).toBe("ツール一覧");
    expect(routeTitle("/settings")).toBe("設定");
  });

  // ツールを増やしたときに読み上げ漏れが出ないことを保証する。
  it("全ツールの path が名前を返す", () => {
    for (const tool of TOOLS) {
      expect(routeTitle(tool.path)).toBe(tool.name);
    }
  });

  it("未知のパスでも空にならない", () => {
    expect(routeTitle("/nope")).toBe("ページ");
  });
});

describe("announceText", () => {
  it("到着はページ名を含む", () => {
    expect(announceText("arrived", "/evc")).toContain("スキル実効値計算機");
  });

  it("読み込み中・失敗は状態を伝える", () => {
    expect(announceText("loading", "/evc")).toBe("読み込み中");
    expect(announceText("failed", "/evc")).toContain("失敗");
  });
});

/**
 * ★ 色の出どころは登録簿ひとつ（tools.ts の category → TOOL_CATEGORIES.unit）。
 *   ページ側で色を書くと、仕分けを変えたときに片方だけ古くなる。
 */
describe("仕分けと色", () => {
  it("すべてのツールが実在するカテゴリに属する", () => {
    const ids = new Set(TOOL_CATEGORIES.map((c) => c.id));
    for (const t of TOOLS) expect(ids, `${t.id} の仕分けが無い`).toContain(t.category);
  });

  it("どのカテゴリも空ではない（見出しだけが出るのを防ぐ）", () => {
    for (const c of TOOL_CATEGORIES) {
      expect(TOOLS.some((t) => t.category === c.id), `${c.label} が空`).toBe(true);
    }
  });

  it("ツールの色はカテゴリの色（ツール個別の色を持たない）", () => {
    for (const t of TOOLS) {
      const cat = TOOL_CATEGORIES.find((c) => c.id === t.category)!;
      expect(unitOf(t.id)).toBe(cat.unit);
    }
  });

  it("知らない id なら既定色（落ちない）", () => {
    expect(unitOf("nope")).toBe("vs");
  });

  it("TOP に出る並びは登録簿の全ツールを1回ずつ含む", () => {
    const listed = toolsByCategory().flatMap((g) => g.tools.map((t) => t.id));
    expect(listed.slice().sort()).toEqual(TOOLS.map((t) => t.id).sort());
  });
});
