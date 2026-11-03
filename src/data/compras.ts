// Compras: pedidos ao fornecedor e suas etapas (solicitação → aprovação → envio → recebimento → conferência → liberação).
import { supabase } from '@/lib/supabase';
import type { ItemEstoque } from './servicoKpis';

export type EtapaPedido = 'solicitado' | 'aprovado' | 'enviado' | 'recebido' | 'conferido' | 'liberado' | 'cancelado';

export const ETAPAS: { valor: Exclude<EtapaPedido, 'cancelado'>; rotulo: string; campo: string }[] = [
  { valor: 'solicitado', rotulo: 'Solicitado', campo: 'solicitado_em' },
  { valor: 'aprovado', rotulo: 'Aprovado', campo: 'aprovado_em' },
  { valor: 'enviado', rotulo: 'Enviado ao fornecedor', campo: 'enviado_em' },
  { valor: 'recebido', rotulo: 'Recebido', campo: 'recebido_em' },
  { valor: 'conferido', rotulo: 'Conferido', campo: 'conferido_em' },
  { valor: 'liberado', rotulo: 'Lotes liberados', campo: 'liberado_em' },
];

export const ROTULO_ETAPA: Record<EtapaPedido, string> = { ...Object.fromEntries(ETAPAS.map((e) => [e.valor, e.rotulo])), cancelado: 'Cancelado' } as Record<EtapaPedido, string>;

export interface LinhaPedido {
  id: string; item_id: string; qtd_pedida: number; qtd_recebida: number; custo_unitario_previsto: number | null;
  itens: { nome: string; codigo: string; unidade_compra: string; unidade_estoque: string; fator_conversao: number } | null;
}

export interface Pedido {
  id: string; numero: number; status: EtapaPedido; observacao: string | null; fornecedor_id: string | null; projeto_id: string | null;
  solicitado_em: string; aprovado_em: string | null; enviado_em: string | null; previsto_para: string | null; recebido_em: string | null;
  conferido_em: string | null; liberado_em: string | null; cancelado_em: string | null; motivo_cancelamento: string | null;
  fornecedores: { nome: string } | null; projetos: { codigo: string } | null; pedido_linhas: LinhaPedido[];
}

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

const SELECT = '*, fornecedores ( nome ), projetos ( codigo ), pedido_linhas ( *, itens ( nome, codigo, unidade_compra, unidade_estoque, fator_conversao ) )';

export async function listarPedidos(labId: string): Promise<Pedido[]> {
  return (ok(await supabase.from('pedidos_compra').select(SELECT).eq('lab_id', labId).order('solicitado_em', { ascending: false }).limit(200)) ?? []) as unknown as Pedido[];
}

export async function obterPedido(id: string): Promise<Pedido | null> {
  return ok(await supabase.from('pedidos_compra').select(SELECT).eq('id', id).maybeSingle()) as unknown as Pedido | null;
}

export async function criarPedido(labId: string, fornecedor: string | null, projeto: string | null, linhas: { item_id: string; qtd: number; custo?: number | null }[], observacao?: string | null) {
  return ok(await supabase.rpc('fn_criar_pedido', { p_lab: labId, p_fornecedor: fornecedor, p_projeto: projeto, p_linhas: linhas, p_observacao: observacao ?? null })) as string;
}

export async function avancarPedido(id: string, etapa: 'aprovado' | 'enviado' | 'conferido' | 'cancelado', previsto?: string | null, motivo?: string | null) {
  ok(await supabase.rpc('fn_avancar_pedido', { p_pedido: id, p_etapa: etapa, p_previsto_para: previsto ?? null, p_motivo: motivo ?? null }));
}

export interface Sugestao {
  item: ItemEstoque;
  /** Em unidade de compra, arredondado para cima. */
  quantidadeCompra: number;
  motivo: string;
}

/** Sugestões de compra: itens com posição ≤ ponto de reposição (ou sem disponível), em unidade de compra. */
export function sugestoesDeCompra(estoque: ItemEstoque[]): Sugestao[] {
  return estoque
    .filter((i) => i.ativo && (i.reposicao.abaixoDoPR || (i.disponivel <= 0 && i.emPedido <= 0)))
    .map((i) => {
      const emEstoque = i.reposicao.quantidadeSugerida ?? (i.reposicao.estoqueMaximo != null ? Math.max(0, i.reposicao.estoqueMaximo - i.posicaoProjetada) : i.fator);
      return {
        item: i,
        quantidadeCompra: Math.max(1, Math.ceil(emEstoque / (i.fator || 1))),
        motivo: i.disponivel <= 0 ? 'Sem disponível' : 'Posição no ponto de reposição',
      };
    })
    .sort((a, b) => (a.item.criticidade === 'V' ? -1 : 0) - (b.item.criticidade === 'V' ? -1 : 0) || a.item.nome.localeCompare(b.item.nome));
}
