import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    /*
     * 既定の5秒だと、組み合わせ探索のテストが CI で時間切れになる。
     *
     * アナライザーの探索系は手元でも数秒かかる（dynamicReserve は CI で24秒）。
     * CI ランナーは手元より遅いうえ、テストファイルが増えるほど並列で CPU を
     * 取り合うので、「手元では通るが CI でだけ落ちる」「増やした瞬間に別の
     * テストが落ちる」という形で出る。実際そうなった。
     *
     * 遅いこと自体は探索の中身が重いからで、テストの書き方の問題ではない。
     * 上限は残す（本当に止まったものを見逃さないため）が、実測に見合う値にする。
     */
    testTimeout: 30_000,
  },
})
