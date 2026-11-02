// Espelho em TypeScript da definição única de "disponível" (view v_disponivel, seção 4).
// Usado em simulações e testes; as telas leem a view.
import { diaLocal, menorDia, somarDias } from './datas';
import type { PosicaoLote } from './tipos';

/** Último dia em que o lote pode ser usado: a menor entre a validade e a validade pós-abertura. */
export function validadeEfetiva(p: Pick<PosicaoLote, 'validade' | 'abertoEm' | 'validadePosAberturaDias'>): string | null {
  const posAbertura =
    p.abertoEm && p.validadePosAberturaDias != null ? somarDias(diaLocal(p.abertoEm), p.validadePosAberturaDias) : null;
  return menorDia(p.validade, posAbertura);
}

export function loteUtilizavelEm(p: PosicaoLote, dia: string): boolean {
  if (p.status !== 'LIBERADO' && p.status !== 'ABERTO') return false;
  if (!p.localConforme) return false;
  const v = validadeEfetiva(p);
  return v == null || v >= dia;
}

/** Saldo disponível = físico em lote LIBERADO/ABERTO, dentro da validade, em local conforme − reservado. */
export function saldoDisponivel(p: PosicaoLote, dia: string): number {
  if (!loteUtilizavelEm(p, dia)) return 0;
  return Math.max(0, p.saldoFisico - p.reservado);
}
