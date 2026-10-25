-- イベントの素材名（bonuses.json の asset）。終了直後に歴代の表へ足すとき（finals.ts）、
-- Memories の判定（素材名 event_memories_<ユニット>_<年>）とロゴに使う。2026-10-25
ALTER TABLE events ADD COLUMN asset TEXT;
