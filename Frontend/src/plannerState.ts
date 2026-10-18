import type { MortgageInput } from './finance/mortgage';
import type { TaxInput } from './finance/tax';
import type { DownPaymentInput } from './finance/downPayment';

export const STORAGE_KEY = 'fintech.mortgage-planner.v1';

export interface PlannerState {
  mortgage: MortgageInput;
  tax: TaxInput;
  savings: DownPaymentInput;
}

export function defaultPlannerState(now = new Date()): PlannerState {
  return {
    mortgage: {
      purchasePrice: 1_000_000, downPayment: 100_000, propertyTaxRate: 1.2,
      insuranceMode: 'fixed', insuranceRate: 0.4, insuranceAnnual: 2_000,
      interestRate: 7.25, termYears: 30, maintenanceAnnual: 0, hoaMonthly: 0,
      firstPayment: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    },
    tax: { annualIncome: 180_000, filingStatus: 'married', location: '', otherDeductions: 10_000, otherSalt: 10_000 },
    savings: { retirementSavings: 0, nonRetirementSavings: 0, homeSaleProceeds: 0, monthlyExpenses: 0 },
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

// Preserve empty numeric fields as null in JSON and NaN in the form. Ignore
// unknown keys and malformed types rather than trusting localStorage content.
function restoreFields<T extends object>(defaults: T, value: unknown): T {
  const saved = record(value);
  const restored = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const item = saved[String(key)];
    if (typeof defaults[key] === 'number') {
      if (item === null || (typeof item === 'number' && Number.isFinite(item))) {
        restored[key] = (item === null ? NaN : item) as T[keyof T];
      }
    } else if (typeof item === 'string' && item.length <= 120) {
      restored[key] = item as T[keyof T];
    }
  }
  return restored;
}

export function decodePlannerState(raw: string | null, now = new Date()): PlannerState {
  const defaults = defaultPlannerState(now);
  if (!raw) return defaults;
  try {
    const saved = record(JSON.parse(raw));
    if (saved.version !== 1) return defaults;
    const mortgage = restoreFields(defaults.mortgage, saved.mortgage);
    const tax = restoreFields(defaults.tax, saved.tax);
    const savings = restoreFields(defaults.savings, saved.savings);
    if (!['fixed', 'percentage'].includes(mortgage.insuranceMode)) mortgage.insuranceMode = defaults.mortgage.insuranceMode;
    if (![15, 30].includes(mortgage.termYears)) mortgage.termYears = defaults.mortgage.termYears;
    if (!['single', 'married'].includes(tax.filingStatus)) tax.filingStatus = defaults.tax.filingStatus;
    // Tax scenarios start in the current year. Preserve a blank in-progress
    // month, but refresh a cached previous-year or malformed date.
    if (mortgage.firstPayment !== '' && !new RegExp(`^${now.getFullYear()}-(0[1-9]|1[0-2])$`).test(mortgage.firstPayment)) {
      mortgage.firstPayment = defaults.mortgage.firstPayment;
    }
    return { mortgage, tax, savings };
  } catch {
    return defaults;
  }
}

export function loadPlannerState(now = new Date()): PlannerState {
  try {
    return decodePlannerState(window.localStorage.getItem(STORAGE_KEY), now);
  } catch {
    return defaultPlannerState(now);
  }
}

export function savePlannerState(state: PlannerState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...state }));
    return true;
  } catch {
    // Storage can be blocked or full; calculations must still work.
    return false;
  }
}

export function currentYearPropertyTax(input: MortgageInput, currentYear: number): number | null {
  if (!new RegExp(`^${currentYear}-(0[1-9]|1[0-2])$`).test(input.firstPayment)
    || !Number.isFinite(input.purchasePrice) || input.purchasePrice <= 0
    || !Number.isFinite(input.propertyTaxRate) || input.propertyTaxRate < 0 || input.propertyTaxRate > 100) return null;
  return input.purchasePrice * input.propertyTaxRate / 100 * (13 - Number(input.firstPayment.slice(5))) / 12;
}