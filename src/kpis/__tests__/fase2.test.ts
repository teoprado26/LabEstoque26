import { describe, expect, it } from 'vitest';
import { curvaABC, matrizABCVED, prioridade, resumoABC } from '../../domain/abc';
import { desvio, mediana, percentil } from '../../domain/estatistica';
import { pareto } from '../../domain/pareto';
import {
  k05DiasRuptura, k06TempoAtendimento, k08CoberturaInsuficiente, k10Giro, k11SemMovimentacao, k17AcuracidadeFinanceira,
  k18Rastreabilidade, k19Retroativos, k20LeadTime, k21CicloAbastecimento, k22EntregasNoPrazo, porFornecedor, type PedidoRecebido,
} from '../calculosFase2';

describe('estatística', () => {
  const dez = Array.from({ length: 10 }, (_, i) => i + 1);
  it('mediana, P90 e desvio', () => {
    expect(mediana(dez)).toBe(5.5);
    expect(percentil(dez, 0.9)).toBeCloseTo(9.1, 6);
    expect(desvio([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 6);
    expect(mediana([])).toBeNull();
  });
});

describe('curva ABC e matriz ABC-VED', () => {
  // 500, 300, 100, 60, 40 → participação 50, 30, 10, 6, 4 → acumulado 50, 80, 90, 96, 100.
  // Classe pelo acumulado antes do item: A (0, 50), B (80, 90), C (96).
  const itens = [
    { itemId: 'e', nome: 'E', criticidade: 'D' as const, valor: 40 },
    { itemId: 'a', nome: 'A', criticidade: 'E' as const, valor: 500 },
    { itemId: 'c', nome: 'C', criticidade: 'V' as const, valor: 100 },
    { itemId: 'b', nome: 'B', criticidade: 'D' as const, valor: 300 },
    { itemId: 'd', nome: 'D', criticidade: 'E' as const, valor: 60 },
    { itemId: 'z', nome: 'Z', criticidade: 'E' as const, valor: 0 },
  ];
  const curva = curvaABC(itens);

  it('ordena, acumula e classifica', () => {
    expect(curva.map((l) => `${l.itemId}:${l.classe}:${l.acumulado}`)).toEqual(['a:A:50', 'b:A:80', 'c:B:90', 'd:B:96', 'e:C:100']);
  });
  it('resumo por classe', () => {
    expect(resumoABC(curva).map((r) => [r.classe, r.itens, r.valor])).toEqual([['A', 2, 800], ['B', 2, 160], ['C', 1, 40]]);
  });
  it('matriz e prioridade: vital é sempre alta', () => {
    const m = matrizABCVED(curva);
    expect(m.B.V.map((l) => l.itemId)).toEqual(['c']);
    expect(prioridade('C', 'V')).toBe('alta');
    expect(prioridade('A', 'D')).toBe('media');
    expect(prioridade('C', 'D')).toBe('baixa');
  });
});

describe('Pareto', () => {
  it('ordena, acumula e destaca até cruzar 80%', () => {
    const r = pareto([
      { categoria: 'dano', frequencia: 1, quantidade: 1, valor: 80 },
      { categoria: 'vencimento', frequencia: 5, quantidade: 9, valor: 600 },
      { categoria: 'outro', frequencia: 9, quantidade: 1, valor: 20 },
      { categoria: 'contaminação', frequencia: 2, quantidade: 3, valor: 300 },
    ], 'valor');
    expect(r.map((b) => [b.categoria, b.acumulado, b.vital])).toEqual([
      ['vencimento', 60, true], ['contaminação', 90, true], ['dano', 98, false], ['outro', 100, false],
    ]);
  });
  it('troca de métrica muda a ordem', () => {
    const r = pareto([{ categoria: 'x', frequencia: 1, quantidade: 0, valor: 10 }, { categoria: 'y', frequencia: 3, quantidade: 0, valor: 1 }], 'frequencia');
    expect(r[0].categoria).toBe('y');
  });
});

describe('KPIs da Fase 2', () => {
  it('K05: 3 dias em ruptura em 2 eventos', () => {
    const r = k05DiasRuptura([
      { dia: '2026-10-01', itemId: 'a', ativo: true, disponivel: 0 },
      { dia: '2026-10-02', itemId: 'a', ativo: true, disponivel: 0 },
      { dia: '2026-10-03', itemId: 'a', ativo: true, disponivel: 5 },
      { dia: '2026-10-04', itemId: 'a', ativo: true, disponivel: 0 },
      { dia: '2026-10-01', itemId: 'b', ativo: true, disponivel: 2 },
    ]);
    expect([r.valor, r.extra?.eventos, r.extra?.duracaoMedia]).toEqual([3, 2, 1.5]);
  });

  it('K06: mediana em horas a partir da aprovação', () => {
    const r = k06TempoAtendimento(Array.from({ length: 5 }, (_, i) => ({
      id: String(i), criadaEm: '2026-10-01T08:00:00Z', aprovadaEm: '2026-10-01T10:00:00Z', atendidaEm: `2026-10-01T${String(11 + i).padStart(2, '0')}:00:00Z`,
    })));
    expect(r.valor).toBe(3);
    expect(k06TempoAtendimento([]).valor).toBeNull();
  });

  it('K08: cobertura abaixo do lead time', () => {
    const r = k08CoberturaInsuficiente([
      { itemId: 'a', criticidade: 'V', coberturaDias: 5, leadTimeDias: 10 },
      { itemId: 'b', criticidade: 'E', coberturaDias: 20, leadTimeDias: 10 },
      { itemId: 'c', criticidade: 'E', coberturaDias: null, leadTimeDias: 10 },
    ]);
    expect([r.valor, r.extra?.vitais, r.n]).toEqual([1, 1, 2]);
  });

  it('K10: giro anualizado e tempo médio', () => {
    const r = k10Giro(9000, Array(30).fill(10000), 90);
    expect(r.valor).toBeCloseTo(3.65, 6);
    expect(r.extra?.tempoMedioDias).toBeCloseTo(100, 6);
  });

  it('K11: parados há ≥ 180 dias e valor imobilizado', () => {
    const r = k11SemMovimentacao([
      { itemId: 'a', saldo: 5, valor: 50, ultimaDispensacao: '2026-04-01', desde: null },
      { itemId: 'b', saldo: 5, valor: 10, ultimaDispensacao: '2026-10-01', desde: null },
      { itemId: 'c', saldo: 0, valor: 0, ultimaDispensacao: '2025-01-01', desde: null },
      { itemId: 'd', saldo: 3, valor: 30, ultimaDispensacao: null, desde: '2026-01-01' },
    ], '2026-11-02');
    expect([r.valor, r.extra?.valorImobilizado, r.registros]).toEqual([2, 80, ['a', 'd']]);
  });

  it('K17: 1 − 20/400 = 95%', () => {
    const r = k17AcuracidadeFinanceira([{ id: '1', saldoSistema: 100, divergencia: -10, custo: 2 }, { id: '2', saldoSistema: 50, divergencia: 0, custo: 4 }]);
    expect(r.valor).toBeCloseTo(95, 6);
  });

  it('K18 e K19', () => {
    expect(k18Rastreabilidade({ total: 20, completas: 19 }).valor).toBe(95);
    expect(k19Retroativos({ total: 20, retroativas: 1 }).valor).toBe(5);
    expect(k18Rastreabilidade({ total: 3, completas: 3 }).valor).toBeNull();
  });

  const P = (id: string, enviado: string, recebido: string, previsto: string, completo = true, fornecedor = 'F1'): PedidoRecebido => ({
    id, fornecedor, solicitadoEm: '2026-09-01T12:00:00Z', aprovadoEm: '2026-09-02T12:00:00Z', enviadoEm: enviado, previstoPara: previsto,
    recebidoEm: recebido, conferidoEm: '2026-09-30T12:00:00Z', liberadoEm: '2026-10-01T12:00:00Z', completo,
  });
  const peds = [
    P('1', '2026-09-03T12:00:00Z', '2026-09-13T12:00:00Z', '2026-09-15'),
    P('2', '2026-09-03T12:00:00Z', '2026-09-15T12:00:00Z', '2026-09-14'),
    P('3', '2026-09-03T12:00:00Z', '2026-09-23T12:00:00Z', '2026-09-25', false, 'F2'),
  ];
  const dia = (iso: string) => iso.slice(0, 10);

  it('K20: lead time mediano 12 dias', () => expect(k20LeadTime(peds).valor).toBe(12));
  it('K22: só 1 de 3 veio no prazo e completo', () => expect(k22EntregasNoPrazo(peds, dia).valor).toBeCloseTo(100 / 3, 6));
  it('K21: ciclo total e etapas', () => {
    const r = k21CicloAbastecimento(peds);
    expect(r.valor).toBe(30);
    expect([r.extra?.aprovacao, r.extra?.compra, r.extra?.entrega]).toEqual([1, 1, 12]);
    // Conferência: recebidos em 13, 15 e 23/09 e conferidos em 30/09 → 17, 15, 7 dias → mediana 15 > entrega 12.
    expect(r.extra?.conferencia).toBe(15);
    expect(r.extra?.gargalo).toBe(3);
  });
  it('resumo por fornecedor', () => {
    expect(porFornecedor(peds, dia).map((f) => [f.fornecedor, f.pedidos])).toEqual([['F1', 2], ['F2', 1]]);
  });
});
