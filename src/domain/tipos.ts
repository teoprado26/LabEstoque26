export type LoteStatus = 'QUARENTENA' | 'LIBERADO' | 'ABERTO' | 'BLOQUEADO' | 'VENCIDO' | 'BAIXADO';

export type MovTipo =
  | 'ENTRADA'
  | 'DISPENSACAO'
  | 'DEVOLUCAO'
  | 'TRANSFERENCIA'
  | 'PERDA'
  | 'AJUSTE_INVENTARIO'
  | 'ESTORNO';

export type Criticidade = 'V' | 'E' | 'D';

export const MOTIVOS_PERDA = [
  'vencimento',
  'contaminacao',
  'deterioracao',
  'armazenamento_inadequado',
  'excursao_temperatura',
  'dano_fisico',
  'extravio',
  'falha_transporte',
  'descarte_tecnico',
  'outro',
] as const;
export type MotivoPerda = (typeof MOTIVOS_PERDA)[number];

export const CONDICOES_DEVOLUCAO = ['integro_fechado', 'aberto', 'danificado', 'armazenamento_comprometido'] as const;
export type CondicaoDevolucao = (typeof CONDICOES_DEVOLUCAO)[number];

export const CAUSAS_RUPTURA = [
  'consumo_acima_previsto',
  'atraso_fornecedor',
  'compra_nao_realizada',
  'lote_bloqueado',
  'perda',
  'erro_saldo',
] as const;
export type CausaRuptura = (typeof CAUSAS_RUPTURA)[number];

/** Um lote numa posição, como lido de v_saldo, com os dados necessários à regra de disponibilidade. */
export interface PosicaoLote {
  loteId: string;
  itemId: string;
  localId: string;
  numero: string;
  status: LoteStatus;
  /** ISO yyyy-mm-dd */
  validade: string | null;
  /** ISO timestamp */
  abertoEm: string | null;
  validadePosAberturaDias: number | null;
  localConforme: boolean;
  saldoFisico: number;
  reservado: number;
  custoUnitario: number | null;
}
