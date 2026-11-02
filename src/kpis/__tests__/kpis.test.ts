import { describe, expect, it } from 'vitest';
import { KPIS, KPI_POR_ID } from '../catalog';
import {
  dentroDaTolerancia, k01Disponibilidade, k02AtendimentoLinhas, k03AtendimentoQuantidade, k04Ruptura,
  k07Cobertura, k09AbaixoDoPR, k12ValorEstoque, k13IndicePerdas, k14ValorVencido, k15ValorEmRisco, k16Acuracidade,
  type LinhaRequisicao,
} from '../calculos';
import { statusDoKpi } from '../resultado';
import { DIA, LOTES } from '../../domain/__tests__/fixtures';

describe('catálogo', () => {
  it('tem K01–K26 com ids únicos e metodologia', () => {
    expect(KPIS.map((k) => k.id)).toEqual(Array.from({ length: 26 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`));
    expect(KPIS.every((k) => k.metodologia.length > 20)).toBe(true);
  });
});

describe('K01', () => {
  it('média dos snapshots diários, geral e vitais', () => {
    const r = k01Disponibilidade([
      { dia: '2026-11-01', itemId: 'a', ativo: true, criticidade: 'V', disponivel: 5 },
      { dia: '2026-11-01', itemId: 'b', ativo: true, criticidade: 'E', disponivel: 0 },
      { dia: '2026-11-01', itemId: 'c', ativo: true, criticidade: 'D', disponivel: 3 },
      { dia: '2026-11-01', itemId: 'd', ativo: false, criticidade: 'D', disponivel: 0 },
      { dia: '2026-11-02', itemId: 'a', ativo: true, criticidade: 'V', disponivel: 0 },
      { dia: '2026-11-02', itemId: 'b', ativo: true, criticidade: 'E', disponivel: 2 },
      { dia: '2026-11-02', itemId: 'c', ativo: true, criticidade: 'D', disponivel: 3 },
    ]);
    expect(r.valor).toBeCloseTo((4 / 6) * 100, 6);
    expect(r.extra?.vitais).toBe(50);
  });

  it('sem snapshots: Dados insuficientes, nunca 0%', () => {
    const r = k01Disponibilidade([]);
    expect(r.valor).toBeNull();
    expect(r.selo).toBe('Dados insuficientes');
  });
});

describe('K02–K04', () => {
  const L = (id: string, p: Partial<LinhaRequisicao>): LinhaRequisicao => ({
    id, qtdSolicitada: 0, qtdAprovada: null, qtdAtendida: 0, canceladaPeloSolicitante: false, foraDoCatalogo: false, causaRuptura: null, ...p,
  });
  const linhas = [
    L('1', { qtdSolicitada: 10, qtdAprovada: 10, qtdAtendida: 10 }),
    L('2', { qtdSolicitada: 10, qtdAprovada: 8, qtdAtendida: 8 }),
    L('3', { qtdSolicitada: 5, qtdAtendida: 2, causaRuptura: 'atraso_fornecedor' }),
    L('4', { qtdSolicitada: 4, qtdAtendida: 0 }), // só reserva planejada: não é ruptura
    L('5', { qtdSolicitada: 6, qtdAtendida: 6 }),
    L('6', { qtdSolicitada: 9, canceladaPeloSolicitante: true }),
    L('7', { qtdSolicitada: 9, foraDoCatalogo: true }),
  ];

  it('K02 = 3/5 = 60%', () => expect(k02AtendimentoLinhas(linhas).valor).toBe(60));
  it('K03 = 26/35', () => expect(k03AtendimentoQuantidade(linhas).valor).toBeCloseTo((26 / 35) * 100, 6));
  it('K04 = 1/5 = 20% (reserva planejada não conta)', () => expect(k04Ruptura(linhas).valor).toBe(20));
  it('abaixo da amostra mínima: Dados insuficientes', () => {
    expect(k02AtendimentoLinhas(linhas.slice(0, 4)).valor).toBeNull();
  });
});

describe('K07, K09, K12, K15', () => {
  const dados = { itemId: 'meio-dmem', posicoes: LOTES, consumoMedioDiario: 5, diasHistorico: 120, saidasNaJanela: 40 };

  it('K07 cobertura = 280 / 5 = 56 dias, selo Projetado', () => {
    const r = k07Cobertura(dados, DIA);
    expect(r.valor).toBe(56);
    expect(r.selo).toBe('Projetado');
  });

  it('K07 sem 60 dias de histórico: Dados insuficientes', () => {
    expect(k07Cobertura({ ...dados, diasHistorico: 30 }, DIA).valor).toBeNull();
  });

  it('K09 conta itens com posição ≤ PR e separa os vitais', () => {
    const r = k09AbaixoDoPR([
      { itemId: 'a', criticidade: 'V', posicaoProjetada: 10, prEmUso: 20 },
      { itemId: 'b', criticidade: 'E', posicaoProjetada: 20, prEmUso: 20 },
      { itemId: 'c', criticidade: 'D', posicaoProjetada: 30, prEmUso: 20 },
      { itemId: 'd', criticidade: 'V', posicaoProjetada: 0, prEmUso: null },
    ]);
    expect(r.valor).toBe(2);
    expect(r.extra).toEqual({ vitais: 1, semParametro: 1 });
  });

  it('K12 soma saldo × custo médio e conta itens sem custo', () => {
    const r = k12ValorEstoque([{ saldo: 10, custoMedio: 2.5 }, { saldo: 4, custoMedio: 10 }, { saldo: 3, custoMedio: null }]);
    expect(r.valor).toBe(65);
    expect(r.extra?.semCusto).toBe(1);
  });

  it('K15 = R$ 100 em 30, 60 e 90 dias', () => {
    expect(k15ValorEmRisco([dados], DIA).extra).toEqual({ h30: 100, h60: 100, h90: 100 });
  });
});

describe('K13–K14', () => {
  // Consumido = 100 × 2 − 20 × 2 (devolução reintegrada) = 160. Perdido = 10 × 1,5 (custo médio) = 15.
  // Índice = 15 / 175 = 8,5714%. Custo médio usado → selo Estimado.
  const movs = [
    { id: 'm1', tipo: 'DISPENSACAO' as const, quantidade: 100, custoLote: 2, custoMedio: 2 },
    { id: 'm2', tipo: 'PERDA' as const, quantidade: 10, custoLote: null, custoMedio: 1.5, motivo: 'vencimento' },
    { id: 'm3', tipo: 'DEVOLUCAO' as const, quantidade: 20, custoLote: 2, custoMedio: 2, reintegrada: true },
    { id: 'm4', tipo: 'TRANSFERENCIA' as const, quantidade: 50, custoLote: 2, custoMedio: 2 },
  ];

  it('K13 índice de perdas', () => {
    const r = k13IndicePerdas(movs);
    expect(r.valor).toBeCloseTo((15 / 175) * 100, 6);
    expect(r.selo).toBe('Estimado');
  });

  it('K14 valor vencido', () => expect(k14ValorVencido(movs).valor).toBe(15));
});

describe('K16 e tolerância', () => {
  it('±2% para volume, exato para contáveis', () => {
    expect(dentroDaTolerancia(100, 98, false)).toBe(true);
    expect(dentroDaTolerancia(100, 97, false)).toBe(false);
    expect(dentroDaTolerancia(10, 9, true)).toBe(false);
  });

  it('acuracidade = 2/3', () => {
    const r = k16Acuracidade([{ id: 'a', dentroTolerancia: true }, { id: 'b', dentroTolerancia: true }, { id: 'c', dentroTolerancia: false }]);
    expect(r.valor).toBeCloseTo(66.6667, 3);
    expect(k16Acuracidade([]).selo).toBe('Dados insuficientes');
  });
});

describe('status por meta e polaridade', () => {
  it('maior é melhor e menor é melhor', () => {
    expect(statusDoKpi(KPI_POR_ID.K16, 96)).toBe('ok');
    expect(statusDoKpi(KPI_POR_ID.K16, 92)).toBe('alerta');
    expect(statusDoKpi(KPI_POR_ID.K16, 80)).toBe('critico');
    expect(statusDoKpi(KPI_POR_ID.K13, 1.5)).toBe('ok');
    expect(statusDoKpi(KPI_POR_ID.K13, 3)).toBe('alerta');
    expect(statusDoKpi(KPI_POR_ID.K13, 8)).toBe('critico');
    expect(statusDoKpi(KPI_POR_ID.K13, null)).toBe('neutro');
  });
});
