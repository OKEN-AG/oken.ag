export type AmortizationMethod = "PRICE" | "SAC" | "BULLET";

export interface CreditInstallment {
  installmentNumber: number;
  principal: number;
  interest: number;
  payment: number;
  balance: number;
}

export interface PaymentMethodConfig {
  paymentMethod: string;
  monthlySpreadRate?: number;
  fixedFee?: number;
}

export interface CreditScheduleInput {
  principal: number;
  termMonths: number;
  monthlyRate: number;
  method: AmortizationMethod;
}

export interface PaymentMethodCostResult {
  paymentMethod: string;
  schedule: CreditInstallment[];
  totalPaid: number;
  totalInterest: number;
  totalCost: number;
  cetMonthly: number;
  cetAnnual: number;
}

export interface OperationCostResult {
  schedule: CreditInstallment[];
  totalPaid: number;
  totalInterest: number;
  totalCost: number;
  cetMonthly: number;
  cetAnnual: number;
  byPaymentMethod: PaymentMethodCostResult[];
}

const EPSILON = 1e-7;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertValidScheduleInput(input: CreditScheduleInput): void {
  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    throw new Error("principal must be a finite number > 0");
  }
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
    throw new Error("termMonths must be an integer > 0");
  }
  if (!Number.isFinite(input.monthlyRate) || input.monthlyRate < 0) {
    throw new Error("monthlyRate must be a finite number >= 0");
  }
}

function generatePriceSchedule(input: CreditScheduleInput): CreditInstallment[] {
  const { principal, termMonths, monthlyRate } = input;
  let balance = principal;

  const paymentRaw =
    monthlyRate === 0
      ? principal / termMonths
      : principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)));

  const schedule: CreditInstallment[] = [];

  for (let i = 1; i <= termMonths; i += 1) {
    const rawInterest = balance * monthlyRate;
    const rawPrincipal = paymentRaw - rawInterest;

    const isLast = i === termMonths;
    const principalPart = isLast ? roundCurrency(balance) : roundCurrency(rawPrincipal);
    const interestPart = roundCurrency(rawInterest);
    const paymentPart = roundCurrency(principalPart + interestPart);

    balance = roundCurrency(balance - principalPart);
    if (isLast && Math.abs(balance) <= EPSILON) balance = 0;

    schedule.push({
      installmentNumber: i,
      principal: principalPart,
      interest: interestPart,
      payment: paymentPart,
      balance,
    });
  }

  return schedule;
}

function generateSacSchedule(input: CreditScheduleInput): CreditInstallment[] {
  const { principal, termMonths, monthlyRate } = input;
  const amortizationRaw = principal / termMonths;
  let balance = principal;

  const schedule: CreditInstallment[] = [];

  for (let i = 1; i <= termMonths; i += 1) {
    const isLast = i === termMonths;
    const principalPart = isLast ? roundCurrency(balance) : roundCurrency(amortizationRaw);
    const interestPart = roundCurrency(balance * monthlyRate);
    const paymentPart = roundCurrency(principalPart + interestPart);

    balance = roundCurrency(balance - principalPart);
    if (isLast && Math.abs(balance) <= EPSILON) balance = 0;

    schedule.push({
      installmentNumber: i,
      principal: principalPart,
      interest: interestPart,
      payment: paymentPart,
      balance,
    });
  }

  return schedule;
}

function generateBulletSchedule(input: CreditScheduleInput): CreditInstallment[] {
  const { principal, termMonths, monthlyRate } = input;
  let balance = principal;

  const schedule: CreditInstallment[] = [];

  for (let i = 1; i <= termMonths; i += 1) {
    const isLast = i === termMonths;
    const interestPart = roundCurrency(balance * monthlyRate);
    const principalPart = isLast ? roundCurrency(balance) : 0;
    const paymentPart = roundCurrency(principalPart + interestPart);

    balance = isLast ? 0 : roundCurrency(balance);

    schedule.push({
      installmentNumber: i,
      principal: principalPart,
      interest: interestPart,
      payment: paymentPart,
      balance,
    });
  }

  return schedule;
}

export function generateCreditSchedule(input: CreditScheduleInput): CreditInstallment[] {
  assertValidScheduleInput(input);

  switch (input.method) {
    case "PRICE":
      return generatePriceSchedule(input);
    case "SAC":
      return generateSacSchedule(input);
    case "BULLET":
      return generateBulletSchedule(input);
    default:
      throw new Error(`Unsupported amortization method: ${String(input.method)}`);
  }
}

function annualize(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}

export function calculateCetFromCashFlows(netPrincipal: number, installments: CreditInstallment[]): number {
  if (netPrincipal <= 0) {
    throw new Error("netPrincipal must be > 0");
  }

  let low = 0;
  let high = 1;

  const npv = (rate: number): number => {
    let sum = -netPrincipal;
    for (const item of installments) {
      sum += item.payment / Math.pow(1 + rate, item.installmentNumber);
    }
    return sum;
  };

  while (npv(high) > 0 && high < 100) {
    high *= 2;
  }

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);

    if (Math.abs(value) < 1e-10) return mid;
    if (value > 0) low = mid;
    else high = mid;
  }

  return (low + high) / 2;
}

function summarizeCost(principal: number, schedule: CreditInstallment[], fixedFee = 0) {
  const totalPaid = roundCurrency(schedule.reduce((acc, item) => acc + item.payment, 0) + fixedFee);
  const totalInterest = roundCurrency(schedule.reduce((acc, item) => acc + item.interest, 0));
  const totalCost = roundCurrency(totalPaid - principal);
  const netPrincipal = principal - fixedFee;
  const cetMonthly = calculateCetFromCashFlows(netPrincipal, schedule);
  const cetAnnual = annualize(cetMonthly);

  return { totalPaid, totalInterest, totalCost, cetMonthly, cetAnnual };
}

export function calculateOperationCosts(
  input: CreditScheduleInput,
  paymentMethods: PaymentMethodConfig[] = [],
): OperationCostResult {
  const schedule = generateCreditSchedule(input);
  const base = summarizeCost(input.principal, schedule, 0);

  const byPaymentMethod: PaymentMethodCostResult[] = paymentMethods.map((item) => {
    const adjustedRate = input.monthlyRate + (item.monthlySpreadRate ?? 0);
    if (adjustedRate < 0) {
      throw new Error(`Adjusted monthly rate cannot be negative for payment method ${item.paymentMethod}`);
    }

    const adjustedSchedule = generateCreditSchedule({
      ...input,
      monthlyRate: adjustedRate,
    });

    const summary = summarizeCost(input.principal, adjustedSchedule, item.fixedFee ?? 0);

    return {
      paymentMethod: item.paymentMethod,
      schedule: adjustedSchedule,
      ...summary,
    };
  });

  return {
    schedule,
    ...base,
    byPaymentMethod,
  };
}

export interface PersistInstallmentInput {
  orderId: string;
  schedule: CreditInstallment[];
  paymentMethod?: string | null;
  cetOperationAnnual: number;
  cetPaymentMethodAnnual?: number | null;
  totalCostOperation: number;
  totalCostPaymentMethod?: number | null;
}

type SupabaseLike = {
  from: (table: string) => {
    delete: () => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
    insert: (rows: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
  };
};

export async function persistOrderInstallments(
  supabase: SupabaseLike,
  input: PersistInstallmentInput,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("order_installments")
    .delete()
    .eq("order_id", input.orderId);

  if (deleteError) {
    throw new Error(`Failed to clear order_installments: ${deleteError.message}`);
  }

  const rows = input.schedule.map((item) => ({
    order_id: input.orderId,
    installment_number: item.installmentNumber,
    principal_amount: item.principal,
    interest_amount: item.interest,
    payment_amount: item.payment,
    balance_amount: item.balance,
    payment_method: input.paymentMethod ?? null,
    cet_operation_annual: input.cetOperationAnnual,
    cet_payment_method_annual: input.cetPaymentMethodAnnual ?? null,
    total_cost_operation: input.totalCostOperation,
    total_cost_payment_method: input.totalCostPaymentMethod ?? null,
  }));

  const { error: insertError } = await supabase
    .from("order_installments")
    .insert(rows);

  if (insertError) {
    throw new Error(`Failed to persist order_installments: ${insertError.message}`);
  }
}
