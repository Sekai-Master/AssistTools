/**
 * スタンプ早見表。正本は docs/guide/stamps.md。
 *
 * - 表の「スタンプ」の列には `stamp0014` のような asset 名だけを書く。同じ使い方のスタンプは半角の空白で
 *   区切って 1 つのセルに並べる（`stamp0014 stamp0383`）。ページはそれぞれを public/guide/stamps/<asset>.webp の
 *   絵に置き換えて、横に並べて出す
 * - 絵の alt は manifest.json の name から先頭の「[スタンプ]」「[テキストスタンプ]」を外したもの
 * - 絵の出どころは public/guide/stamps/README.md（manifest.json も同じ場所）
 */
import manifest from "../../../../public/guide/stamps/manifest.json";
import type { GuideBlock, GuideInline } from "./guide";

export interface StampInfo {
  asset: string;
  name: string;
  alt: string;
}

export const STAMP_ASSET_RE = /^stamp\d{4}$/;

/** 「[スタンプ]穂波：ごめん…行くね」→「穂波：ごめん…行くね」。 */
export const stampAlt = (name: string) => name.replace(/^\[[^\]]*\]\s*/, "").trim();

export const STAMPS: ReadonlyMap<string, StampInfo> = new Map(
  (manifest.stamps as { asset: string; name: string }[]).map((s) => [
    s.asset,
    { asset: s.asset, name: s.name, alt: stampAlt(s.name) },
  ]),
);

/** img の src。 */
export const stampSrc = (base: string, asset: string) => `${base}guide/stamps/${asset}.webp`;

function withStamps(xs: GuideInline[], problems: string[]): GuideInline[] {
  return xs.flatMap((x): GuideInline[] => {
    if (x.kind !== "text" && x.kind !== "code") return [x];
    const names = x.text.trim().split(/\s+/);
    if (!names.every((t) => STAMP_ASSET_RE.test(t))) return [x];
    return names.map((t): GuideInline => {
      const info = STAMPS.get(t);
      if (!info) problems.push(`${t} が manifest.json に無い`);
      return { kind: "stamp", asset: t, alt: info?.alt ?? t };
    });
  });
}

/** 早見表の本文のうち、表のセルの asset 名を絵にする。 */
export function stampTableBlocks(blocks: GuideBlock[], problems: string[]): GuideBlock[] {
  return blocks.map((b) =>
    b.kind === "table" ? { ...b, rows: b.rows.map((r) => r.map((c) => withStamps(c, problems))) } : b,
  );
}

/** 早見表に出る asset 名（テストで public/guide/stamps/ と照合する）。 */
export function stampAssetsOf(blocks: GuideBlock[]): string[] {
  return blocks.flatMap((b) =>
    b.kind === "table" ? b.rows.flatMap((r) => r.flatMap((c) => c.flatMap((x) => (x.kind === "stamp" ? [x.asset] : [])))) : [],
  );
}
