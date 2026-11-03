import type { ResultadoCalibracao, TipoServico } from '@/domain/equipamentos';
import { supabase } from '@/lib/supabase';

export interface EquipamentoSituacao {
  equipamento_id: string;
  codigo: string;
  nome: string;
  tipo: string;
  criticidade: 'V' | 'E' | 'D';
  local_id: string | null;
  ativo: boolean;
  exige_calibracao: boolean;
  periodicidade_calibracao_dias: number | null;
  periodicidade_manutencao_dias: number | null;
  ultima_calibracao: string | null;
  resultado_ultima_calibracao: ResultadoCalibracao | null;
  calibracao_valida_ate: string | null;
  calibracao_agendada: string | null;
  ultima_manutencao_preventiva: string | null;
  manutencao_prevista: string | null;
  manutencao_agendada: string | null;
  em_manutencao: boolean;
  situacao: string;
}

export interface Servico {
  id: string;
  equipamento_id: string;
  tipo: TipoServico;
  status: 'agendado' | 'em_andamento' | 'concluido' | 'cancelado';
  agendado_para: string | null;
  iniciado_em: string | null;
  realizado_em: string | null;
  executor: string | null;
  fornecedor_id: string | null;
  descricao: string | null;
  custo: number | null;
  resultado: ResultadoCalibracao | null;
  numero_certificado: string | null;
  certificado_url: string | null;
  valida_ate: string | null;
  incerteza: string | null;
  motivo_cancelamento: string | null;
  equipamentos?: { nome: string; codigo: string };
}

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export async function listarSituacao(labId: string): Promise<EquipamentoSituacao[]> {
  return ok(await supabase.from('v_equipamentos_situacao').select('*').eq('lab_id', labId).eq('ativo', true)) ?? [];
}

export async function obterSituacao(id: string): Promise<EquipamentoSituacao | null> {
  return ok(await supabase.from('v_equipamentos_situacao').select('*').eq('equipamento_id', id).maybeSingle());
}

/** Serviços abertos (agendados ou em andamento) do laboratório, por data. */
export async function listarAgenda(labId: string): Promise<Servico[]> {
  return (
    ok(await supabase.from('servicos_equipamento').select('*, equipamentos ( nome, codigo )').eq('lab_id', labId)
      .in('status', ['agendado', 'em_andamento']).order('agendado_para', { ascending: true, nullsFirst: true })) ?? []
  );
}

export async function listarServicos(equipamentoId: string): Promise<Servico[]> {
  return ok(await supabase.from('servicos_equipamento').select('*').eq('equipamento_id', equipamentoId).order('criado_em', { ascending: false })) ?? [];
}

export async function obterServico(id: string): Promise<Servico | null> {
  return ok(await supabase.from('servicos_equipamento').select('*, equipamentos ( nome, codigo )').eq('id', id).maybeSingle());
}

export async function agendarServico(p: { equipamento: string; tipo: TipoServico; data: string; executor?: string | null; fornecedor?: string | null; descricao?: string | null }) {
  return ok(await supabase.rpc('fn_agendar_servico', {
    p_equipamento: p.equipamento, p_tipo: p.tipo, p_data: p.data, p_executor: p.executor ?? null, p_fornecedor: p.fornecedor ?? null, p_descricao: p.descricao ?? null,
  })) as string;
}

export async function reagendarServico(servico: string, data: string, motivo: string) {
  ok(await supabase.rpc('fn_reagendar_servico', { p_servico: servico, p_data: data, p_motivo: motivo }));
}

export async function iniciarManutencao(equipamento: string, descricao: string, servico?: string | null) {
  return ok(await supabase.rpc('fn_iniciar_manutencao', { p_equipamento: equipamento, p_descricao: descricao, p_servico: servico ?? null })) as string;
}

export interface Conclusao {
  servico?: string | null;
  equipamento?: string | null;
  tipo?: TipoServico | null;
  realizadoEm: string;
  descricao?: string | null;
  executor?: string | null;
  fornecedor?: string | null;
  custo?: number | null;
  resultado?: ResultadoCalibracao | null;
  numeroCertificado?: string | null;
  certificadoUrl?: string | null;
  validaAte?: string | null;
  incerteza?: string | null;
}

export async function concluirServico(c: Conclusao) {
  return ok(await supabase.rpc('fn_concluir_servico', {
    p_servico: c.servico ?? null, p_realizado_em: c.realizadoEm, p_descricao: c.descricao ?? null, p_executor: c.executor ?? null,
    p_fornecedor: c.fornecedor ?? null, p_custo: c.custo ?? null, p_resultado: c.resultado ?? null,
    p_numero_certificado: c.numeroCertificado ?? null, p_certificado_url: c.certificadoUrl ?? null, p_valida_ate: c.validaAte ?? null,
    p_incerteza: c.incerteza ?? null, p_equipamento: c.equipamento ?? null, p_tipo: c.tipo ?? null,
  })) as string;
}

export async function cancelarServico(servico: string, motivo: string) {
  ok(await supabase.rpc('fn_cancelar_servico', { p_servico: servico, p_motivo: motivo }));
}
