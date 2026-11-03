// Rótulos e tons dos status de requisição.
export const STATUS_REQ: Record<string, { rotulo: string; tom: 'ok' | 'warn' | 'crit' | 'primary' | 'neutro' }> = {
  rascunho: { rotulo: 'Rascunho', tom: 'neutro' },
  pendente_aprovacao: { rotulo: 'Aguardando aprovação', tom: 'warn' },
  aprovada: { rotulo: 'Aprovada', tom: 'primary' },
  atendida: { rotulo: '✓ Atendida', tom: 'ok' },
  parcial: { rotulo: '! Atendida em parte', tom: 'warn' },
  nao_atendida: { rotulo: '✕ Não atendida', tom: 'crit' },
  cancelada: { rotulo: 'Cancelada', tom: 'neutro' },
};
