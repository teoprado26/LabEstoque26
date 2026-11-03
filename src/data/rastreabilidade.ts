// Rastreabilidade: lotes de um item, movimentações (livro-razão) e histórico de status, em linha do tempo.
import { supabase } from '@/lib/supabase';
import type { LoteStatus, MovTipo } from '@/domain/tipos';

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export interface LoteDoItem {
  id: string;
  numero: string;
  status: LoteStatus;
  validade: string | null;
  fabricacao: string | null;
  aberto_em: string | null;
  custo_unitario: number | null;
  fabricante: string | null;
  fornecedor: string | null;
  lote_origem_id: string | null;
  criado_em: string;
  saldo: number;
  locais: { localId: string; local: string; saldo: number }[];
}

export async function listarLotesDoItem(itemId: string): Promise<LoteDoItem[]> {
  const [lotes, saldos] = await Promise.all([
    supabase.from('lotes').select('id, numero, status, validade, fabricacao, aberto_em, custo_unitario, fabricante, lote_origem_id, criado_em, fornecedores ( nome )')
      .eq('item_id', itemId).order('validade', { ascending: true, nullsFirst: false }),
    supabase.from('v_saldo').select('lote_id, local_id, saldo, locais ( nome )').eq('item_id', itemId),
  ]);
  type L = Omit<LoteDoItem, 'saldo' | 'locais' | 'fornecedor'> & { fornecedores: { nome: string } | null };
  type S = { lote_id: string; local_id: string; saldo: number; locais: { nome: string } | null };
  const porLote = new Map<string, LoteDoItem['locais']>();
  for (const s of ok(saldos) as unknown as S[]) {
    porLote.set(s.lote_id, [...(porLote.get(s.lote_id) ?? []), { localId: s.local_id, local: s.locais?.nome ?? 'Local', saldo: Number(s.saldo) }]);
  }
  return (ok(lotes) as unknown as L[]).map(({ fornecedores, ...l }) => {
    const locais = porLote.get(l.id) ?? [];
    return { ...l, fornecedor: fornecedores?.nome ?? null, locais, saldo: locais.reduce((t, x) => t + x.saldo, 0) };
  });
}

export async function obterLote(loteId: string) {
  return ok(
    await supabase.from('lotes')
      .select('*, itens ( id, nome, codigo, unidade_estoque, validade_pos_abertura_dias ), fornecedores ( nome )')
      .eq('id', loteId).maybeSingle(),
  ) as (LoteDoItem & { item_id: string; temp_chegada: number | null; observacao: string | null;
    itens: { id: string; nome: string; codigo: string; unidade_estoque: string; validade_pos_abertura_dias: number | null };
    fornecedores: { nome: string } | null }) | null;
}

export interface Evento {
  id: string;
  em: string;
  registradoEm?: string;
  tipo: MovTipo | 'STATUS';
  titulo: string;
  quantidade?: number;
  sinal?: 1 | -1 | 0;
  lote?: string;
  loteId?: string;
  origem?: string | null;
  destino?: string | null;
  projeto?: string | null;
  finalidade?: string | null;
  motivo?: string | null;
  justificativa?: string | null;
  usuario?: string | null;
  estornada?: boolean;
  estornoDe?: string | null;
}

const TITULO: Record<MovTipo, string> = {
  ENTRADA: 'Entrada', DISPENSACAO: 'Dispensação', DEVOLUCAO: 'Devolução', TRANSFERENCIA: 'Transferência',
  PERDA: 'Perda', AJUSTE_INVENTARIO: 'Ajuste de inventário', ESTORNO: 'Estorno',
};

/** Linha do tempo de um item (todos os lotes) ou de um lote. Mais recente primeiro. */
export async function linhaDoTempo(filtro: { itemId?: string; loteId?: string }, limite = 200): Promise<Evento[]> {
  let q = supabase.from('movimentacoes')
    .select(`id, tipo, quantidade, ocorrido_em, registrado_em, motivo, descricao_motivo, finalidade, justificativa_fefo, usuario_id, estorno_de, lote_id,
      lotes ( numero ), projetos ( codigo ),
      origem:locais!movimentacoes_local_origem_id_fkey ( nome ), destino:locais!movimentacoes_local_destino_id_fkey ( nome )`)
    .order('ocorrido_em', { ascending: false }).limit(limite);
  q = filtro.loteId ? q.eq('lote_id', filtro.loteId) : q.eq('item_id', filtro.itemId!);
  let h = supabase.from('lote_status_historico').select('id, lote_id, de, para, motivo, usuario_id, em, lotes!inner ( numero, item_id )')
    .order('em', { ascending: false }).limit(limite);
  h = filtro.loteId ? h.eq('lote_id', filtro.loteId) : h.eq('lotes.item_id', filtro.itemId!);

  const [movs, hist] = await Promise.all([q, h]);
  type M = { id: string; tipo: MovTipo; quantidade: number; ocorrido_em: string; registrado_em: string; motivo: string | null; descricao_motivo: string | null;
    finalidade: string | null; justificativa_fefo: string | null; usuario_id: string; estorno_de: string | null; lote_id: string;
    lotes: { numero: string } | null; projetos: { codigo: string } | null; origem: { nome: string } | null; destino: { nome: string } | null };
  type H = { id: number; lote_id: string; de: LoteStatus | null; para: LoteStatus; motivo: string | null; usuario_id: string | null; em: string; lotes: { numero: string } };
  const ms = ok(movs) as unknown as M[];
  const hs = ok(hist) as unknown as H[];

  const ids = [...new Set([...ms.map((m) => m.usuario_id), ...hs.map((x) => x.usuario_id)].filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from('perfis_usuario').select('id, nome, email').in('id', ids);
    for (const p of data ?? []) nomes.set(p.id, p.nome || p.email);
  }
  const estornadas = new Set(ms.map((m) => m.estorno_de).filter(Boolean));

  const eventos: Evento[] = [
    ...ms.map((m) => ({
      id: m.id, em: m.ocorrido_em, registradoEm: m.registrado_em, tipo: m.tipo, titulo: TITULO[m.tipo], quantidade: Number(m.quantidade),
      sinal: (m.tipo === 'TRANSFERENCIA' ? 0 : m.destino ? 1 : -1) as 1 | -1 | 0,
      lote: m.lotes?.numero, loteId: m.lote_id, origem: m.origem?.nome ?? null, destino: m.destino?.nome ?? null,
      projeto: m.projetos?.codigo ?? null, finalidade: m.finalidade,
      motivo: [m.motivo, m.descricao_motivo].filter(Boolean).join(': ').replace(/_/g, ' ') || null,
      justificativa: m.justificativa_fefo, usuario: nomes.get(m.usuario_id) ?? null, estornada: estornadas.has(m.id), estornoDe: m.estorno_de,
    })),
    ...hs.map((x) => ({
      id: `h${x.id}`, em: x.em, tipo: 'STATUS' as const, titulo: x.de ? `${x.de} → ${x.para}` : `Lote criado em ${x.para}`,
      lote: x.lotes.numero, loteId: x.lote_id, motivo: x.motivo, usuario: x.usuario_id ? nomes.get(x.usuario_id) ?? null : null,
    })),
  ];
  return eventos.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0));
}
