import { describe, expect, it, vi, afterEach } from 'vitest';
import { currentYearPropertyTax, decodePlannerState, defaultPlannerState, loadPlannerState, savePlannerState, STORAGE_KEY } from './plannerState';

const now = new Date(2026, 9, 18);
afterEach(() => vi.unstubAllGlobals());

describe('saved planner inputs', () => {
  it('uses requested defaults and prorates the automatically included property tax', () => {
    const state = defaultPlannerState(now);
    expect(state.mortgage).toMatchObject({ purchasePrice: 1_000_000, interestRate: 7.25, hoaMonthly: 0, maintenanceAnnual: 0 });
    expect(state.tax.otherSalt).toBe(state.tax.otherDeductions);
    expect(currentYearPropertyTax(state.mortgage, 2026)).toBe(3000);
    expect(currentYearPropertyTax({ ...state.mortgage, firstPayment: '2026-01' }, 2026)).toBe(12000);
    expect(currentYearPropertyTax({ ...state.mortgage, purchasePrice: NaN }, 2026)).toBeNull();
  });
  it('round-trips every input, including blank numeric values and inactive insurance fields', () => {
    const state = defaultPlannerState(now);
    state.mortgage.insuranceAnnual = 3456;
    state.mortgage.insuranceRate = 0.75;
    state.mortgage.interestRate = NaN;
    state.tax.location = 'Seattle, WA';
    state.tax.otherSalt = 4000;
    state.savings = { retirementSavings: 200_000, nonRetirementSavings: 80_000, homeSaleProceeds: 50_000, monthlyExpenses: NaN };
    let raw = '';
    vi.stubGlobal('window', { localStorage: {
      setItem: (key: string, value: string) => { expect(key).toBe(STORAGE_KEY); raw = value; },
      getItem: () => raw,
    } });
    expect(savePlannerState(state)).toBe(true);
    expect(loadPlannerState(now)).toEqual(state);
  });
  it('recovers from corrupt data, unsupported versions and malformed field types', () => {
    for (const raw of [null, '{broken', 'null', '[]', '{"version":2}']) {
      expect(decodePlannerState(raw, now)).toEqual(defaultPlannerState(now));
    }
    const raw = JSON.stringify({ version: 1, mortgage: { purchasePrice: 'bad', termYears: 5, insuranceMode: 'bad', firstPayment: '2025-01' }, tax: { filingStatus: 'bad', location: {} } });
    expect(decodePlannerState(raw, now)).toEqual(defaultPlannerState(now));
  });
  it('continues without storage permission', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(loadPlannerState(now)).toEqual(defaultPlannerState(now));
    expect(savePlannerState(defaultPlannerState(now))).toBe(false);
  });
  it('restores older saved scenarios with default savings and ignores malformed savings fields', () => {
    const old = { version: 1, mortgage: { purchasePrice: 800_000 } };
    const restored = decodePlannerState(JSON.stringify(old), now);
    expect(restored.mortgage.purchasePrice).toBe(800_000);
    expect(restored.savings).toEqual(defaultPlannerState(now).savings);
    expect(decodePlannerState(JSON.stringify({ ...old, savings: { retirementSavings: 'bad', monthlyExpenses: {} } }), now).savings).toEqual(restored.savings);
  });
});