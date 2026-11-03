// Movimentação rápida (ideia do protótipo LabEstoqueGG), respeitando as regras do livro-razão:
// entrada soma a um lote já existente (lote novo exige quarentena e passa pela tela Receber);
// saída consome por FEFO, lote a lote, sempre com projeto e finalidade.
import { supabase } from '@/lib/supabase';
import { hoje } from '@/domain/datas';
import { saldoDisponivel } from '@/domain/disponibilidade';
import { ordenarFEFO } from '@/domain/fefo';
import type { ItemEstoque } from './servicoKpis';

export interface LoteParaEntrada { loteId: string; numero: string; validade: string | null; localId: string }

/** Lotes que podem receber entrada rápida: liberados ou abertos e dentro da validade, um por lote (no local com mais saldo). */
export function lotesParaEntrada(item: ItemEstoque): LoteParaEntrada[] {
  const dia = hoje();
  const porLote = new Map<string, { p: ItemEstoque['posicoes'][number] }>();
  for (const p of item.posicoes) {
    if (!['LIBERADO', 'ABERTO'].includes(p.status) || (p.validade && p.validade < dia)) continue;
    const atual = porLote.get(p.loteId);
    if (!atual || p.saldoFisico > atual.p.saldoFisico) porLote.set(p.loteId, { p });
  }
  return [...porLote.values()].map(({ p }) => ({ loteId: p.loteId, numero: p.numero, validade: p.validade, localId: p.localId }))
    .sort((a, b) => (b.validade ?? '') < (a.validade ?? '') ? -1 : 1);
}

export async function entradaRapida(item: ItemEstoque, lote: LoteParaEntrada, qtdEstoque: number): Promise<void> {
  // fn_receber recebe em unidade de compra; o lote existente mantém status, custo e validade.
  const { error } = await supabase.rpc('fn_receber', {
    p_item: item.itemId, p_numero: lote.numero, p_validade: lote.validade, p_qtd_compra: qtdEstoque / (item.fator || 1), p_local: lote.localId,
    p_observacao: 'entrada rápida',
  });
  if (error) throw new Error(error.message);
}

/** Planeja a saída por FEFO: quanto sai de cada lote. Falta > 0 quando o disponível não cobre o pedido. */
export function planejarSaida(item: ItemEstoque, qtd: number) {
  const dia = hoje();
  let resto = qtd;
  const partes: { loteId: string; localId: string; numero: string; qtd: number }[] = [];
  for (const p of ordenarFEFO(item.posicoes, dia)) {
    if (resto <= 0) break;
    const q = Math.min(resto, saldoDisponivel(p, dia));
    if (q > 0) {
      partes.push({ loteId: p.loteId, localId: p.localId, numero: p.numero, qtd: q });
      resto -= q;
    }
  }
  return { partes, falta: Math.max(0, resto) };
}

export async function saidaRapida(item: ItemEstoque, qtd: number, projeto: string, finalidade: string): Promise<string[]> {
  const { partes, falta } = planejarSaida(item, qtd);
  if (falta > 0) throw new Error(`Disponível insuficiente: faltam ${falta} ${item.unidade}.`);
  const feitos: string[] = [];
  for (const p of partes) {
    const { error } = await supabase.rpc('fn_dispensar', { p_lote: p.loteId, p_local: p.localId, p_qtd: p.qtd, p_projeto: projeto, p_finalidade: finalidade });
    if (error) throw new Error(feitos.length ? `${error.message} (já registrado: ${feitos.join(', ')})` : error.message);
    feitos.push(`${p.qtd} ${item.unidade} do lote ${p.numero}`);
  }
  return feitos;
}
