/**
 * 入力欄の文字列を数値に読む。
 *
 * 入力欄は type="text" のままにしている。type="number" にすると
 * カンマ付きの貼り付けができなくなるため（ゲーム画面からコピーすると
 * カンマが混じる）。代わりにここでカンマを落とす。
 */
export function parseAmount(raw: string, allowDecimal = false): number {
  const cleaned = (raw ?? "").replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const value = allowDecimal ? parseFloat(cleaned) : parseInt(cleaned, 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 目標ポイントの下位桁補完。
 *
 * 9桁のポイントを毎回打つのは負担が大きいので、下の桁だけ入力すると
 * 上の桁を現在ポイントから補う。「311005」→「128,311,005」のように働く。
 *
 * 入力桁数が現在ポイントの桁数より少ないときだけ発火する。
 * フル桁で入力した場合は原理的に発火しないので、意図した値が
 * 勝手に書き換わることはない。
 *
 * 補完しない場合は null を返す。
 */
export function completeTargetSuffix(currentRaw: string, targetRaw: string): string | null {
  if (!targetRaw || !currentRaw) return null;

  const curVal = parseInt(currentRaw.replace(/,/g, ""), 10);
  if (!Number.isFinite(curVal)) return null;

  const curStr = curVal.toString();
  const inputStr = targetRaw.replace(/,/g, "");
  if (inputStr.length >= curStr.length) return null;

  const suffixVal = parseInt(inputStr, 10);
  if (!Number.isFinite(suffixVal)) return null;

  const mod = Math.pow(10, inputStr.length);
  const upper = Math.floor(curVal / mod);
  let candidate = upper * mod + suffixVal;
  // 補完した結果が現在ポイント以下なら、次の桁上がりを採る
  if (candidate <= curVal) candidate = (upper + 1) * mod + suffixVal;

  return candidate.toString();
}
