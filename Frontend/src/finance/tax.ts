import type { MortgageInput, MortgageResult } from './mortgage';

// IRS Rev. Proc. 2025-32, sections 4.01 and 4.14 (tax year 2026).
// Future thresholds are scenarios, not published tax tables.
export const TAX_BASE_YEAR = 2026;
export const INFLATION = 0.03;
export const HOME_GROWTH = 0.03;
export type FilingStatus = 'single' | 'married';
const RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
const LIMITS: Record<FilingStatus, number[]> = {
  single: [12_400, 50_400, 105_700, 201_775, 256_225, 640_600, Infinity],
  married: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700, Infinity],
};

export interface TaxInput {
  annualIncome: number;
  filingStatus: FilingStatus;
  location: string;
  // Editable non-interest totals are shown with modeled property tax added.
  // Store only their non-property portions to avoid double-counting as the home changes.
  otherDeductions: number;
  otherSalt: number;
}

export interface TaxYear {
  year: number;
  months: number;
  homeValue: number;
  interest: number;
  deductibleInterest: number;
  propertyTax: number;
  deductiblePropertyTax: number;
  saltCap: number;
  standardDeduction: number;
  itemized: number;
  incrementalDeduction: number;
  marginalRate: number;
  marginalEstimate: number;
  annualSavings: number;
  monthlySavings: number;
  effectiveInterestRate: number | null;
  nonInterestDeductions: number;
}

export function validateTax(input: TaxInput): string[] {
  const errors: string[] = [];
  if ([input.annualIncome, input.otherDeductions, input.otherSalt].some((n) => !Number.isFinite(n) || n < 0 || n > 1_000_000_000)) {
    errors.push('Enter valid income and deductions. Deduction totals must cover the automatically included property tax.');
  }
  if (input.otherSalt > input.otherDeductions) errors.push('State / local taxes must be included within deductions not including mortgage interest, not added to them.');
  if (!input.location.trim()) errors.push('Enter a city and state, or ZIP code, for your scenario.');
  if (!['single', 'married'].includes(input.filingStatus)) errors.push('Choose a supported filing status.');
  return errors;
}

export function inflationFactor(year: number): number {
  if (!Number.isInteger(year) || year < TAX_BASE_YEAR) throw new Error('Tax estimates require 2026 or later.');
  return (1 + INFLATION) ** (year - TAX_BASE_YEAR);
}

export function standardDeduction(status: FilingStatus, year: number): number {
  return (status === 'married' ? 32_200 : 16_100) * inflationFactor(year);
}

export function federalTax(taxableIncome: number, status: FilingStatus, year: number): number {
  let tax = 0;
  let lower = 0;
  const factor = inflationFactor(year);
  for (let i = 0; i < RATES.length; i++) {
    const upper = LIMITS[status][i]! * factor;
    tax += Math.max(0, Math.min(taxableIncome, upper) - lower) * RATES[i]!;
    if (taxableIncome <= upper) break;
    lower = upper;
  }
  return tax;
}

export function marginalRate(taxableIncome: number, status: FilingStatus, year: number): number {
  if (taxableIncome <= 0) return 0;
  const factor = inflationFactor(year);
  return RATES[LIMITS[status].findIndex((limit) => taxableIncome <= limit * factor)]!;
}

// Planning assumption, not current law: index the 2026 SALT cap and MAGI
// threshold at scenario inflation indefinitely, without a 2030 reset.
// Retain the 30% phase-down and fixed $10,000 high-income floor.
export function saltLimit(year: number, income: number): number {
  const factor = inflationFactor(year);
  return Math.max(10_000, 40_400 * factor - 0.30 * Math.max(0, income - 505_000 * factor));
}

// 26 USC 68, effective 2026. Income is treated as ordinary AGI, with no
// above-the-line or qualified-business-income deductions in this model.
export function limitItemized(itemized: number, income: number, status: FilingStatus, year: number): number {
  const topBracket = LIMITS[status][5]! * inflationFactor(year);
  return itemized - (2 / 37) * Math.min(itemized, Math.max(0, income - topBracket));
}

export function housingBenefit(income: number, standard: number, otherItemized: number, housingItemized: number, status: FilingStatus, year: number) {
  const baseline = Math.max(standard, limitItemized(otherItemized, income, status, year));
  const withHome = Math.max(standard, limitItemized(otherItemized + housingItemized, income, status, year));
  const taxableBefore = Math.max(0, income - baseline);
  const taxableAfter = Math.max(0, income - withHome);
  const incrementalDeduction = taxableBefore - taxableAfter;
  const rate = marginalRate(taxableBefore, status, year);
  return {
    incrementalDeduction,
    marginalRate: rate,
    marginalEstimate: incrementalDeduction * rate,
    annualSavings: Math.max(0, federalTax(taxableBefore, status, year) - federalTax(taxableAfter, status, year)),
  };
}

export function projectTaxes(mortgage: MortgageInput, result: MortgageResult, tax: TaxInput, currentYear: number): TaxYear[] {
  const errors = validateTax(tax);
  if (errors.length) throw new Error(errors.join(' '));
  inflationFactor(currentYear);
  const [startYear, startMonth] = mortgage.firstPayment.split('-').map(Number) as [number, number];
  if (startYear !== currentYear) throw new Error('First payment must fall in the current calendar year.');
  const endIndex = startMonth - 1 + mortgage.termYears * 12 - 1;
  const endYear = startYear + Math.floor(endIndex / 12);
  const endMonth = endIndex % 12 + 1;
  const years: TaxYear[] = [];
  for (let year = currentYear; year <= endYear; year++) {
    const fromMonth = year === startYear ? startMonth : 1;
    const toMonth = year === endYear ? endMonth : 12;
    const months = toMonth - fromMonth + 1;
    const payments = result.schedule.filter((row) => row.year === year);
    const interest = payments.reduce((sum, row) => sum + row.interest, 0);
    // Monthly opening balances approximate the average qualified acquisition
    // debt during the financed period. One new primary-home loan is assumed.
    const averageBalance = payments.length
      ? payments.reduce((sum, row) => sum + row.openingBalance, 0) / payments.length : 0;
    const deductibleInterest = interest * (averageBalance > 0 ? Math.min(1, 750_000 / averageBalance) : 0);
    const homeValue = mortgage.purchasePrice * (1 + HOME_GROWTH) ** (year - currentYear);
    const propertyTax = homeValue * mortgage.propertyTaxRate / 100 * months / 12;
    const saltCap = saltLimit(year, tax.annualIncome);
    const baselineSalt = Math.min(tax.otherSalt, saltCap);
    const deductiblePropertyTax = Math.min(tax.otherSalt + propertyTax, saltCap) - baselineSalt;
    // Property tax is present in BOTH scenarios. Only the incremental benefit
    // of mortgage interest belongs in the savings and effective-rate columns.
    const nonInterestDeductions = tax.otherDeductions - tax.otherSalt + baselineSalt + deductiblePropertyTax;
    const standard = standardDeduction(tax.filingStatus, year);
    const benefit = housingBenefit(tax.annualIncome, standard, nonInterestDeductions, deductibleInterest, tax.filingStatus, year);
    years.push({
      year, months, homeValue, interest, deductibleInterest, propertyTax, deductiblePropertyTax,
      saltCap, standardDeduction: standard,
      nonInterestDeductions,
      itemized: limitItemized(nonInterestDeductions + deductibleInterest, tax.annualIncome, tax.filingStatus, year),
      ...benefit,
      monthlySavings: benefit.annualSavings / 12,
      // Annualized net interest / average outstanding debt, including partial
      // years. Equivalent to note rate * (1 - savings / interest paid).
      // A cash purchase has no borrowing rate; a zero-interest loan has 0%.
      effectiveInterestRate: averageBalance > 0
        ? Math.max(0, interest - benefit.annualSavings) / averageBalance * 12 / months
        : null,
    });
  }
  return years;
}