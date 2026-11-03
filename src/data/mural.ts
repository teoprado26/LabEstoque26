// Mural da equipe e fotos da bancada (24 h). Fotos ficam no bucket privado "bancada" do Supabase Storage.
import { supabase } from '@/lib/supabase';

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const TAGS_MURAL = ['Rotina', 'Assepsia', 'Calibração', 'Amostras', 'Alerta'] as const;
export type TagMural = (typeof TAGS_MURAL)[number];

export interface Atividade {
  id: string; titulo: string; descricao: string | null; tag: TagMural; criado_em: string; realizada_em: string | null;
  autor_id: string; autor_nome: string; realizada_por_nome: string | null; comentarios: number;
}
export interface Comentario { id: string; texto: string; criado_em: string; autor_nome: string; autor_perfis?: string[] | null }

export async function listarMural(labId: string, limite = 30): Promise<Atividade[]> {
  return (ok(await supabase.from('v_mural').select('*').eq('lab_id', labId).order('criado_em', { ascending: false }).limit(limite)) ?? []) as Atividade[];
}

export async function comentariosDaAtividade(id: string): Promise<Comentario[]> {
  return (ok(await supabase.from('v_mural_comentarios').select('*').eq('atividade_id', id).order('criado_em')) ?? []) as Comentario[];
}

export async function publicarAtividade(labId: string, titulo: string, descricao: string | null, tag: TagMural) {
  ok(await supabase.from('mural_atividades').insert({ lab_id: labId, titulo, descricao, tag }));
}

export async function comentarAtividade(labId: string, atividade: string, texto: string) {
  ok(await supabase.from('mural_comentarios').insert({ lab_id: labId, atividade_id: atividade, texto }));
}

export const concluirAtividade = async (id: string, concluida: boolean) => { ok(await supabase.rpc('fn_concluir_atividade', { p_atividade: id, p_concluida: concluida })); };
export const arquivarAtividade = async (id: string) => { ok(await supabase.rpc('fn_arquivar_atividade', { p_atividade: id })); };

// ---------------------------------------------------------------- Fotos da bancada
export interface FotoBancada {
  id: string; titulo: string; descricao: string | null; tag: string | null; caminho: string; postada_em: string; expira_em: string;
  autor_id: string; autor_nome: string; curtidas: number; curtida_por_mim: boolean; comentarios: number; url?: string | null;
}

export async function listarFotos(labId: string): Promise<FotoBancada[]> {
  const fotos = (ok(await supabase.from('v_fotos_bancada').select('*').eq('lab_id', labId).order('postada_em', { ascending: false })) ?? []) as FotoBancada[];
  if (!fotos.length) return fotos;
  // Bucket privado: links assinados de 1 hora, só para quem é membro do laboratório.
  const { data } = await supabase.storage.from('bancada').createSignedUrls(fotos.map((f) => f.caminho), 3600);
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return fotos.map((f) => ({ ...f, url: urls.get(f.caminho) ?? null }));
}

export async function postarFoto(labId: string, userId: string, uri: string, mime: string | null, titulo: string, descricao: string | null, tag: string | null) {
  const ext = mime?.includes('png') ? 'png' : mime?.includes('webp') ? 'webp' : 'jpg';
  const caminho = `${labId}/${userId}/${Date.now()}.${ext}`;
  const bytes = await (await fetch(uri)).arrayBuffer();
  const up = await supabase.storage.from('bancada').upload(caminho, bytes, { contentType: mime ?? 'image/jpeg', upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.from('fotos_bancada').insert({ lab_id: labId, titulo, descricao, tag, caminho });
  if (error) {
    await supabase.storage.from('bancada').remove([caminho]);
    throw new Error(error.message);
  }
}

export async function curtirFoto(labId: string, foto: FotoBancada) {
  if (foto.curtida_por_mim) ok(await supabase.from('fotos_curtidas').delete().eq('foto_id', foto.id).eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? ''));
  else ok(await supabase.from('fotos_curtidas').insert({ foto_id: foto.id, lab_id: labId }));
}

export async function comentariosDaFoto(id: string): Promise<Comentario[]> {
  return (ok(await supabase.from('v_fotos_comentarios').select('*').eq('foto_id', id).order('criado_em')) ?? []) as Comentario[];
}

export async function comentarFoto(labId: string, foto: string, texto: string) {
  ok(await supabase.from('fotos_comentarios').insert({ lab_id: labId, foto_id: foto, texto }));
}

export async function removerFoto(foto: FotoBancada) {
  ok(await supabase.from('fotos_bancada').delete().eq('id', foto.id));
  await supabase.storage.from('bancada').remove([foto.caminho]);
}

export const horasRestantes = (expiraEm: string) => Math.max(0, Math.ceil((new Date(expiraEm).getTime() - Date.now()) / 3600e3));
