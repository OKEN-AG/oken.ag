/**
 * Maps database error codes to user-friendly messages.
 * Prevents leaking internal schema details via toast notifications.
 */
export function handleDatabaseError(error: any): string {
  if (!error) return 'Erro desconhecido.';

  const code = error.code;
  const message = error.message || '';

  // Postgres error codes
  if (code === '23505') return 'Este registro já existe. Tente outro nome ou código.';
  if (code === '23503') return 'Operação inválida. Dados relacionados não encontrados.';
  if (code === '23514') return 'Dados inválidos. Verifique os valores informados.';
  if (code === '42501') return 'Sem permissão para esta operação.';
  if (code === '42P01') return 'Erro interno. Contate o suporte.';

  // RLS violation
  if (message.includes('row-level security')) return 'Sem permissão para esta operação.';

  // Custom validation trigger messages (user-friendly already)
  if (message.includes('must be between') || message.includes('must be positive') || message.includes('must be non-negative') || message.includes('must be >=') || message.includes('must be before')) {
    return message;
  }

  // Generic fallback - don't expose raw DB errors
  return 'Erro ao processar operação. Tente novamente.';
}
