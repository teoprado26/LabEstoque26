// Base de testes fictícia com valores esperados calculados à mão (ver comentários em cada teste).
import type { PosicaoLote } from '../tipos';

export const DIA = '2026-11-02';

const base = (p: Partial<PosicaoLote> & Pick<PosicaoLote, 'loteId' | 'numero'>): PosicaoLote => ({
  itemId: 'meio-dmem',
  localId: 'geladeira-1',
  status: 'LIBERADO',
  validade: null,
  abertoEm: null,
  validadePosAberturaDias: null,
  localConforme: true,
  saldoFisico: 0,
  reservado: 0,
  custoUnitario: null,
  ...p,
});

export const LOTES: PosicaoLote[] = [
  // A: vence em 9 dias
  base({ loteId: 'A', numero: 'L-A', validade: '2026-11-11', saldoFisico: 100, custoUnitario: 2 }),
  // B: aberto em 28/10, 30 dias pós-abertura → usável até 27/11 (25 dias), antes da validade de 2027
  base({ loteId: 'B', numero: 'L-B', status: 'ABERTO', validade: '2027-06-30', abertoEm: '2026-10-28T12:00:00Z', validadePosAberturaDias: 30, saldoFisico: 50, custoUnitario: 3 }),
  // C: bloqueado (devolução em avaliação) — nunca disponível
  base({ loteId: 'C', numero: 'L-C', status: 'BLOQUEADO', validade: '2026-11-05', saldoFisico: 40, custoUnitario: 2 }),
  // D: vence em 90 dias, 20 reservados → 180 disponíveis
  base({ loteId: 'D', numero: 'L-D', validade: '2027-01-31', saldoFisico: 200, reservado: 20, custoUnitario: 1 }),
  // E: local não conforme
  base({ loteId: 'E', numero: 'L-E', validade: '2027-03-01', saldoFisico: 30, localConforme: false, custoUnitario: 1 }),
  // F: vencido ontem (status ainda LIBERADO: a regra de validade exclui mesmo assim)
  base({ loteId: 'F', numero: 'L-F', validade: '2026-11-01', saldoFisico: 10, custoUnitario: 1 }),
];
