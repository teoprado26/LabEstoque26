import { describe, expect, it } from 'vitest';
import { saldoDisponivel, validadeEfetiva } from '../disponibilidade';
import { ordenarFEFO, quantidadeUtilizavel, simularFEFO, sugerirLoteFEFO, valorEmRisco } from '../fefo';
import { calcularReposicao, escolherLeadTime, type SerieConsumo } from '../reposicao';
import { DIA, LOTES } from './fixtures';

describe('disponibilidade (definição única)', () => {
  it('validade efetiva considera a validade pós-abertura', () => {
    expect(validadeEfetiva(LOTES[1])).toBe('2026-11-27');
  });

  it('exclui bloqueado, local não conforme e vencido; desconta reserva', () => {
    const disp = Object.fromEntries(LOTES.map((l) => [l.loteId, saldoDisponivel(l, DIA)]));
    expect(disp).toEqual({ A: 100, B: 50, C: 0, D: 180, E: 0, F: 0 });
  });

  it('lote devolvido (BLOQUEADO) não aparece como disponível até ser liberado', () => {
    const devolvido = { ...LOTES[0], status: 'BLOQUEADO' as const };
    expect(saldoDisponivel(devolvido, DIA)).toBe(0);
    expect(saldoDisponivel({ ...devolvido, status: 'LIBERADO' }, DIA)).toBe(100);
  });
});

describe('FEFO', () => {
  it('ordena pelo primeiro a vencer e sugere o lote A', () => {
    expect(ordenarFEFO(LOTES, DIA).map((l) => l.loteId)).toEqual(['A', 'B', 'D']);
    expect(sugerirLoteFEFO(LOTES, DIA)?.loteId).toBe('A');
  });

  // Consumo 5/dia. A: 10 dias de janela (9 + o próprio dia) → 50 utilizáveis, sobram 50.
  // B: janela 26 dias − 10 já gastos = 16 dias → 80 ≥ 50 → 50. D: (91 − 20) × 5 = 355 ≥ 180 → 180.
  it('simula consumo e calcula quantidade utilizável', () => {
    const sim = simularFEFO(LOTES, 5, DIA);
    expect(sim.map((r) => [r.loteId, r.utilizavel, r.sobra])).toEqual([
      ['A', 50, 50],
      ['B', 50, 0],
      ['D', 180, 0],
    ]);
    expect(quantidadeUtilizavel(LOTES, 5, DIA)).toBe(280);
  });

  it('valor em risco = sobra de A × R$ 2 = R$ 100 nos três horizontes', () => {
    expect(valorEmRisco(LOTES, 5, DIA, 30)).toBe(100);
    expect(valorEmRisco(LOTES, 5, DIA, 60)).toBe(100);
    expect(valorEmRisco(LOTES, 5, DIA, 90)).toBe(100);
  });
});

describe('parâmetros de reposição', () => {
  const constante: SerieConsumo = {
    consumoPorDia: Array(60).fill(5),
    disponivelNoDia: Array(60).fill(true),
    saidas: 60,
    diasHistorico: 120,
  };
  const lt = escolherLeadTime([10, 12, 14], null, null)!;

  it('lead time do item com ≥ 3 pedidos: média 12, desvio 2', () => {
    expect(lt).toEqual({ media: 12, desvio: 2, origem: 'item' });
    expect(escolherLeadTime([10, 12], { media: 15, desvio: 3 }, 20)?.origem).toBe('fornecedor');
    expect(escolherLeadTime([], null, 20)).toEqual({ media: 20, desvio: 0, origem: 'manual' });
  });

  // E → Z 1,65. σd = 0 → ES = 1,65 × √(25 × 4) = 16,5. PR = 5 × 12 + 16,5 = 76,5.
  // Emáx = 76,5 + 5 × 30 = 226,5. Sugerida = 226,5 − 70 = 156,5 → múltiplo 25 → 175.
  it('ES, PR, Emáx e quantidade sugerida com consumo constante', () => {
    const r = calcularReposicao({
      serie: constante, leadTime: lt, criticidade: 'E', periodoRevisaoDias: 30,
      posicaoProjetada: 70, multiploEmbalagem: 25, validadeTipicaDias: 365,
    });
    expect(r.esCalculado).toBe(16.5);
    expect(r.prCalculado).toBe(76.5);
    expect(r.estoqueMaximo).toBe(226.5);
    expect(r.quantidadeSugerida).toBe(175);
    expect(r.abaixoDoPR).toBe(true);
    expect(r.parametroManualRecomendado).toBe(false);
  });

  // Alternando 4 e 6: média 5, s² = 60/59. ES = 1,65 × √(12 × 60/59 + 100) ≈ 17,4778.
  it('ES com variação do consumo e do lead time', () => {
    const r = calcularReposicao({
      serie: { ...constante, consumoPorDia: Array.from({ length: 60 }, (_, i) => (i % 2 ? 6 : 4)) },
      leadTime: lt, criticidade: 'E', periodoRevisaoDias: 30,
      posicaoProjetada: 300, multiploEmbalagem: 1, validadeTipicaDias: null,
    });
    expect(r.esCalculado!).toBeCloseTo(17.4778, 3);
    expect(r.prCalculado!).toBeCloseTo(77.4778, 3);
    expect(r.quantidadeSugerida).toBe(0);
    expect(r.abaixoDoPR).toBe(false);
  });

  it('valor manual sobrescreve o calculado e ambos ficam visíveis', () => {
    const r = calcularReposicao({
      serie: constante, leadTime: lt, criticidade: 'V', periodoRevisaoDias: 30,
      posicaoProjetada: 70, multiploEmbalagem: 1, validadeTipicaDias: null,
      manual: { pr: 50, justificativa: 'uso sazonal' },
    });
    expect(r.prCalculado).toBeCloseTo(5 * 12 + 2.05 * 10, 6);
    expect(r.prEmUso).toBe(50);
    expect(r.abaixoDoPR).toBe(false);
  });

  it('marca "parâmetro manual recomendado" sem histórico suficiente', () => {
    const r = calcularReposicao({
      serie: { consumoPorDia: [0, 3, 0], disponivelNoDia: [true, true, true], saidas: 1, diasHistorico: 3 },
      leadTime: null, criticidade: 'V', periodoRevisaoDias: 30,
      posicaoProjetada: 0, multiploEmbalagem: 1, validadeTipicaDias: null,
    });
    expect(r.parametroManualRecomendado).toBe(true);
    expect(r.prCalculado).toBeNull();
    expect(r.motivosManual.length).toBeGreaterThanOrEqual(3);
  });
});
