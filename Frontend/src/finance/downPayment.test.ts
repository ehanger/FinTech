import { describe, expect, it } from 'vitest';
import { calculateDownPayment, validateDownPayment, type DownPaymentInput } from './downPayment';
import { yearsAndMonths } from '../format';

const savings: DownPaymentInput = { retirementSavings: 200_000, nonRetirementSavings: 80_000, homeSaleProceeds: 50_000, monthlyExpenses: 2_000 };

describe('down payment planning', () => {
  it('uses sale proceeds before non-retirement savings and includes loan-based closing costs', () => {
    expect(calculateDownPayment(savings, 100_000, 400_000, 3_000)).toMatchObject({
      closingCosts: 10_000, purchaseCash: 110_000, saleProceedsUsed: 50_000,
      nonRetirementUsed: 60_000, retirementUsed: 0, shortfall: 0,
      nonRetirementRemaining: 20_000, retirementRemaining: 200_000, totalRemaining: 220_000,
      monthlySpending: 5_000, monthsExcludingRetirement: 4, monthsIncludingRetirement: 44,
    });
  });
  it('adds excess proceeds to liquid savings after all purchase costs', () => {
    expect(calculateDownPayment({ ...savings, homeSaleProceeds: 150_000 }, 100_000, 400_000, 3_000)).toMatchObject({
      saleProceedsUsed: 110_000, nonRetirementUsed: 0, retirementUsed: 0,
      nonRetirementRemaining: 120_000, totalRemaining: 320_000,
    });
  });
  it('uses savings for closing costs when proceeds cover only the down payment', () => {
    expect(calculateDownPayment({ ...savings, homeSaleProceeds: 105_000 }, 100_000, 400_000, 3_000)).toMatchObject({
      nonRetirementUsed: 5_000, nonRetirementRemaining: 75_000,
    });
  });
  it('draws on retirement last, including when closing costs cause the draw', () => {
    expect(calculateDownPayment({ ...savings, homeSaleProceeds: 20_000 }, 100_000, 400_000, 3_000)).toMatchObject({
      nonRetirementUsed: 80_000, retirementUsed: 10_000, retirementRemaining: 190_000,
      nonRetirementRemaining: 0, monthsExcludingRetirement: 0,
    });
  });
  it('reports a funding shortfall instead of negative balances or a misleading runway', () => {
    expect(calculateDownPayment(savings, 400_000, 100_000, 3_000)).toMatchObject({
      retirementUsed: 200_000, shortfall: 72_500, totalRemaining: 0,
      monthsExcludingRetirement: null, monthsIncludingRetirement: null,
    });
  });
  it('handles an exactly funded purchase', () => {
    expect(calculateDownPayment({ ...savings, homeSaleProceeds: 0 }, 280_000, 0, 3_000)).toMatchObject({
      shortfall: 0, totalRemaining: 0, monthsIncludingRetirement: 0,
    });
  });
  it('has no modeled closing costs for a cash purchase and supports zero spending', () => {
    expect(calculateDownPayment({ ...savings, monthlyExpenses: 0 }, 100_000, 0, 0)).toMatchObject({
      closingCosts: 0, monthlySpending: 0, monthsIncludingRetirement: null, monthsExcludingRetirement: null,
    });
  });
  it('rounds duration down to whole months and formats years and months', () => {
    const result = calculateDownPayment({ ...savings, homeSaleProceeds: 0, nonRetirementSavings: 169_999 }, 100_000, 0, 3_000);
    expect(result.monthsExcludingRetirement).toBe(13);
    expect(yearsAndMonths(result.monthsExcludingRetirement!)).toBe('1 year 1 month');
    expect(yearsAndMonths(0)).toBe('0 years 0 months');
    expect(yearsAndMonths(24)).toBe('2 years 0 months');
  });
  it.each([-1, NaN, Infinity, 1_000_000_001])('rejects invalid savings and expense values: %s', (value) => {
    for (const key of Object.keys(savings)) {
      const input = { ...savings, [key]: value };
      expect(validateDownPayment(input)).not.toEqual([]);
      expect(() => calculateDownPayment(input, 100_000, 400_000, 3_000)).toThrow();
    }
  });
  it('rejects invalid mortgage amounts', () => {
    expect(() => calculateDownPayment(savings, NaN, 400_000, 3_000)).toThrow();
    expect(() => calculateDownPayment(savings, 100_000, -1, 3_000)).toThrow();
    expect(() => calculateDownPayment(savings, 100_000, 400_000, Infinity)).toThrow();
  });
});