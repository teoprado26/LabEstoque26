import { supabase } from '@/lib/supabase';

export interface Opcao {
  id: string;
  nome: string;
}

export async function listarProjetos(labId: string): Promise<Opcao[]> {
  const { data, error } = await supabase.from('projetos').select('id, codigo, nome').eq('lab_id', labId).eq('ativo', true).order('codigo');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, nome: `${p.codigo} · ${p.nome}` }));
}

export async function listarLocais(labId: string): Promise<Opcao[]> {
  const { data, error } = await supabase.from('locais').select('id, nome, nivel').eq('lab_id', labId).eq('ativo', true).order('nome');
  if (error) throw error;
  return (data ?? []).map((l) => ({ id: l.id, nome: l.nome }));
}

export interface ItemResumo extends Opcao {
  codigo: string;
  unidadeCompra: string;
  unidadeEstoque: string;
  fator: number;
}

export async function listarItens(labId: string): Promise<ItemResumo[]> {
  const { data, error } = await supabase
    .from('itens').select('id, codigo, nome, unidade_compra, unidade_estoque, fator_conversao')
    .eq('lab_id', labId).eq('ativo', true).order('nome');
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id, nome: i.nome, codigo: i.codigo, unidadeCompra: i.unidade_compra, unidadeEstoque: i.unidade_estoque, fator: Number(i.fator_conversao),
  }));
}

export { lerData, lerNumero } from '@/domain/entrada';
