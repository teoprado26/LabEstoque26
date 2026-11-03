// Alertas do painel: o que precisa de ação, agrupado por tema. Toda regra vem das definições únicas
// (disponível, validade efetiva, ponto de reposição, situação de equipamento); aqui só se agrupa e ordena.
import { supabase } from '@/lib/supabase';
import { diasEntre, hoje } from '@/domain/datas';
import { validadeEfetiva } from '@/domain/disponibilidade';
import { SITUACOES, ordenarPorUrgencia, situacaoValida } from '@/domain/equipamentos';
import type { ItemEstoque } from './servicoKpis';
import { listarSituacao, type EquipamentoSituacao } from './equipamentos';

export interface Vencimento {
  itemId: string;
  item: string;
  unidade: string;
  loteId: string;
  lote: string;
  validade: string;
  dias: number;
  quantidade: number;
  valor: number | null;
}

export interface Compra {
  itemId: string;
  item: string;
  unidade: string;
  criticidade: 'V' | 'E' | 'D';
  posicao: number;
  pontoReposicao: number | null;
  sugerida: number | null;
  semDisponivel: boolean;
}

export interface Pendencia {
  id: string;
  titulo: string;
  detalhe: string;
  rota: string;
}

export interface Alertas {
  vencidos: Vencimento[];
  vencendo30: Vencimento[];
  vencendo90: Vencimento[];
  compras: Compra[];
  equipamentos: EquipamentoSituacao[];
  quarentena: Pendencia[];
  devolucoes: Pendencia[];
  requisicoes: Pendencia[];
}

export async function carregarAlertas(labId: string, estoque: ItemEstoque[]): Promise<Alertas> {
  const dia = hoje();
  const vencs: Vencimento[] = [];
  const quarentena: Pendencia[] = [];
  for (const i of estoque) {
    // Uma entrada por lote (somando locais), para não repetir o mesmo lote.
    const porLote = new Map<string, Vencimento>();
    for (const p of i.posicoes) {
      if (p.saldoFisico <= 0 || p.status === 'BAIXADO') continue;
      if (p.status === 'QUARENTENA' && !quarentena.some((q) => q.id === p.loteId)) {
        quarentena.push({ id: p.loteId, titulo: i.nome, detalhe: `Lote ${p.numero} aguarda conferência e liberação`, rota: `/item/${i.itemId}?aba=lotes` });
      }
      const v = validadeEfetiva(p);
      if (!v) continue;
      const atual = porLote.get(p.loteId);
      if (atual) {
        atual.quantidade += p.saldoFisico;
        if (atual.valor != null && p.custoUnitario != null) atual.valor += p.saldoFisico * p.custoUnitario;
      } else {
        porLote.set(p.loteId, {
          itemId: i.itemId, item: i.nome, unidade: i.unidade, loteId: p.loteId, lote: p.numero, validade: v, dias: diasEntre(dia, v),
          quantidade: p.saldoFisico, valor: p.custoUnitario == null ? null : p.saldoFisico * p.custoUnitario,
        });
      }
    }
    vencs.push(...porLote.values());
  }
  vencs.sort((a, b) => a.dias - b.dias);

  const compras: Compra[] = estoque
    .filter((i) => i.ativo && (i.reposicao.abaixoDoPR || i.disponivel <= 0))
    .map((i) => ({
      itemId: i.itemId, item: i.nome, unidade: i.unidade, criticidade: i.criticidade, posicao: i.posicaoProjetada,
      pontoReposicao: i.reposicao.prEmUso, sugerida: i.reposicao.quantidadeSugerida, semDisponivel: i.disponivel <= 0,
    }))
    .sort((a, b) => Number(b.semDisponivel) - Number(a.semDisponivel) || (a.criticidade === 'V' ? -1 : 0) - (b.criticidade === 'V' ? -1 : 0));

  const [eqs, devs, reqs] = await Promise.all([
    listarSituacao(labId),
    supabase.from('devolucoes').select('id, condicao, movimentacoes!devolucoes_movimentacao_id_fkey ( quantidade, item_id, itens ( nome, unidade_estoque ), lotes ( numero ) )')
      .eq('lab_id', labId).is('avaliacao', null),
    supabase.from('requisicoes').select('id, numero, status, finalidade, criada_em, projetos ( codigo )')
      .eq('lab_id', labId).in('status', ['pendente_aprovacao', 'aprovada']).order('criada_em'),
  ]);
  if (devs.error) throw new Error(devs.error.message);
  if (reqs.error) throw new Error(reqs.error.message);

  type Dev = { id: string; condicao: string; movimentacoes: { quantidade: number; item_id: string; itens: { nome: string; unidade_estoque: string }; lotes: { numero: string } } };
  type Req = { id: string; numero: number; status: string; finalidade: string; projetos: { codigo: string } | null };

  return {
    vencidos: vencs.filter((v) => v.dias < 0),
    vencendo30: vencs.filter((v) => v.dias >= 0 && v.dias <= 30),
    vencendo90: vencs.filter((v) => v.dias > 30 && v.dias <= 90),
    compras,
    equipamentos: ordenarPorUrgencia(eqs.filter((e) => situacaoValida(e.situacao) && SITUACOES[e.situacao].atencao)),
    quarentena,
    devolucoes: ((devs.data ?? []) as unknown as Dev[]).map((d) => ({
      id: d.id,
      titulo: d.movimentacoes.itens.nome,
      detalhe: `${d.movimentacoes.quantidade} ${d.movimentacoes.itens.unidade_estoque} devolvidos (${d.condicao.replace(/_/g, ' ')}) · lote ${d.movimentacoes.lotes.numero}`,
      rota: '/devolucoes',
    })),
    requisicoes: ((reqs.data ?? []) as unknown as Req[]).map((r) => ({
      id: r.id,
      titulo: `Requisição nº ${r.numero}${r.projetos ? ` · ${r.projetos.codigo}` : ''}`,
      detalhe: `${r.status === 'pendente_aprovacao' ? 'Aguardando aprovação' : 'Aprovada, aguardando atendimento'} · ${r.finalidade}`,
      rota: `/requisicoes/${r.id}`,
    })),
  };
}
