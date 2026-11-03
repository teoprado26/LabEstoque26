// Chamadas das operações do livro-razão (RPC). As regras ficam no banco; aqui só se monta a chamada.
import { supabase } from '@/lib/supabase';
import type { CondicaoDevolucao, MotivoPerda } from '@/domain/tipos';

const rpc = async <T,>(nome: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const ROTULO_MOTIVO_PERDA: Record<MotivoPerda, string> = {
  vencimento: 'Vencimento', contaminacao: 'Contaminação', deterioracao: 'Deterioração', armazenamento_inadequado: 'Armazenamento inadequado',
  excursao_temperatura: 'Excursão de temperatura', dano_fisico: 'Dano físico', extravio: 'Extravio', falha_transporte: 'Falha de transporte',
  descarte_tecnico: 'Descarte técnico', outro: 'Outro',
};

export const ROTULO_CONDICAO: Record<CondicaoDevolucao, string> = {
  integro_fechado: 'Íntegro e fechado', aberto: 'Aberto', danificado: 'Danificado', armazenamento_comprometido: 'Armazenamento comprometido',
};

export const registrarPerda = (p: { lote: string; local: string; qtd: number; motivo: MotivoPerda; descricao?: string | null; projeto?: string | null }) =>
  rpc<string>('fn_registrar_perda', { p_lote: p.lote, p_local: p.local, p_qtd: p.qtd, p_motivo: p.motivo, p_descricao: p.descricao ?? null, p_projeto: p.projeto ?? null });

export const transferir = (p: { lote: string; origem: string; destino: string; qtd: number }) =>
  rpc<string>('fn_transferir', { p_lote: p.lote, p_origem: p.origem, p_destino: p.destino, p_qtd: p.qtd });

export const devolver = (p: { lote: string; local: string; qtd: number; condicao: CondicaoDevolucao; observacao?: string | null }) =>
  rpc<string>('fn_devolver', { p_lote: p.lote, p_local: p.local, p_qtd: p.qtd, p_condicao: p.condicao, p_observacao: p.observacao ?? null });

export const avaliarDevolucao = (devolucao: string, avaliacao: 'reintegrar' | 'descartar', observacao?: string | null) =>
  rpc<void>('fn_avaliar_devolucao', { p_devolucao: devolucao, p_avaliacao: avaliacao, p_observacao: observacao ?? null });

export const estornar = (mov: string, motivo: string) => rpc<string>('fn_estornar', { p_mov: mov, p_motivo: motivo });

export const iniciarInventario = (lab: string, tipo: 'ciclico' | 'geral', local?: string | null, categoria?: string | null) =>
  rpc<string>('fn_iniciar_inventario', { p_lab: lab, p_tipo: tipo, p_local: local ?? null, p_categoria: categoria ?? null });
export const registrarContagem = (contagem: string, qtd: number) => rpc<void>('fn_registrar_contagem', { p_contagem: contagem, p_qtd: qtd });
export const aprovarAjuste = (contagem: string, aprovar: boolean, justificativa: string) =>
  rpc<void>('fn_aprovar_ajuste', { p_contagem: contagem, p_aprovar: aprovar, p_justificativa: justificativa });
export const encerrarInventario = (inv: string) => rpc<void>('fn_encerrar_inventario', { p_inventario: inv });

export const enviarRequisicao = (req: string) => rpc<void>('fn_enviar_requisicao', { p_requisicao: req });
export const aprovarRequisicao = (req: string, aprovadas?: Record<string, number>) => rpc<void>('fn_aprovar_requisicao', { p_requisicao: req, p_aprovadas: aprovadas ?? null });
export const cancelarRequisicao = (req: string) => rpc<void>('fn_cancelar_requisicao', { p_requisicao: req });
export const encerrarRequisicao = (req: string, motivos: Record<string, { motivo: string; causa_ruptura?: string | null }>) =>
  rpc<string>('fn_encerrar_requisicao', { p_requisicao: req, p_motivos: motivos });

export const adicionarMembro = (lab: string, email: string, perfil: string) => rpc<string>('fn_adicionar_membro', { p_lab: lab, p_email: email, p_perfil: perfil });
export const removerPerfil = (lab: string, user: string, perfil: string) => rpc<void>('fn_remover_perfil', { p_lab: lab, p_user: user, p_perfil: perfil });
export const listarMembrosLab = (lab: string) =>
  rpc<{ user_id: string; nome: string; email: string; perfis: string[] }[]>('fn_listar_membros', { p_lab: lab });
