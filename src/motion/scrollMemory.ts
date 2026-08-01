/**
 * セッション限りのスクロール記憶。location.key ごとに保持する。
 *
 * react-router v7 はスクロールを復元しないので自前で持つ。DOM は触らない
 * （＝純粋）ので node 環境のテストで守れる。
 */
export interface ScrollMemory {
  save(key: string, y: number): void;
  restore(key: string): number;
  size(): number;
}

export function createScrollMemory(limit = 50): ScrollMemory {
  // Map は挿入順を保つので、上限超過時は先頭＝最も古いものから捨てる。
  const map = new Map<string, number>();
  return {
    save(key, y) {
      map.delete(key); // 再挿入して最新扱いにする
      map.set(key, y);
      while (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    restore(key) {
      return map.get(key) ?? 0;
    },
    size: () => map.size,
  };
}
