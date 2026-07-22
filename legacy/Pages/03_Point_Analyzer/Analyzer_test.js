function calculateEventPoint(score, eventBonus, basePoint = 100, liveBonusIndex = 0) {
  const liveBonusMultipliers = [1, 5, 10, 15, 19, 23, 26, 29, 31, 33, 35];
  const liveBonus = liveBonusMultipliers[liveBonusIndex];
  const scoreComponent = Math.floor(score / 20000);
  const eventBonusApplied = Math.floor((100 + scoreComponent) * (1 + eventBonus / 100) * 100) / 100;
  const basePointApplied = Math.floor(eventBonusApplied * (basePoint / 100));
  const totalPoint = basePointApplied * liveBonus;
  return totalPoint;
}

function generateScoreList(eventBonus, basePoint = 100) {
  const scoreList = [];
  //maxScoreを参照し、3000000以下であればそのまま利用、3000000より大きい場合は3000000に設定
  if (maxScore > 3000000) {
    maxScore = 3000000;
  }
  for (let score = 0; score < maxScore; score += 20000) {
    for (let liveBonusIndex = 0; liveBonusIndex < 11; liveBonusIndex++) {
      const scoreUpper = score + 20000 - 1;
      const lowerResult = calculateEventPoint(score, eventBonus, basePoint, liveBonusIndex);
      const upperResult = calculateEventPoint(scoreUpper, eventBonus, basePoint, liveBonusIndex);
      if (lowerResult === upperResult) {
        scoreList.push({
          scoreLower: score,
          scoreUpper: scoreUpper,
          result: lowerResult,
          liveBonusIndex: liveBonusIndex
        });
      }
    }
  }
  return scoreList;
}

function findPointAdjustment(currentPoints, targetPoints, eventBonus, basePoint = 100) {
  const pointDifference = targetPoints - currentPoints;
  if (pointDifference > 100000) {
    return "目標ポイントにもっと近くなってから利用してください";
  }

  const scoreList = generateScoreList(eventBonus, basePoint);
  const liveBonusMultipliers = [1, 5, 10, 15, 19, 23, 26, 29, 31, 33, 35];

  function canMakeSum(target, scoreList) {
    const dp = new Array(target + 1).fill(false);
    const combination = new Array(target + 1).fill(null);
    dp[0] = true;
    combination[0] = [];

    for (let i = 0; i <= target; i++) {
      if (dp[i]) {
        for (let item of scoreList) {
          const num = item.result;
          if (i + num <= target) {
            if (!dp[i + num] || combination[i + num].length > combination[i].length + 1) {
              dp[i + num] = true;
              combination[i + num] = [...combination[i], { point: num, scoreLower: item.scoreLower, scoreUpper: item.scoreUpper, liveBonus: liveBonusMultipliers[item.liveBonusIndex] }];
            }
          }
        }
      }
    }

    if (dp[target]) {
      return combination[target];
    } else {
      return null;
    }
  }

  const result = canMakeSum(pointDifference, scoreList);

  if (!result) {
    let resultText = `[${eventBonus}%]でのポイント調整は不可能でした。\n`;
    const adjustments = [-10, -15, -20, -50];
    adjustments.forEach(adjustment => {
      const adjustedEventBonus = eventBonus + adjustment;
      const adjustedScoreList = generateScoreList(adjustedEventBonus, basePoint);
      const adjustedResult = canMakeSum(pointDifference, adjustedScoreList);
      resultText += `[${adjustedEventBonus}%]でのポイント調整は${adjustedResult ? '可能' : '不可能'}でした。\n`;
    });
    return resultText;
  }

  let resultText = `目標ポイント : [${targetPoints.toLocaleString()}Pt]\n`;
  resultText += `必要ポイント : [${pointDifference.toLocaleString()}Pt]\n`;
  resultText += `イベントボーナス : [${eventBonus}%]\n\n`;

  for (let i = 0; i < result.length; i++) {
    const step = result[i];
    const liveBonusIndex = liveBonusMultipliers.indexOf(step.liveBonus);
    const basePointApplied = step.point / step.liveBonus;
    resultText += `${i + 1}, ${step.point}Pt : ${basePointApplied}Pt [${step.scoreLower} ~ ${step.scoreUpper}] * ${step.liveBonus} (LB消費${liveBonusIndex})\n`;
  }

  return resultText;
}

// テスト
const currentPoints = 0;
const targetPoints = 6163;
const eventBonus = 300;
const basePoint = 100;
const maxScore = 1000000;

const result = findPointAdjustment(currentPoints, targetPoints, eventBonus, basePoint);

console.log(result);