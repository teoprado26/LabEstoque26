// Serviço único de análises (Fase 2): todos os KPIs K01–K22, curva ABC, Pareto, fornecedores e consumo.
// Painel, telas de análise, PDF e CSV chamam estas funções — o mesmo KPI com o mesmo filtro dá o mesmo valor em todo lugar.
import { supabase } from '@/lib/supabase';
import { curvaABC, type LinhaABC } from '@/domain/abc';
import { diaLocal, diasEntre, hoje, somarDias } from '@/domain/datas';
import type { LinhaPareto, TemaPareto } from '@/domain/pareto';
import {
  k05DiasRuptura, k06TempoAtendimento, k08CoberturaInsuficiente, k10Giro, k11SemMovimentacao, k17AcuracidadeFinanceira,
  k18Rastreabilidade, k19Retroativos, k20LeadTime, k21CicloAbastecimento, k22EntregasNoPrazo, porFornecedor,
  type PedidoRecebido, type ResumoFornecedor,
} from '@/kpis/calculosFase2';
import type { KpiResultado } from '@/kpis/resultado';
import { carregarPainel, periodoAnterior, type ItemEstoque, type Periodo } from './servicoKpis';

const inicio = (dia: string) => `${dia}T00:00:00-03:00`;
const fimExclusivo = (dia: string) => `${somarDias(dia, 1)}T00:00:00-03:00`;
const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

type PedidoRpc = { pedido_id: string; fornecedor: string | null; solicitado_em: string; aprovado_em: string | null; enviado_em: string | null;
  previsto_para: string | null; recebido_em: string; conferido_em: string | null; liberado_em: string | null; completo: boolean };

export async function pedidosRecebidos(labId: string, p: Periodo): Promise<PedidoRecebido[]> {
  const rows = ok(await supabase.rpc('fn_kpi_pedidos', { p_lab: labId, p_de: inicio(p.de), p_ate: fimExclusivo(p.ate) })) as PedidoRpc[];
  return rows.map((r) => ({
    id: r.pedido_id, fornecedor: r.fornecedor, solicitadoEm: r.solicitado_em, aprovadoEm: r.aprovado_em, enviadoEm: r.enviado_em,
    previstoPara: r.previsto_para, recebidoEm: r.recebido_em, conferidoEm: r.conferido_em, liberadoEm: r.liberado_em, completo: r.completo,
  }));
}

async function kpisFase2(labId: string, p: Periodo, estoque: ItemEstoque[]) {
  const dia = hoje();
  const [pedidos, registros, snaps, reqs, consumo, ultimas, contagens, param] = await Promise.all([
    pedidosRecebidos(labId, p),
    supabase.rpc('fn_kpi_registros', { p_lab: labId, p_de: inicio(p.de), p_ate: fimExclusivo(p.ate) }),
    supabase.from('snapshot_itens').select('dia, item_id, ativo, disponivel, valor').eq('lab_id', labId).gte('dia', p.de).lte('dia', p.ate),
    supabase.from('requisicoes').select('id, criada_em, aprovada_em, atendida_em').eq('lab_id', labId).in('status', ['atendida', 'parcial'])
      .gte('atendida_em', inicio(p.de)).lt('atendida_em', fimExclusivo(p.ate)),
    supabase.rpc('fn_consumo_valorado', { p_lab: labId, p_de: inicio(p.de), p_ate: fimExclusivo(p.ate) }),
    supabase.rpc('fn_ultima_dispensacao', { p_lab: labId }),
    supabase.from('v_inventario_contagens_detalhe').select('id, saldo_sistema, divergencia, custo_unitario, status, contado_em').eq('lab_id', labId)
      .neq('status', 'pendente').gte('contado_em', inicio(p.de)).lt('contado_em', fimExclusivo(p.ate)),
    supabase.from('parametros_lab').select('sem_movimentacao_dias').eq('lab_id', labId).maybeSingle(),
  ]);
  const reg = (ok(registros) as { total: number; completas: number; retroativas: number }[])[0] ?? { total: 0, completas: 0, retroativas: 0 };
  const sn = (ok(snaps) ?? []) as { dia: string; item_id: string; ativo: boolean; disponivel: number; valor: number | null }[];
  const valorPorDia = new Map<string, number>();
  for (const s of sn) valorPorDia.set(s.dia, (valorPorDia.get(s.dia) ?? 0) + Number(s.valor ?? 0));
  const consumido = ((ok(consumo) ?? []) as { valor: number }[]).reduce((t, c) => t + Number(c.valor), 0);
  const datasItem = new Map(((ok(ultimas) ?? []) as { item_id: string; ultima: string | null; primeira_entrada: string | null }[]).map((u) => [u.item_id, u]));

  return {
    K05: k05DiasRuptura(sn.map((s) => ({ dia: s.dia, itemId: s.item_id, ativo: s.ativo, disponivel: Number(s.disponivel) }))),
    K06: k06TempoAtendimento(((ok(reqs) ?? []) as { id: string; criada_em: string; aprovada_em: string | null; atendida_em: string }[])
      .map((r) => ({ id: r.id, criadaEm: r.criada_em, aprovadaEm: r.aprovada_em, atendidaEm: r.atendida_em }))),
    K08: k08CoberturaInsuficiente(estoque.filter((i) => i.ativo).map((i) => ({
      itemId: i.itemId, criticidade: i.criticidade, coberturaDias: i.cobertura.valor, leadTimeDias: i.leadTime?.media ?? null,
    }))),
    K10: k10Giro(consumido, [...valorPorDia.values()], diasEntre(p.de, p.ate) + 1),
    K11: k11SemMovimentacao(estoque.map((i) => ({
      itemId: i.itemId, saldo: i.fisico, valor: i.custoMedio == null ? null : i.fisico * i.custoMedio,
      ultimaDispensacao: datasItem.get(i.itemId)?.ultima ?? null, desde: datasItem.get(i.itemId)?.primeira_entrada ?? null,
    })), dia, ok(param)?.sem_movimentacao_dias ?? 180),
    K17: k17AcuracidadeFinanceira(((ok(contagens) ?? []) as { id: string; saldo_sistema: number; divergencia: number; custo_unitario: number | null }[])
      .map((c) => ({ id: c.id, saldoSistema: Number(c.saldo_sistema), divergencia: Number(c.divergencia), custo: c.custo_unitario == null ? null : Number(c.custo_unitario) }))),
    K18: k18Rastreabilidade({ total: Number(reg.total), completas: Number(reg.completas) }),
    K19: k19Retroativos({ total: Number(reg.total), retroativas: Number(reg.retroativas) }),
    K20: k20LeadTime(pedidos),
    K21: k21CicloAbastecimento(pedidos),
    K22: k22EntregasNoPrazo(pedidos, diaLocal),
  };
}

export interface Indicadores {
  atualizadoEm: string;
  periodo: Periodo;
  atual: Record<string, KpiResultado>;
  anterior: Record<string, KpiResultado>;
  estoque: ItemEstoque[];
}

/** Todos os KPIs K01–K22 do período e do período anterior de mesma duração. */
export async function carregarIndicadores(labId: string, periodo: Periodo): Promise<Indicadores> {
  const painel = await carregarPainel(labId, periodo);
  const [atual2, ant2] = await Promise.all([
    kpisFase2(labId, periodo, painel.estoque),
    kpisFase2(labId, periodoAnterior(periodo), painel.estoque),
  ]);
  // K07 é por item; no agregado mostramos a mediana da cobertura dos itens com dados.
  const coberturas = painel.estoque.map((i) => i.cobertura.valor).filter((v): v is number => v != null).sort((a, b) => a - b);
  const k07: KpiResultado = coberturas.length
    ? { id: 'K07', valor: coberturas[Math.floor(coberturas.length / 2)], numerador: null, denominador: null, n: coberturas.length, selo: 'Projetado' }
    : { id: 'K07', valor: null, numerador: null, denominador: null, n: 0, selo: 'Dados insuficientes' };
  return {
    atualizadoEm: painel.atualizadoEm, periodo,
    atual: { ...painel.atual, ...atual2, K07: k07 },
    anterior: { ...painel.anterior, ...ant2 },
    estoque: painel.estoque,
  };
}

// ---------- Curva ABC ----------
export interface AnaliseABC { linhas: LinhaABC[]; mesesDeDados: number; suficiente: boolean; de: string; ate: string }

export async function carregarABC(labId: string, estoque: ItemEstoque[], meses = 12): Promise<AnaliseABC> {
  const ate = hoje();
  const de = somarDias(ate, -Math.round(meses * 30.4));
  const [consumo, param] = await Promise.all([
    supabase.rpc('fn_consumo_valorado', { p_lab: labId, p_de: inicio(de), p_ate: fimExclusivo(ate) }),
    supabase.from('parametros_lab').select('abc_cortes, min_meses_abc').eq('lab_id', labId).maybeSingle(),
  ]);
  const rows = (ok(consumo) ?? []) as { item_id: string; valor: number; primeira_saida: string | null }[];
  const porId = new Map(estoque.map((i) => [i.itemId, i]));
  const primeira = rows.map((r) => r.primeira_saida).filter(Boolean).sort()[0] as string | undefined;
  const mesesDeDados = primeira ? diasEntre(primeira, ate) / 30.4 : 0;
  const cortes = (ok(param)?.abc_cortes ?? [80, 15, 5]).map(Number) as [number, number, number];
  const linhas = curvaABC(rows.filter((r) => porId.has(r.item_id)).map((r) => ({
    itemId: r.item_id, nome: porId.get(r.item_id)!.nome, criticidade: porId.get(r.item_id)!.criticidade, valor: Number(r.valor),
  })), cortes);
  return { linhas, mesesDeDados, suficiente: mesesDeDados >= (ok(param)?.min_meses_abc ?? 6), de, ate };
}

// ---------- Pareto ----------
export async function carregarPareto(labId: string, tema: TemaPareto, p: Periodo): Promise<LinhaPareto[]> {
  const rows = (ok(await supabase.rpc('fn_pareto', { p_lab: labId, p_tema: tema, p_de: inicio(p.de), p_ate: fimExclusivo(p.ate) })) ?? []) as
    { categoria: string | null; frequencia: number; quantidade: number; valor: number }[];
  return rows.map((r) => ({
    categoria: (r.categoria ?? 'sem informação').replace(/_/g, ' '), frequencia: Number(r.frequencia), quantidade: Number(r.quantidade), valor: Number(r.valor),
  }));
}

// ---------- Fornecedores ----------
export async function carregarFornecedores(labId: string, p: Periodo): Promise<{ resumo: ResumoFornecedor[]; pedidos: PedidoRecebido[] }> {
  const pedidos = await pedidosRecebidos(labId, p);
  return { resumo: porFornecedor(pedidos, diaLocal), pedidos };
}

// ---------- Consumo por categoria ou projeto ----------
export async function consumoPor(labId: string, dimensao: 'categoria' | 'projeto', p: Periodo): Promise<{ rotulo: string; valor: number; quantidade: number }[]> {
  const { data, error } = await supabase.from('v_movimentacoes')
    .select('item_id, categoria_id, projeto_codigo, quantidade, custo_unitario, tipo')
    .eq('lab_id', labId).eq('tipo', 'DISPENSACAO').gte('ocorrido_em', inicio(p.de)).lt('ocorrido_em', fimExclusivo(p.ate)).limit(10000);
  if (error) throw new Error(error.message);
  let nomes = new Map<string, string>();
  if (dimensao === 'categoria') {
    const { data: cats } = await supabase.from('categorias').select('id, nome').eq('lab_id', labId);
    nomes = new Map((cats ?? []).map((c) => [c.id, c.nome]));
  }
  const g = new Map<string, { valor: number; quantidade: number }>();
  for (const m of data ?? []) {
    const chave = dimensao === 'categoria' ? (m.categoria_id ? nomes.get(m.categoria_id) ?? 'Sem categoria' : 'Sem categoria') : (m.projeto_codigo ?? 'Sem projeto');
    const r = g.get(chave) ?? { valor: 0, quantidade: 0 };
    r.valor += Number(m.quantidade) * Number(m.custo_unitario ?? 0);
    r.quantidade += 1;
    g.set(chave, r);
  }
  return [...g].map(([rotulo, v]) => ({ rotulo, ...v })).sort((a, b) => b.valor - a.valor);
}
