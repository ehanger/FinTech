import { describe, expect, it } from 'vitest';
import { calculateMortgage, validateMortgage, type MortgageInput } from './mortgage';

export const example: MortgageInput = {
  purchasePrice: 500_000, downPayment: 100_000, propertyTaxRate: 1.2,
  insuranceMode: 'fixed', insuranceRate: 0.4, insuranceAnnual: 2_000,
  interestRate: 6.5, termYears: 30, maintenanceAnnual: 3_000, hoaMonthly: 100,
  firstPayment: '2026-01',
};

describe('mortgage calculation', () => {
  it('calculates P&I, PITI and full housing costs', () => {
    const result = calculateMortgage(example);
    expect(result.loanAmount).toBe(400_000);
    expect(result.principalAndInterest).toBeCloseTo(2528.27, 2);
    expect(result.taxes).toBe(500);
    expect(result.insurance).toBeCloseTo(166.666667, 5);
    expect(result.piti).toBeCloseTo(3194.94, 2);
    expect(result.totalMonthly).toBeCloseTo(3544.94, 2);
    expect(result.schedule[0]!.interest).toBeCloseTo(2166.666667, 5);
  });
  it('amortizes exactly the loan amount with no negative balances', () => {
    const result = calculateMortgage(example);
    expect(result.schedule).toHaveLength(360);
    expect(result.schedule.at(-1)!.balance).toBe(0);
    expect(result.schedule.reduce((sum, row) => sum + row.principal, 0)).toBeCloseTo(400_000, 6);
    expect(result.schedule.every((row) => row.balance >= 0 && row.principal >= 0)).toBe(true);
    expect(result.schedule.reduce((sum, row) => sum + row.payment, 0)).toBeCloseTo(result.loanAmount + result.totalInterest, 5);
  });
  it('supports 15 years and calendar-year rollovers', () => {
    const result = calculateMortgage({ ...example, termYears: 15, firstPayment: '2026-12' });
    expect(result.schedule).toHaveLength(180);
    expect(result.schedule[1]).toMatchObject({ year: 2027, month: 1 });
    expect(result.schedule.at(-1)).toMatchObject({ year: 2041, month: 11, balance: 0 });
  });
  it('handles zero and near-zero interest', () => {
    for (const rate of [0, 0.000000001]) {
      const result = calculateMortgage({ ...example, interestRate: rate });
      expect(result.principalAndInterest).toBeCloseTo(400_000 / 360, 4);
      expect(result.schedule.at(-1)!.balance).toBe(0);
    }
  });
  it('handles a cash purchase without fictitious mortgage payments', () => {
    const result = calculateMortgage({ ...example, downPayment: 500_000 });
    expect(result.principalAndInterest).toBe(0);
    expect(result.schedule).toEqual([]);
    expect(result.piti).toBeCloseTo(666.666667, 5);
  });
  it('supports percentage insurance and ignores the inactive insurance field', () => {
    const result = calculateMortgage({ ...example, insuranceMode: 'percentage', insuranceAnnual: NaN });
    expect(result.insurance).toBeCloseTo(2000 / 12, 6);
  });
  it.each([
    { purchasePrice: 0 }, { downPayment: 600_000 }, { interestRate: -1 },
    { propertyTaxRate: Infinity }, { hoaMonthly: NaN }, { firstPayment: '2026-13' },
    { maintenanceAnnual: -10 }, { insuranceAnnual: -1 },
  ])('rejects invalid inputs %j', (changes) => {
    expect(validateMortgage({ ...example, ...changes }).length).toBeGreaterThan(0);
    expect(() => calculateMortgage({ ...example, ...changes })).toThrow();
  });
});