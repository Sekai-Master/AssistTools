/**
 * 点数時速と周回ペースの相互変換。
 *
 * ── なぜ3つあるか ────────────────────────────────────────────
 * 「時速(pt/時)」は実測でしか出ない値だが、**測り方が人によって違う**。
 *
 *   1. まとめて測る    … 「1時間回して 50万pt だった」
 *   2. 1回から積む     … 「1回 18,000pt で、1時間に28回まわせる」
 *   3. ペースを知りたい … 「時速50万で1回18,000pt なら、何周してる計算？」
 *
 * 3 は 2 の逆。周回ペースは体感で入れづらい（「1時間に何回」を数えている人は少ない）
 * ので、測りやすい2つから逆算できる口を用意する。
 *
 * ── 焚き数について ──────────────────────────────────────────
 * 1回の獲得ptも時速も**焚き数に比例する**が、周回ペース（回/時）は焚き数に依らない。
 * そのため 2・3 では「1回の獲得pt と 時速 が同じ焚き数で測られている」ことだけが条件で、
 * その焚き数が何であっても比は変わらない。
 *
 * ★ 割り算の結果は呼び出し側で丸める。ここで丸めると、往復させたときに
 *   じわじわずれる（時速→ペース→時速 で元に戻らなくなる）。
 */

/** 入力が計算に使えるか。0 と NaN と負数を弾く。 */
const usable = (n: number) => Number.isFinite(n) && n > 0;

/**
 * まとめて測った実績から時速を出す。
 *
 * @param points 稼いだイベントポイント
 * @param minutes かかった時間(分)
 * @returns pt/時。測れないときは null（**0 を返さない** ── 0 は「時速0」と
 *          区別がつかず、そのまま設定されると計算が全部 0 になる）
 */
export function rateFromRun(points: number, minutes: number): number | null {
  if (!usable(points) || !usable(minutes)) return null;
  // ★ 掛けてから割る。`(points / minutes) * 60` だと 500000/60 が割り切れず
  //   500000.00000000006 が返る（calcLivePt にも同じ理由のコメントがある）。
  return (points * 60) / minutes;
}

/**
 * 1回の獲得ptと周回ペースから時速を出す。
 *
 * @param perPlay 1回（1プレイ）の獲得イベントポイント
 * @param playsPerHour 周回ペース(回/時)
 */
export function rateFromPerPlay(perPlay: number, playsPerHour: number): number | null {
  if (!usable(perPlay) || !usable(playsPerHour)) return null;
  return perPlay * playsPerHour;
}

/**
 * 時速と1回の獲得ptから周回ペースを逆算する。
 *
 * ★ 2つが**同じ焚き数で測られている**ことが前提。片方だけ別の焚き数だと、
 *   焚き数の倍率比のぶんだけペースが実際より大きく（小さく）出る。
 *
 * @param hourlyRate pt/時
 * @param perPlay 1回の獲得イベントポイント
 * @returns 回/時
 */
export function paceFromRate(hourlyRate: number, perPlay: number): number | null {
  if (!usable(hourlyRate) || !usable(perPlay)) return null;
  return hourlyRate / perPlay;
}
