export type FundsSufficiency = 'yes' | 'no' | 'unverifiable';

export function evaluateFundsSufficiency(
  availableBalance: string | null,
  amountBaseUnits: string | null,
  feeBaseUnits: string | null,
): FundsSufficiency {
  if (!availableBalance || !amountBaseUnits || !feeBaseUnits) {
    return 'unverifiable';
  }

  try {
    return BigInt(availableBalance) >= BigInt(amountBaseUnits) + BigInt(feeBaseUnits)
      ? 'yes'
      : 'no';
  } catch {
    return 'unverifiable';
  }
}
