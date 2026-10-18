export interface MortgageInput {
  purchasePrice: number;
  downPayment: number;
  propertyTaxRate: number;
  insuranceMode: 'percentage' | 'fixed';
  insuranceRate: number;
  insuranceAnnual: number;
  interestRate: number;
  termYears: 15 | 30;
  maintenanceAnnual: number;
  hoaMonthly: number;
  firstPayment: string;
}

export interface Payment {
  number: number;
  year: number;
  month: number;
  openingBalance: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface MortgageResult {
  loanAmount: number;
  principalAndInterest: number;
  taxes: number;
  insurance: number;
  maintenance: number;
  piti: number;
  totalMonthly: number;
  totalInterest: number;
  schedule: Payment[];
}

export function validateMortgage(input: MortgageInput): string[] {
  const errors: string[] = [];
  const amounts = [input.purchasePrice, input.downPayment, input.maintenanceAnnual, input.hoaMonthly,
    input.insuranceMode === 'fixed' ? input.insuranceAnnual : input.insuranceRate];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0 || value > 1_000_000_000)) {
    errors.push('Enter non-negative amounts below $1 billion. Required fields cannot be blank.');
  }
  if (!(input.purchasePrice > 0)) errors.push('Purchase price must be greater than zero.');
  if (input.downPayment > input.purchasePrice) errors.push('Down payment cannot exceed the purchase price.');
  const rates = [input.propertyTaxRate, input.interestRate, ...(input.insuranceMode === 'percentage' ? [input.insuranceRate] : [])];
  if (rates.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    errors.push('Percentage rates must be between 0% and 100%.');
  }
  if (input.termYears !== 15 && input.termYears !== 30) errors.push('Choose a 15- or 30-year fixed term.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.firstPayment)) errors.push('Enter a valid first payment month.');
  return errors;
}

export function calculateMortgage(input: MortgageInput): MortgageResult {
  const errors = validateMortgage(input);
  if (errors.length) throw new Error(errors.join(' '));
  const loanAmount = input.purchasePrice - input.downPayment;
  const months = input.termYears * 12;
  const rate = input.interestRate / 1200;
  // expm1/log1p avoid cancellation for near-zero interest rates.
  const principalAndInterest = loanAmount === 0 ? 0 : rate === 0
    ? loanAmount / months
    : loanAmount * rate / -Math.expm1(-months * Math.log1p(rate));
  const [year, month] = input.firstPayment.split('-').map(Number) as [number, number];
  let balance = loanAmount;
  const schedule: Payment[] = [];
  for (let index = 0; index < months && loanAmount > 0; index++) {
    const openingBalance = balance;
    const interest = openingBalance * rate;
    const principal = index === months - 1 ? openingBalance : Math.min(openingBalance, Math.max(0, principalAndInterest - interest));
    balance = Math.max(0, openingBalance - principal);
    const absoluteMonth = month - 1 + index;
    schedule.push({
      number: index + 1,
      year: year + Math.floor(absoluteMonth / 12),
      month: absoluteMonth % 12 + 1,
      openingBalance,
      payment: principal + interest,
      principal,
      interest,
      balance,
    });
  }
  const taxes = input.purchasePrice * input.propertyTaxRate / 1200;
  const insurance = input.insuranceMode === 'percentage'
    ? input.purchasePrice * input.insuranceRate / 1200 : input.insuranceAnnual / 12;
  const maintenance = input.maintenanceAnnual / 12;
  const piti = principalAndInterest + taxes + insurance;
  return {
    loanAmount, principalAndInterest, taxes, insurance, maintenance, piti,
    totalMonthly: piti + maintenance + input.hoaMonthly,
    totalInterest: schedule.reduce((sum, row) => sum + row.interest, 0),
    schedule,
  };
}