#!/usr/bin/env bash
# RESULTS.md の表の元になる実行を全部やり直す（4並列）。x_prod・旧本番の比較は、改善を本番に入れる前の fit.ts で作ったもの
set -euo pipefail
cd "$(dirname "$0")"
{
  for era in new old; do
    for m in x_prod ens ramp band20 band40 bucket pe40zone ratemix rmix rmix_ens rmix_band final ens_band combo; do echo "--era $era --method $m"; done
    for m in x_prod rate blendfull rmix rmix_band; do echo "--era $era --method $m --lodo"; done
  done
} | xargs -P 4 -L 1 node eval.ts
