document.addEventListener('DOMContentLoaded', function() {
    const calculateButton = document.getElementById('calculateButton');
    const currentPointsInput = document.getElementById('currentPoints');
    const targetPointsInput = document.getElementById('targetPoints');
    const resultDiv = document.getElementById('result');

    calculateButton.addEventListener('click', function() {
        const currentPoints = parseInt(currentPointsInput.value, 10);
        const targetPoints = parseInt(targetPointsInput.value, 10);
        
        if(isNaN(currentPoints) || isNaN(targetPoints)){
          resultDiv.textContent = "数値を入力してください";
           return;
        }

      const pointDifference = targetPoints - currentPoints;

        if (pointDifference < 0) {
          resultDiv.textContent = "目標ポイントは現在のポイントより大きくしてください";
        } else {
           resultDiv.textContent = `目標ポイントまであと ${pointDifference} ポイントです。`;
        }
      });
});
