import { describe, expect, it } from 'vitest';
import { calculateMortgage, type MortgageInput } from './mortgage';
import { federalTax, housingBenefit, limitItemized, marginalRate, projectTaxes, saltLimit, standardDeduction, validateTax, type TaxInput } from './tax';

const mortgage: MortgageInput = {
  purchasePrice: 500_000, downPayment: 100_000, propertyTaxRate: 1.2,
  insuranceMode: 'fixed', insuranceRate: 0.4, insuranceAnnual: 2_000,
  interestRate: 6.5, termYears: 30, maintenanceAnnual: 3_000, hoaMonthly: 100,
  firstPayment: '2026-01',
};
const taxpayer: TaxInput = { annualIncome: 180_000, filingStatus: 'married', location: 'Austin, TX', otherDeductions: 20_000, otherSalt: 0 };
const project = (home = mortgage, tax = taxpayer) => projectTaxes(home, calculateMortgage(home), tax, 2026);

describe('federal taxes', () => {
  it('uses published 2026 standard deductions and progressive brackets', () => {
    expect(standardDeduction('single', 2026)).toBe(16_100);
    expect(standardDeduction('married', 2026)).toBe(32_200);
    expect(federalTax(50_400, 'single', 2026)).toBe(5800);
    expect(federalTax(100_800, 'married', 2026)).toBe(11_600);
    expect(federalTax(0, 'single', 2026)).toBe(0);
    expect(marginalRate(150_000, 'single', 2026)).toBe(0.24);
    expect(marginalRate(150_000, 'married', 2026)).toBe(0.22);
    expect(marginalRate(700_000, 'single', 2026)).toBe(0.37);
  });
  it('reproduces the requested $17k incremental deduction / 24% example', () => {
    const result = housingBenefit(200_000, 33_000, 20_000, 30_000, 'single', 2026);
    expect(result.incrementalDeduction).toBe(17_000);
    expect(result.marginalEstimate).toBe(4080);
    expect(result.annualSavings).toBe(4080);
  });
  it('does not attribute existing itemization benefits to housing', () => {
    expect(housingBenefit(200_000, 33_000, 40_000, 10_000, 'single', 2026).incrementalDeduction).toBe(10_000);
    expect(housingBenefit(200_000, 33_000, 10_000, 10_000, 'single', 2026).annualSavings).toBe(0);
  });
  it('calculates tax savings accurately when a deduction crosses brackets', () => {
    const result = housingBenefit(80_000, 16_100, 0, 40_000, 'single', 2026);
    expect(result.annualSavings).toBeCloseTo(13_500 * 0.22 + 10_400 * 0.12, 8);
    expect(result.annualSavings).toBeLessThan(result.marginalEstimate);
  });
  it('caps benefits at actual tax liability', () => {
    const result = housingBenefit(20_000, 16_100, 0, 100_000, 'single', 2026);
    expect(result.incrementalDeduction).toBe(3900);
    expect(result.annualSavings).toBe(390);
    expect(housingBenefit(0, 16_100, 0, 50_000, 'single', 2026).annualSavings).toBe(0);
  });
  it('retains the 2026 SALT baseline and high-income phaseout floor', () => {
    expect(saltLimit(2026, 100_000)).toBe(40_400);
    expect(saltLimit(2026, 515_000)).toBe(37_400);
    expect(saltLimit(2026, 1_000_000)).toBe(10_000);
  });
  it('indexes SALT at 3% indefinitely without a 2030 reset', () => {
    for (const year of [2027, 2029, 2030, 2031, 2056]) {
      expect(saltLimit(year, 100_000)).toBeCloseTo(40_400 * 1.03 ** (year - 2026), 6);
      expect(saltLimit(year, 100_000) / saltLimit(year - 1, 100_000)).toBeCloseTo(1.03, 8);
    }
  });
  it('continues indexing the phaseout threshold while retaining the fixed floor', () => {
    const factor = 1.03 ** 4;
    expect(saltLimit(2030, 505_000 * factor + 10_000)).toBeCloseTo(40_400 * factor - 3000, 6);
    expect(saltLimit(2030, 1_000_000)).toBe(10_000);
  });
  it('applies the high-income itemization limit', () => {
    expect(limitItemized(100_000, 1_000_000, 'single', 2026)).toBeCloseTo(100_000 * 35 / 37, 6);
    expect(limitItemized(100_000, 650_600, 'single', 2026)).toBeCloseTo(100_000 - 10_000 * 2 / 37, 6);
    const result = housingBenefit(1_000_000, 16_100, 100_000, 10_000, 'single', 2026);
    expect(result.annualSavings).toBeCloseTo(3500, 6);
  });
});

describe('yearly projections', () => {
  it('grows standard deduction and home value by 3% while interest declines', () => {
    const years = project();
    expect(years).toHaveLength(30);
    expect(years[1]!.homeValue).toBe(515_000);
    expect(years[1]!.propertyTax).toBeCloseTo(6180, 8);
    expect(years[1]!.standardDeduction / years[0]!.standardDeduction).toBeCloseTo(1.03, 8);
    expect(years[1]!.interest).toBeLessThan(years[0]!.interest);
    expect(years[0]!.monthlySavings).toBe(years[0]!.annualSavings / 12);
    expect(years.reduce((sum, year) => sum + year.interest, 0)).toBeCloseTo(calculateMortgage(mortgage).totalInterest, 5);
  });
  it('groups partial first and final calendar years without dropping payments', () => {
    const home = { ...mortgage, firstPayment: '2026-10' };
    const years = project(home);
    expect(years).toHaveLength(31);
    expect(years[0]).toMatchObject({ year: 2026, months: 3, propertyTax: 1500 });
    expect(years.at(-1)).toMatchObject({ year: 2056, months: 9 });
    expect(years.reduce((sum, year) => sum + year.months, 0)).toBe(360);
    expect(years.reduce((sum, year) => sum + year.interest, 0)).toBeCloseTo(calculateMortgage(home).totalInterest, 5);
  });
  it('shares the SALT cap without double-counting other taxes', () => {
    const years = project(mortgage, { ...taxpayer, otherDeductions: 50_000, otherSalt: 39_000 });
    expect(years[0]!.deductiblePropertyTax).toBe(1400);
    const year2030 = years[4]!;
    expect(year2030.saltCap).toBeCloseTo(40_400 * 1.03 ** 4, 6);
    expect(year2030.deductiblePropertyTax).toBeCloseTo(year2030.saltCap - 39_000, 6);
    expect(year2030.itemized).toBeCloseTo(11_000 + year2030.saltCap + year2030.deductibleInterest, 6);
    const expectedBenefit = housingBenefit(taxpayer.annualIncome, year2030.standardDeduction,
      50_000 + year2030.deductiblePropertyTax, year2030.deductibleInterest, taxpayer.filingStatus, 2030);
    expect(year2030.annualSavings).toBeCloseTo(expectedBenefit.annualSavings, 6);
    expect(year2030.monthlySavings).toBeCloseTo(expectedBenefit.annualSavings / 12, 6);
  });
  it('limits deductible interest for debt above $750k', () => {
    const home = { ...mortgage, purchasePrice: 1_100_000 };
    const first = project(home)[0]!;
    expect(first.deductibleInterest).toBeLessThan(first.interest);
    expect(first.deductibleInterest).toBeCloseTo(750_000 * 0.065, 5);
  });
  it('supports cash purchases, zero interest, and zero deductions', () => {
    expect(project({ ...mortgage, downPayment: mortgage.purchasePrice })[0]!.interest).toBe(0);
    expect(project({ ...mortgage, interestRate: 0 })[0]!.deductibleInterest).toBe(0);
    const tax = { ...taxpayer, annualIncome: 0, otherDeductions: 0 };
    expect(project(mortgage, tax).every((year) => year.annualSavings === 0)).toBe(true);
  });
  it('never attributes property-tax savings to mortgage interest', () => {
    const tax = { ...taxpayer, otherDeductions: 50_000 };
    for (const home of [{ ...mortgage, downPayment: mortgage.purchasePrice }, { ...mortgage, interestRate: 0 }]) {
      const years = project(home, tax);
      expect(years.every((year) => year.annualSavings === 0 && year.incrementalDeduction === 0)).toBe(true);
      expect(years[0]!.nonInterestDeductions).toBe(56_000);
    }
    expect(project({ ...mortgage, downPayment: mortgage.purchasePrice }, tax)[0]!.effectiveInterestRate).toBeNull();
    expect(project({ ...mortgage, interestRate: 0 }, tax)[0]!.effectiveInterestRate).toBe(0);
  });
  it('annualizes effective rates using outstanding debt in full and partial years', () => {
    for (const firstPayment of ['2026-01', '2026-10']) {
      const home = { ...mortgage, purchasePrice: 1_000_000, interestRate: 7.25, firstPayment };
      for (const row of project(home, { ...taxpayer, otherDeductions: 50_000 })) {
        expect(row.effectiveInterestRate).toBeCloseTo(0.0725 * (1 - row.annualSavings / row.interest), 10);
        expect(row.effectiveInterestRate).toBeGreaterThanOrEqual(0);
        expect(row.effectiveInterestRate).toBeLessThanOrEqual(0.0725 + 1e-10);
      }
    }
    expect(project(mortgage, { ...taxpayer, annualIncome: 0 })[0]!.effectiveInterestRate).toBeCloseTo(0.065, 10);
  });
  it('location does not silently invent state tax calculations', () => {
    expect(project(mortgage, { ...taxpayer, location: '10001' })).toEqual(project());
  });
  it('validates deductions, income, location and supported years', () => {
    expect(validateTax({ ...taxpayer, otherSalt: 30_000 }).length).toBeGreaterThan(0);
    expect(validateTax({ ...taxpayer, annualIncome: NaN }).length).toBeGreaterThan(0);
    expect(validateTax({ ...taxpayer, location: ' ' }).length).toBeGreaterThan(0);
    expect(() => projectTaxes(mortgage, calculateMortgage(mortgage), taxpayer, 2025)).toThrow();
    expect(() => project({ ...mortgage, firstPayment: '2027-01' })).toThrow();
  });
});