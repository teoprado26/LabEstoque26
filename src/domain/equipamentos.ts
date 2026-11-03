// Apresentação da situação de equipamentos. A regra que define a situação está na view v_equipamentos_situacao.

export type Situacao =
  | 'em_manutencao' | 'sem_calibracao' | 'calibracao_reprovada' | 'calibracao_vencida' | 'manutencao_atrasada'
  | 'calibracao_a_vencer' | 'manutencao_proxima' | 'sem_manutencao' | 'ok';

export type TipoServico = 'manutencao_preventiva' | 'manutencao_corretiva' | 'calibracao';
export type ResultadoCalibracao = 'aprovado' | 'aprovado_com_restricao' | 'reprovado';

type Tom = 'ok' | 'warn' | 'crit' | 'primary' | 'neutro';

export const SITUACOES: Record<Situacao, { rotulo: string; tom: Tom; atencao: boolean; prioridade: number; acao: string | null }> = {
  calibracao_reprovada: { rotulo: '✕ Calibração reprovada', tom: 'crit', atencao: true, prioridade: 0, acao: 'Não use em medições até nova calibração aprovada; avalie manutenção.' },
  calibracao_vencida: { rotulo: '✕ Calibração vencida', tom: 'crit', atencao: true, prioridade: 1, acao: 'Agende a calibração; medições feitas agora não têm rastreabilidade.' },
  em_manutencao: { rotulo: '! Em manutenção', tom: 'warn', atencao: true, prioridade: 2, acao: 'Conclua o serviço para devolver o equipamento ao uso.' },
  sem_calibracao: { rotulo: '! Sem calibração registrada', tom: 'warn', atencao: true, prioridade: 3, acao: 'Registre a última calibração ou agende uma.' },
  manutencao_atrasada: { rotulo: '! Preventiva atrasada', tom: 'warn', atencao: true, prioridade: 4, acao: 'Agende a manutenção preventiva.' },
  calibracao_a_vencer: { rotulo: '! Calibração a vencer', tom: 'warn', atencao: true, prioridade: 5, acao: 'Agende a calibração antes do vencimento.' },
  manutencao_proxima: { rotulo: 'Preventiva próxima', tom: 'primary', atencao: false, prioridade: 6, acao: 'Agende a manutenção preventiva.' },
  sem_manutencao: { rotulo: 'Sem preventiva registrada', tom: 'neutro', atencao: false, prioridade: 7, acao: 'Registre a última preventiva para iniciar o plano.' },
  ok: { rotulo: '✓ Em dia', tom: 'ok', atencao: false, prioridade: 8, acao: null },
};

export const TIPOS_SERVICO: Record<TipoServico, string> = {
  calibracao: 'Calibração',
  manutencao_preventiva: 'Manutenção preventiva',
  manutencao_corretiva: 'Manutenção corretiva',
};

export const RESULTADOS: { valor: ResultadoCalibracao; rotulo: string }[] = [
  { valor: 'aprovado', rotulo: 'Aprovado' },
  { valor: 'aprovado_com_restricao', rotulo: 'Aprovado com restrição' },
  { valor: 'reprovado', rotulo: 'Reprovado' },
];

export const situacaoValida = (s: string): s is Situacao => s in SITUACOES;

/** Ordena para a lista: mais urgente primeiro, depois nome. */
export function ordenarPorUrgencia<T extends { situacao: string; nome: string }>(xs: T[]): T[] {
  const p = (s: string) => (situacaoValida(s) ? SITUACOES[s].prioridade : 99);
  return [...xs].sort((a, b) => p(a.situacao) - p(b.situacao) || a.nome.localeCompare(b.nome));
}
