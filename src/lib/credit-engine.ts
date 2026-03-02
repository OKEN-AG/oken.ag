/**
 * Credit Engine — Frontend port of server/engines/credit.ts
 * Supports PRICE (French), SAC, and BULLET amortization methods.
 */

export type AmortizationMethod = "PRICE" | "SAC" | "BULLET";

export interface CreditInstallment {
  installmentNumber: number;
  principal: number;
  interest: number;
  payment: number;
  balance: number;
}

export interface CreditScheduleInput {
  principal: number;
  termMonths: number;
  monthlyRate: number;
  method: AmortizationMethod;
}

export interface CreditSummary {
  schedule: CreditInstallment[];
  totalPaid: number;
  totalInterest: number;
  totalCost: number;
  cetMonthly: number;
  cetAnnual: number;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function generatePriceSchedule({ principal, termMonths, monthlyRate }: CreditScheduleInput): CreditInstallment[] {
  let balance = principal;
  const pmt = monthlyRate === 0
    ? principal / termMonths
    : principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)));

  const schedule: CreditInstallment[] = [];
  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths;
    const interestPart = roundCurrency(balance * monthlyRate);
    const principalPart = isLast ? roundCurrency(balance) : roundCurrency(pmt - interestPart);
    const paymentPart = roundCurrency(principalPart + interestPart);
    balance = roundCurrency(balance - principalPart);
    if (isLast && Math.abs(balance) < 1e-7) balance = 0;
    schedule.push({ installmentNumber: i, principal: principalPart, interest: interestPart, payment: paymentPart, balance });
  }
  return schedule;
}

function generateSacSchedule({ principal, termMonths, monthlyRate }: CreditScheduleInput): CreditInstallment[] {
  const amort = principal / termMonths;
  let balance = principal;
  const schedule: CreditInstallment[] = [];
  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths;
    const principalPart = isLast ? roundCurrency(balance) : roundCurrency(amort);
    const interestPart = roundCurrency(balance * monthlyRate);
    balance = roundCurrency(balance - principalPart);
    if (isLast && Math.abs(balance) < 1e-7) balance = 0;
    schedule.push({ installmentNumber: i, principal: principalPart, interest: interestPart, payment: roundCurrency(principalPart + interestPart), balance });
  }
  return schedule;
}

function generateBulletSchedule({ principal, termMonths, monthlyRate }: CreditScheduleInput): CreditInstallment[] {
  let balance = principal;
  const schedule: CreditInstallment[] = [];
  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths;
    const interestPart = roundCurrency(balance * monthlyRate);
    const principalPart = isLast ? roundCurrency(balance) : 0;
    balance = isLast ? 0 : roundCurrency(balance);
    schedule.push({ installmentNumber: i, principal: principalPart, interest: interestPart, payment: roundCurrency(principalPart + interestPart), balance });
  }
  return schedule;
}

export function generateCreditSchedule(input: CreditScheduleInput): CreditInstallment[] {
  if (input.principal <= 0 || input.termMonths <= 0) return [];
  switch (input.method) {
    case "PRICE": return generatePriceSchedule(input);
    case "SAC": return generateSacSchedule(input);
    case "BULLET": return generateBulletSchedule(input);
    default: return generatePriceSchedule(input);
  }
}

export function calculateCreditSummary(input: CreditScheduleInput): CreditSummary {
  const schedule = generateCreditSchedule(input);
  const totalPaid = roundCurrency(schedule.reduce((s, i) => s + i.payment, 0));
  const totalInterest = roundCurrency(schedule.reduce((s, i) => s + i.interest, 0));
  const totalCost = roundCurrency(totalPaid - input.principal);

  // CET via bisection
  let low = 0, high = 1;
  const npv = (rate: number) => {
    let sum = -input.principal;
    for (const item of schedule) sum += item.payment / Math.pow(1 + rate, item.installmentNumber);
    return sum;
  };
  while (npv(high) > 0 && high < 100) high *= 2;
  for (let j = 0; j < 80; j++) {
    const mid = (low + high) / 2;
    if (npv(mid) > 0) low = mid; else high = mid;
  }
  const cetMonthly = (low + high) / 2;
  const cetAnnual = Math.pow(1 + cetMonthly, 12) - 1;

  return { schedule, totalPaid, totalInterest, totalCost, cetMonthly, cetAnnual };
}
