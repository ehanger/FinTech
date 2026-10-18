export interface DownPaymentInput {
  retirementSavings: number;
  nonRetirementSavings: number;
  homeSaleProceeds: number;
  monthlyExpenses: number;
}

export function validateDownPayment(input: DownPaymentInput): string[] {
  return Object.values(input).some((value) => !Number.isFinite(value) || value < 0 || value > 1_000_000_000)
    ? ['Enter non-negative savings, sale proceeds, and expenses up to $1 billion. Required fields cannot be blank.'] : [];
}

export function calculateDownPayment(input: DownPaymentInput, downPayment: number, loanAmount: number, housingMonthly: number) {
  const errors = validateDownPayment(input);
  if ([downPayment, loanAmount, housingMonthly].some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push('Purchase costs and monthly housing costs must be finite, non-negative amounts.');
  }
  if (errors.length) throw new Error(errors.join(' '));

  const closingCosts = loanAmount * 0.025;
  const purchaseCash = downPayment + closingCosts;
  const saleProceedsUsed = Math.min(input.homeSaleProceeds, purchaseCash);
  const nonRetirementUsed = Math.min(input.nonRetirementSavings, purchaseCash - saleProceedsUsed);
  const retirementUsed = Math.min(input.retirementSavings, purchaseCash - saleProceedsUsed - nonRetirementUsed);
  const shortfall = Math.max(0, purchaseCash - saleProceedsUsed - nonRetirementUsed - retirementUsed);
  const nonRetirementRemaining = input.nonRetirementSavings - nonRetirementUsed + input.homeSaleProceeds - saleProceedsUsed;
  const retirementRemaining = input.retirementSavings - retirementUsed;
  const totalRemaining = nonRetirementRemaining + retirementRemaining;
  const monthlySpending = housingMonthly + input.monthlyExpenses;
  // Hold today's total spending constant; no income, returns, inflation, or tax savings.
  // Null means no depletion at zero spending. Unfunded purchases have no runway estimate.
  const months = (savings: number) => shortfall > 0 || monthlySpending === 0 ? null : Math.floor(savings / monthlySpending);
  return {
    closingCosts, purchaseCash, saleProceedsUsed, nonRetirementUsed, retirementUsed, shortfall,
    nonRetirementRemaining, retirementRemaining, totalRemaining, monthlySpending,
    monthsExcludingRetirement: months(nonRetirementRemaining), monthsIncludingRetirement: months(totalRemaining),
  };
}