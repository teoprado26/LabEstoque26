// Leitura e gravação dos cadastros. As permissões (gestor/administrador) e a auditoria ficam no banco (RLS + trigger).
import type { Registro, TabelaCadastro, TabelaRef } from '@/cadastros/config';
import { CADASTROS } from '@/cadastros/config';
import { diferencas } from '@/cadastros/formulario';
import { supabase } from '@/lib/supabase';

export async function listarRegistros(labId: string, tabela: TabelaCadastro): Promise<Registro[]> {
  const { data, error } = await supabase.from(tabela).select('*').eq('lab_id', labId).order(CADASTROS[tabela].ordem);
  if (error) throw error;
  return data ?? [];
}

export async function obterRegistro(tabela: TabelaCadastro, id: string): Promise<Registro | null> {
  const { data, error } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Cria (id null) ou altera só os campos modificados. Retorna o id. */
export async function salvarRegistro(labId: string, tabela: TabelaCadastro, id: string | null, original: Registro | null, registro: Registro): Promise<string> {
  if (!id) {
    const { data, error } = await supabase.from(tabela).insert({ ...registro, lab_id: labId }).select('id').single();
    if (error) throw traduzir(error);
    return data.id as string;
  }
  const mudou = diferencas(original ?? {}, registro);
  if (Object.keys(mudou).length > 0) {
    const { error } = await supabase.from(tabela).update(mudou).eq('id', id);
    if (error) throw traduzir(error);
  }
  return id;
}

export interface OpcaoRef {
  id: string;
  nome: string;
  nivel?: string;
  pai_id?: string | null;
  ativo?: boolean;
}

export async function listarReferencias(labId: string, tabela: TabelaRef): Promise<OpcaoRef[]> {
  const colunas = tabela === 'locais' ? 'id, nome, nivel, pai_id, ativo' : 'id, nome, ativo';
  const { data, error } = await supabase.from(tabela).select(colunas).eq('lab_id', labId).order('nome');
  if (error) throw error;
  return (data ?? []) as unknown as OpcaoRef[];
}

export async function listarMembros(labId: string): Promise<OpcaoRef[]> {
  const { data, error } = await supabase.from('lab_membros').select('user_id, perfis_usuario ( nome, email )').eq('lab_id', labId).eq('ativo', true);
  if (error) throw error;
  const porId = new Map<string, OpcaoRef>();
  for (const m of (data ?? []) as unknown as { user_id: string; perfis_usuario: { nome: string; email: string } }[]) {
    porId.set(m.user_id, { id: m.user_id, nome: m.perfis_usuario.nome || m.perfis_usuario.email });
  }
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Mensagens do Postgres em linguagem do usuário. */
function traduzir(e: { code?: string; message: string }): Error {
  if (e.code === '23505') return new Error('Já existe um registro com este código ou nome neste laboratório.');
  if (e.code === '42501') return new Error('Seu perfil não permite alterar cadastros. Peça a um gestor.');
  return new Error(e.message);
}
