// Resolve um código lido: etiqueta de lote (QR do LabEstoque), código de barras do produto ou código interno (SKU).
import { supabase } from '@/lib/supabase';

const PREFIXO_LOTE = 'labestoque://lote/';

export type Resolucao =
  | { tipo: 'lote'; loteId: string; itemId: string; itemNome: string; loteNumero: string }
  | { tipo: 'item'; itemId: string; itemNome: string; ativo: boolean }
  | { tipo: 'desconhecido'; codigo: string };

export async function resolverCodigo(labId: string, codigo: string): Promise<Resolucao> {
  const c = codigo.trim();
  if (c.startsWith(PREFIXO_LOTE)) {
    const loteId = c.slice(PREFIXO_LOTE.length);
    if (!/^[0-9a-f-]{36}$/i.test(loteId)) return { tipo: 'desconhecido', codigo: c };
    const { data } = await supabase.from('lotes').select('id, numero, item_id, itens ( nome )').eq('id', loteId).eq('lab_id', labId).maybeSingle();
    if (data) return { tipo: 'lote', loteId, itemId: data.item_id, itemNome: (data.itens as unknown as { nome: string }).nome, loteNumero: data.numero };
    return { tipo: 'desconhecido', codigo: c };
  }
  // Duas consultas com .eq (sem montar filtro em texto): código de barras primeiro, depois o código interno.
  for (const [coluna, valor] of [['codigo_barras', c], ['codigo', c.toUpperCase()]] as const) {
    const { data } = await supabase.from('itens').select('id, nome, ativo').eq('lab_id', labId).eq(coluna, valor).limit(1).maybeSingle();
    if (data) return { tipo: 'item', itemId: data.id, itemNome: data.nome, ativo: data.ativo };
  }
  return { tipo: 'desconhecido', codigo: c };
}
