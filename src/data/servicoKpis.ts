// Serviço único de KPIs: busca os dados e chama as funções de src/kpis/calculos.ts.
// O painel usa este serviço; o PDF e o Excel (Fase 2) vão usar o mesmo, com os mesmos filtros.
import { supabase } from '@/lib/supabase';
import { diasEntre, hoje, somarDias } from '@/domain/datas';
import { calcularReposicao, escolherLeadTime, type LeadTime, type ParametrosReposicao } from '@/domain/reposicao';
import type { Criticidade, LoteStatus, MovTipo, PosicaoLote } from '@/domain/tipos';
import {
  k01Disponibilidade, k02AtendimentoLinhas, k03AtendimentoQuantidade, k04Ruptura, k07Cobertura, k09AbaixoDoPR,
  k12ValorEstoque, k13IndicePerdas, k14ValorVencido, k15ValorEmRisco, k16Acuracidade,
  type DadosCobertura, type LinhaRequisicao, type MovValorada,
} from '@/kpis/calculos';
import type { KpiResultado } from '@/kpis/resultado';

export interface Periodo {
  de: string; // yyyy-mm-dd inclusive
  ate: string; // yyyy-mm-dd inclusive
}

export function periodoAnterior(p: Periodo): Periodo {
  const dur = diasEntre(p.de, p.ate) + 1;
  return { de: somarDias(p.de, -dur), ate: somarDias(p.de, -1) };
}

export const ultimosDias = (n: number): Periodo => ({ de: somarDias(hoje(), -(n - 1)), ate: hoje() });

// Limites do período em instantes, no fuso de São Paulo (UTC−3, sem horário de verão desde 2019).
const inicio = (dia: string) => `${dia}T00:00:00-03:00`;
const fimExclusivo = (dia: string) => `${somarDias(dia, 1)}T00:00:00-03:00`;

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ---------- Estoque e reposição (usados também pela tela de estoque) ----------
export interface ItemEstoque {
  itemId: string;
  codigo: string;
  nome: string;
  criticidade: Criticidade;
  unidade: string;
  ativo: boolean;
  fisico: number;
  disponivel: number;
  posicaoProjetada: number;
  custoMedio: number | null;
  proximaValidade: string | null;
  cobertura: KpiResultado;
  reposicao: ParametrosReposicao;
  posicoes: PosicaoLote[];
  categoriaId: string | null;
  tipo: string;
  fator: number;
  unidadeCompra: string;
  codigoBarras: string | null;
  emPedido: number;
  leadTime: LeadTime | null;
}

export async function carregarEstoque(labId: string): Promise<ItemEstoque[]> {
  const dia = hoje();
  const { data: param } = await supabase.from('parametros_lab').select('*').eq('lab_id', labId).maybeSingle();
  const janela: number = param?.janela_consumo_dias ?? 90;

  const [pos, itens, disp, cons, serie, snaps, lts] = await Promise.all([
    supabase.from('v_posicao_item').select('*').eq('lab_id', labId),
    supabase.from('itens').select('id, categoria_id, tipo, fator_conversao, unidade_compra, codigo_barras, multiplo_embalagem, validade_tipica_dias, validade_pos_abertura_dias, lead_time_manual_dias, es_manual, pr_manual, justificativa_manual').eq('lab_id', labId),
    supabase.from('v_disponivel').select('*').eq('lab_id', labId),
    supabase.rpc('fn_consumo_itens', { p_lab: labId, p_janela_dias: janela }),
    supabase.from('v_consumo_diario').select('item_id, dia, consumo').eq('lab_id', labId).gt('dia', somarDias(dia, -janela)),
    supabase.from('snapshot_itens').select('item_id, dia, disponivel').eq('lab_id', labId).gt('dia', somarDias(dia, -janela)),
    supabase.rpc('fn_lead_times', { p_lab: labId }),
  ]);
  [pos, itens, disp, cons, serie, snaps, lts].forEach((r) => falhou(r.error));
  // Lead time real por item (pedidos recebidos); com menos de 3 pedidos, cai no manual do cadastro.
  const leadTimes = new Map<string, number[]>();
  for (const l of (lts.data ?? []) as { item_id: string; dias: number }[]) leadTimes.set(l.item_id, [...(leadTimes.get(l.item_id) ?? []), Number(l.dias)]);

  const cadastro = new Map((itens.data ?? []).map((i) => [i.id as string, i]));
  const consumo = new Map((cons.data ?? []).map((c: { item_id: string }) => [c.item_id, c]));
  const posicoesPorItem = new Map<string, PosicaoLote[]>();
  for (const d of disp.data ?? []) {
    const lista = posicoesPorItem.get(d.item_id) ?? [];
    lista.push({
      loteId: d.lote_id, itemId: d.item_id, localId: d.local_id, numero: d.lote_numero,
      status: d.status as LoteStatus, validade: d.validade, abertoEm: d.aberto_em,
      validadePosAberturaDias: cadastro.get(d.item_id)?.validade_pos_abertura_dias ?? null,
      localConforme: d.local_conforme, saldoFisico: Number(d.saldo_fisico), reservado: Number(d.reservado),
      custoUnitario: d.custo_unitario == null ? null : Number(d.custo_unitario),
    });
    posicoesPorItem.set(d.item_id, lista);
  }
  const consumoDia = new Map<string, number>();
  for (const s of serie.data ?? []) consumoDia.set(`${s.item_id}|${s.dia}`, Number(s.consumo));
  const dispDia = new Map<string, boolean>();
  for (const s of snaps.data ?? []) dispDia.set(`${s.item_id}|${s.dia}`, Number(s.disponivel) > 0);
  const diasJanela = Array.from({ length: janela }, (_, i) => somarDias(dia, -(janela - 1 - i)));

  return (pos.data ?? []).map((p) => {
    const cad = cadastro.get(p.item_id);
    const c = consumo.get(p.item_id) as { consumo: number; saidas: number; dias_com_disponibilidade: number; dias_historico: number } | undefined;
    const consumoMedio = c && c.dias_com_disponibilidade > 0 ? Number(c.consumo) / c.dias_com_disponibilidade : 0;
    const posicoes = posicoesPorItem.get(p.item_id) ?? [];
    const dados: DadosCobertura = {
      itemId: p.item_id, posicoes, consumoMedioDiario: consumoMedio,
      diasHistorico: Number(c?.dias_historico ?? 0), saidasNaJanela: Number(c?.saidas ?? 0),
    };
    const leadTime = escolherLeadTime(leadTimes.get(p.item_id) ?? [], null, cad?.lead_time_manual_dias != null ? Number(cad.lead_time_manual_dias) : null);
    const reposicao = calcularReposicao({
      serie: {
        consumoPorDia: diasJanela.map((d) => consumoDia.get(`${p.item_id}|${d}`) ?? 0),
        disponivelNoDia: diasJanela.map((d) => dispDia.get(`${p.item_id}|${d}`) ?? true),
        saidas: dados.saidasNaJanela,
        diasHistorico: dados.diasHistorico,
      },
      leadTime,
      criticidade: p.criticidade,
      nivelServico: param?.nivel_servico?.[p.criticidade],
      periodoRevisaoDias: param?.periodo_revisao_dias ?? 30,
      posicaoProjetada: Number(p.posicao_projetada),
      multiploEmbalagem: Number(cad?.multiplo_embalagem ?? 1),
      validadeTipicaDias: cad?.validade_tipica_dias ?? null,
      minimoDiasHistorico: param?.min_dias_historico,
      minimoSaidas: param?.min_saidas,
      manual: { es: cad?.es_manual, pr: cad?.pr_manual, justificativa: cad?.justificativa_manual },
    });
    return {
      itemId: p.item_id, codigo: p.codigo, nome: p.nome, criticidade: p.criticidade, unidade: p.unidade_estoque, ativo: p.ativo,
      fisico: Number(p.fisico), disponivel: Number(p.disponivel), posicaoProjetada: Number(p.posicao_projetada),
      custoMedio: p.custo_medio == null ? null : Number(p.custo_medio), proximaValidade: p.proxima_validade,
      cobertura: k07Cobertura(dados, dia, param?.min_dias_historico ?? 60), reposicao, posicoes,
      categoriaId: cad?.categoria_id ?? null, tipo: cad?.tipo ?? 'outro', fator: Number(cad?.fator_conversao ?? 1), unidadeCompra: cad?.unidade_compra ?? '',
      codigoBarras: cad?.codigo_barras ?? null, emPedido: Number(p.em_pedido ?? 0), leadTime,
    };
  });
}

// ---------- KPIs de período ----------
async function kpisDoPeriodo(labId: string, p: Periodo) {
  const [snaps, linhas, saidas, contagens] = await Promise.all([
    supabase.from('snapshot_itens').select('dia, item_id, ativo, criticidade, disponivel').eq('lab_id', labId).gte('dia', p.de).lte('dia', p.ate),
    supabase.from('requisicao_linhas')
      .select('id, item_id, qtd_solicitada, qtd_aprovada, qtd_atendida, causa_ruptura, requisicoes!inner ( status, atendida_em, cancelada_em )')
      .eq('lab_id', labId).eq('encerrada', true)
      .or(`atendida_em.gte.${inicio(p.de)},cancelada_em.gte.${inicio(p.de)}`, { referencedTable: 'requisicoes' }),
    supabase.rpc('fn_kpi_saidas', { p_lab: labId, p_de: inicio(p.de), p_ate: fimExclusivo(p.ate) }),
    supabase.from('v_inventario_contagens').select('id, dentro_tolerancia, contado_em, status').eq('lab_id', labId)
      .neq('status', 'pendente').gte('contado_em', inicio(p.de)).lt('contado_em', fimExclusivo(p.ate)),
  ]);
  [snaps, linhas, saidas, contagens].forEach((r) => falhou(r.error));

  const fim = fimExclusivo(p.ate);
  const ls: LinhaRequisicao[] = (linhas.data ?? [])
    .filter((l) => {
      const r = l.requisicoes as unknown as { atendida_em: string | null; cancelada_em: string | null };
      return (r.atendida_em ?? r.cancelada_em ?? '') < fim;
    })
    .map((l) => {
      const r = l.requisicoes as unknown as { status: string };
      return {
        id: l.id, qtdSolicitada: Number(l.qtd_solicitada), qtdAprovada: l.qtd_aprovada == null ? null : Number(l.qtd_aprovada),
        qtdAtendida: Number(l.qtd_atendida), canceladaPeloSolicitante: r.status === 'cancelada', foraDoCatalogo: l.item_id == null,
        causaRuptura: l.causa_ruptura,
      };
    });

  // Linhas agregadas pelo banco viram movimentações sintéticas com o valor já calculado.
  const movs: MovValorada[] = (saidas.data ?? []).map(
    (s: { tipo: MovTipo; motivo: string | null; reintegrada: boolean; estimado: boolean; valor: number }, i: number) => ({
      id: `agg-${i}`, tipo: s.tipo, quantidade: 1, motivo: s.motivo, reintegrada: s.reintegrada,
      custoLote: s.estimado ? null : Number(s.valor), custoMedio: s.estimado ? Number(s.valor) : null,
    }),
  );

  return {
    K01: k01Disponibilidade((snaps.data ?? []).map((s) => ({ dia: s.dia, itemId: s.item_id, ativo: s.ativo, criticidade: s.criticidade, disponivel: Number(s.disponivel) }))),
    K02: k02AtendimentoLinhas(ls),
    K03: k03AtendimentoQuantidade(ls),
    K04: k04Ruptura(ls),
    K13: k13IndicePerdas(movs),
    K14: k14ValorVencido(movs),
    K16: k16Acuracidade((contagens.data ?? []).map((c) => ({ id: c.id, dentroTolerancia: !!c.dentro_tolerancia }))),
  };
}

export interface Painel {
  atualizadoEm: string;
  periodo: Periodo;
  atual: Record<string, KpiResultado>;
  anterior: Record<string, KpiResultado>;
  estoque: ItemEstoque[];
}

export async function carregarPainel(labId: string, periodo: Periodo): Promise<Painel> {
  const [atual, anterior, estoque] = await Promise.all([
    kpisDoPeriodo(labId, periodo),
    kpisDoPeriodo(labId, periodoAnterior(periodo)),
    carregarEstoque(labId),
  ]);
  const dia = hoje();
  const ativos = estoque.filter((i) => i.ativo);
  const instantaneos = {
    K09: k09AbaixoDoPR(ativos.map((i) => ({ itemId: i.itemId, criticidade: i.criticidade, posicaoProjetada: i.posicaoProjetada, prEmUso: i.reposicao.prEmUso }))),
    K12: k12ValorEstoque(estoque.map((i) => ({ saldo: i.fisico, custoMedio: i.custoMedio }))),
    K15: k15ValorEmRisco(
      ativos.map((i) => ({ itemId: i.itemId, posicoes: i.posicoes, consumoMedioDiario: i.reposicao.consumoMedio, diasHistorico: 0, saidasNaJanela: 0 })),
      dia,
    ),
  };
  return { atualizadoEm: new Date().toISOString(), periodo, atual: { ...atual, ...instantaneos }, anterior, estoque };
}
