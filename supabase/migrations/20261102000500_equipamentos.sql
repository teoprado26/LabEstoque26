-- Equipamentos: cadastro, manutenção (preventiva e corretiva) e calibração, com agenda.
-- A situação de cada equipamento é calculada numa única view (v_equipamentos_situacao) e só gera alertas;
-- nada é bloqueado automaticamente.

create type tipo_servico as enum ('manutencao_preventiva', 'manutencao_corretiva', 'calibracao');
create type status_servico as enum ('agendado', 'em_andamento', 'concluido', 'cancelado');
create type resultado_calibracao as enum ('aprovado', 'aprovado_com_restricao', 'reprovado');

create table equipamentos (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  codigo text not null,
  nome text not null,
  tipo text not null check (tipo in ('centrifuga', 'balanca', 'pipeta', 'freezer', 'geladeira', 'ultrafreezer', 'estufa_co2',
    'cabine_biosseguranca', 'autoclave', 'microscopio', 'phmetro', 'banho_maria', 'termometro', 'espectrofotometro', 'outro')),
  fabricante text,
  modelo text,
  numero_serie text,
  -- Onde fica; para freezer/geladeira, é o próprio local de armazenamento.
  local_id uuid references locais (id),
  responsavel_id uuid references perfis_usuario (id),
  fornecedor_assistencia_id uuid references fornecedores (id),
  criticidade criticidade not null default 'E',
  exige_calibracao boolean not null default false,
  periodicidade_calibracao_dias int check (periodicidade_calibracao_dias > 0),
  periodicidade_manutencao_dias int check (periodicidade_manutencao_dias > 0),
  antecedencia_alerta_dias int not null default 30 check (antecedencia_alerta_dias >= 0),
  faixa_uso text,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (lab_id, codigo),
  check (not exige_calibracao or periodicidade_calibracao_dias is not null)
);

create table servicos_equipamento (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  equipamento_id uuid not null references equipamentos (id),
  tipo tipo_servico not null,
  status status_servico not null default 'agendado',
  agendado_para date,
  iniciado_em timestamptz,
  realizado_em date,
  executor text,
  fornecedor_id uuid references fornecedores (id),
  descricao text,
  custo numeric check (custo >= 0),
  -- Calibração
  resultado resultado_calibracao,
  numero_certificado text,
  certificado_url text,
  valida_ate date,
  incerteza text,
  -- Cancelamento
  motivo_cancelamento text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  concluido_por uuid,
  check (status <> 'agendado' or agendado_para is not null),
  check (status <> 'concluido' or realizado_em is not null),
  check (status <> 'concluido' or tipo <> 'calibracao' or (resultado is not null and valida_ate is not null)),
  check (status <> 'cancelado' or coalesce(length(trim(motivo_cancelamento)), 0) > 0),
  check (tipo = 'calibracao' or (resultado is null and valida_ate is null))
);

create index on servicos_equipamento (lab_id, status, agendado_para);
create index on servicos_equipamento (equipamento_id, tipo, realizado_em);

-- Integridade: referências do mesmo laboratório.
create or replace function fn_validar_equipamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.local_id is not null and not exists (select 1 from locais where id = new.local_id and lab_id = new.lab_id) then
    raise exception 'O local pertence a outro laboratório.';
  end if;
  if new.fornecedor_assistencia_id is not null and not exists (select 1 from fornecedores where id = new.fornecedor_assistencia_id and lab_id = new.lab_id) then
    raise exception 'O fornecedor pertence a outro laboratório.';
  end if;
  if new.responsavel_id is not null and not exists (select 1 from lab_membros where lab_id = new.lab_id and user_id = new.responsavel_id and ativo) then
    raise exception 'O responsável precisa ser membro do laboratório.';
  end if;
  if new.exige_calibracao and new.periodicidade_calibracao_dias is null then
    raise exception 'Informe a periodicidade da calibração.';
  end if;
  return new;
end $$;

create trigger trg_validar_equipamento before insert or update on equipamentos
for each row execute function fn_validar_equipamento();

create trigger trg_lab_imutavel before update of lab_id on equipamentos for each row execute function fn_lab_imutavel();
create trigger trg_auditoria after insert or update or delete on equipamentos for each row execute function fn_auditar();
create trigger trg_auditoria after insert or update or delete on servicos_equipamento for each row execute function fn_auditar();
create trigger trg_sem_delete before delete on equipamentos for each row execute function fn_bloquear_alteracao();
create trigger trg_sem_delete before delete on servicos_equipamento for each row execute function fn_bloquear_alteracao();

-- Serviço concluído ou cancelado é histórico: não muda mais.
create or replace function fn_servico_encerrado_imutavel() returns trigger
language plpgsql as $$
begin
  if old.status in ('concluido', 'cancelado') then
    raise exception 'Serviço encerrado não pode ser alterado; registre um novo serviço.';
  end if;
  return new;
end $$;

create trigger trg_servico_encerrado before update on servicos_equipamento
for each row execute function fn_servico_encerrado_imutavel();

-- =====================================================================
-- Situação: definição única
-- =====================================================================
create view v_equipamentos_situacao with (security_invoker = true) as
with cal as (
  select distinct on (equipamento_id) equipamento_id, realizado_em, resultado, valida_ate
  from servicos_equipamento where tipo = 'calibracao' and status = 'concluido'
  order by equipamento_id, realizado_em desc, criado_em desc
), prev as (
  select equipamento_id, max(realizado_em) as ultima
  from servicos_equipamento where tipo = 'manutencao_preventiva' and status = 'concluido' group by equipamento_id
), ag as (
  select equipamento_id,
    min(agendado_para) filter (where tipo = 'calibracao') as calibracao_agendada,
    min(agendado_para) filter (where tipo <> 'calibracao') as manutencao_agendada
  from servicos_equipamento where status = 'agendado' group by equipamento_id
), andamento as (
  select equipamento_id, count(*) as n from servicos_equipamento where status = 'em_andamento' group by equipamento_id
)
select e.id as equipamento_id, e.lab_id, e.codigo, e.nome, e.tipo, e.criticidade, e.local_id, e.responsavel_id, e.ativo,
  e.exige_calibracao, e.periodicidade_calibracao_dias, e.periodicidade_manutencao_dias, e.antecedencia_alerta_dias,
  cal.realizado_em as ultima_calibracao, cal.resultado as resultado_ultima_calibracao, cal.valida_ate as calibracao_valida_ate,
  ag.calibracao_agendada,
  prev.ultima as ultima_manutencao_preventiva,
  prev.ultima + e.periodicidade_manutencao_dias as manutencao_prevista,
  ag.manutencao_agendada,
  coalesce(andamento.n, 0) > 0 as em_manutencao,
  case
    when coalesce(andamento.n, 0) > 0 then 'em_manutencao'
    when e.exige_calibracao and cal.equipamento_id is null then 'sem_calibracao'
    when e.exige_calibracao and cal.resultado = 'reprovado' then 'calibracao_reprovada'
    when e.exige_calibracao and cal.valida_ate < fn_hoje() then 'calibracao_vencida'
    when e.periodicidade_manutencao_dias is not null and prev.ultima + e.periodicidade_manutencao_dias < fn_hoje()
         and coalesce(ag.manutencao_agendada, prev.ultima + e.periodicidade_manutencao_dias) < fn_hoje() then 'manutencao_atrasada'
    when e.exige_calibracao and cal.valida_ate <= fn_hoje() + e.antecedencia_alerta_dias then 'calibracao_a_vencer'
    when e.periodicidade_manutencao_dias is not null and prev.ultima + e.periodicidade_manutencao_dias <= fn_hoje() + e.antecedencia_alerta_dias then 'manutencao_proxima'
    when e.periodicidade_manutencao_dias is not null and prev.ultima is null then 'sem_manutencao'
    else 'ok'
  end as situacao
from equipamentos e
left join cal on cal.equipamento_id = e.id
left join prev on prev.equipamento_id = e.id
left join ag on ag.equipamento_id = e.id
left join andamento on andamento.equipamento_id = e.id;

-- =====================================================================
-- Agenda e registro (RPC)
-- =====================================================================
create or replace function fn_agendar_servico(p_equipamento uuid, p_tipo tipo_servico, p_data date,
  p_executor text default null, p_fornecedor uuid default null, p_descricao text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare e equipamentos%rowtype; v_id uuid;
begin
  select * into e from equipamentos where id = p_equipamento;
  if not found or not e.ativo then raise exception 'Equipamento inexistente ou inativo.'; end if;
  perform fn_exigir_perfil(e.lab_id, '{tecnico,gestor}');
  if p_data is null then raise exception 'Informe a data.'; end if;
  if p_data < fn_hoje() then raise exception 'A data agendada não pode estar no passado; para algo já feito, registre o serviço realizado.'; end if;
  if p_fornecedor is not null and not exists (select 1 from fornecedores where id = p_fornecedor and lab_id = e.lab_id) then
    raise exception 'O fornecedor pertence a outro laboratório.';
  end if;
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, agendado_para, executor, fornecedor_id, descricao)
  values (e.lab_id, p_equipamento, p_tipo, p_data, p_executor, p_fornecedor, p_descricao) returning id into v_id;
  return v_id;
end $$;

create or replace function fn_reagendar_servico(p_servico uuid, p_data date, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare s servicos_equipamento%rowtype;
begin
  select * into s from servicos_equipamento where id = p_servico;
  perform fn_exigir_perfil(s.lab_id, '{tecnico,gestor}');
  if s.status <> 'agendado' then raise exception 'Só serviços agendados podem ser reagendados.'; end if;
  if p_data < fn_hoje() then raise exception 'A nova data não pode estar no passado.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do reagendamento.'; end if;
  update servicos_equipamento set agendado_para = p_data,
    descricao = concat_ws(E'\n', descricao, format('Reagendado de %s: %s', to_char(s.agendado_para, 'DD/MM/YYYY'), p_motivo))
  where id = p_servico;
end $$;

-- Manutenção corretiva começa na hora: o equipamento passa a "em manutenção" até a conclusão.
create or replace function fn_iniciar_manutencao(p_equipamento uuid, p_descricao text, p_servico uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare e equipamentos%rowtype; v_id uuid := p_servico;
begin
  select * into e from equipamentos where id = p_equipamento;
  perform fn_exigir_perfil(e.lab_id, '{tecnico,gestor}');
  if coalesce(trim(p_descricao), '') = '' then raise exception 'Descreva o problema ou o serviço.'; end if;
  if v_id is null then
    insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, iniciado_em, descricao)
    values (e.lab_id, p_equipamento, 'manutencao_corretiva', 'em_andamento', now(), p_descricao) returning id into v_id;
  else
    update servicos_equipamento set status = 'em_andamento', iniciado_em = now(), descricao = concat_ws(E'\n', descricao, p_descricao)
    where id = v_id and equipamento_id = p_equipamento and status = 'agendado' and tipo <> 'calibracao';
    if not found then raise exception 'Serviço não está agendado para este equipamento.'; end if;
  end if;
  return v_id;
end $$;

-- Conclui um serviço agendado/em andamento, ou registra direto um serviço já realizado (p_servico nulo).
create or replace function fn_concluir_servico(
  p_servico uuid, p_realizado_em date, p_descricao text default null, p_executor text default null, p_fornecedor uuid default null,
  p_custo numeric default null, p_resultado resultado_calibracao default null, p_numero_certificado text default null,
  p_certificado_url text default null, p_valida_ate date default null, p_incerteza text default null,
  p_equipamento uuid default null, p_tipo tipo_servico default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare s servicos_equipamento%rowtype; e equipamentos%rowtype; v_id uuid := p_servico; v_tipo tipo_servico; v_valida date;
begin
  if v_id is null then
    select * into e from equipamentos where id = p_equipamento;
    if not found then raise exception 'Equipamento inexistente.'; end if;
    if p_tipo is null then raise exception 'Informe o tipo de serviço.'; end if;
    v_tipo := p_tipo;
  else
    select * into s from servicos_equipamento where id = v_id;
    if not found then raise exception 'Serviço inexistente.'; end if;
    if s.status not in ('agendado', 'em_andamento') then raise exception 'Serviço já encerrado.'; end if;
    select * into e from equipamentos where id = s.equipamento_id;
    v_tipo := s.tipo;
  end if;
  perform fn_exigir_perfil(e.lab_id, '{tecnico,gestor}');
  if p_realizado_em is null or p_realizado_em > fn_hoje() then raise exception 'Informe a data de realização (hoje ou antes).'; end if;
  if p_fornecedor is not null and not exists (select 1 from fornecedores where id = p_fornecedor and lab_id = e.lab_id) then
    raise exception 'O fornecedor pertence a outro laboratório.';
  end if;

  if v_tipo = 'calibracao' then
    if p_resultado is null then raise exception 'Informe o resultado da calibração.'; end if;
    v_valida := coalesce(p_valida_ate, p_realizado_em + e.periodicidade_calibracao_dias);
    if v_valida is null then raise exception 'Informe a validade da calibração ou a periodicidade no cadastro do equipamento.'; end if;
    if v_valida < p_realizado_em then raise exception 'A validade não pode ser anterior à realização.'; end if;
  elsif p_resultado is not null or p_valida_ate is not null then
    raise exception 'Resultado e validade só se aplicam à calibração.';
  end if;

  if v_id is null then
    insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, realizado_em, executor, fornecedor_id, descricao, custo,
      resultado, numero_certificado, certificado_url, valida_ate, incerteza, concluido_por)
    values (e.lab_id, e.id, v_tipo, 'concluido', p_realizado_em, p_executor, p_fornecedor, p_descricao, p_custo,
      p_resultado, p_numero_certificado, p_certificado_url, v_valida, p_incerteza, auth.uid())
    returning id into v_id;
  else
    update servicos_equipamento set status = 'concluido', realizado_em = p_realizado_em,
      executor = coalesce(p_executor, executor), fornecedor_id = coalesce(p_fornecedor, fornecedor_id),
      descricao = concat_ws(E'\n', descricao, p_descricao), custo = p_custo,
      resultado = p_resultado, numero_certificado = p_numero_certificado, certificado_url = p_certificado_url,
      valida_ate = v_valida, incerteza = p_incerteza, concluido_por = auth.uid()
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function fn_cancelar_servico(p_servico uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare s servicos_equipamento%rowtype;
begin
  select * into s from servicos_equipamento where id = p_servico;
  perform fn_exigir_perfil(s.lab_id, '{tecnico,gestor}');
  if s.status not in ('agendado', 'em_andamento') then raise exception 'Serviço já encerrado.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  update servicos_equipamento set status = 'cancelado', motivo_cancelamento = p_motivo where id = p_servico;
end $$;

-- =====================================================================
-- RLS: leitura por membros; cadastro por gestor; serviços só por RPC.
-- =====================================================================
alter table equipamentos enable row level security;
alter table servicos_equipamento enable row level security;
create policy membro_le on equipamentos for select to authenticated using (fn_membro(lab_id));
create policy gestor_insere on equipamentos for insert to authenticated with check (fn_tem_perfil(lab_id, '{gestor}'));
create policy gestor_altera on equipamentos for update to authenticated using (fn_tem_perfil(lab_id, '{gestor}')) with check (fn_tem_perfil(lab_id, '{gestor}'));
create policy membro_le on servicos_equipamento for select to authenticated using (fn_membro(lab_id));

-- =====================================================================
-- Demonstração: equipamentos em situações variadas (chamado junto com fn_carregar_demonstracao)
-- =====================================================================
create or replace function fn_demo_equipamentos(p_lab uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_h date := fn_hoje(); v_frz uuid; v_gel uuid; v_sala uuid; e uuid;
begin
  perform fn_exigir_perfil(p_lab, '{}');
  if exists (select 1 from equipamentos where lab_id = p_lab) then return; end if;
  select id into v_frz from locais where lab_id = p_lab and nivel = 'equipamento' and nome like 'Freezer%' limit 1;
  select id into v_gel from locais where lab_id = p_lab and nivel = 'equipamento' and nome like 'Geladeira%' limit 1;
  select id into v_sala from locais where lab_id = p_lab and nivel = 'sala' limit 1;

  -- Balança: calibração em dia, preventiva em dia
  insert into equipamentos (lab_id, codigo, nome, tipo, fabricante, local_id, criticidade, exige_calibracao, periodicidade_calibracao_dias, periodicidade_manutencao_dias, faixa_uso)
  values (p_lab, 'PAT-0101', 'Balança analítica 0,1 mg', 'balanca', 'Fabricante Demo', v_sala, 'V', true, 365, 180, '0,1 mg a 220 g') returning id into e;
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, realizado_em, resultado, numero_certificado, valida_ate, executor)
  values (p_lab, e, 'calibracao', 'concluido', v_h - 120, 'aprovado', 'RBC-2026-0412', v_h + 245, 'Laboratório de calibração RBC');
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, realizado_em, descricao)
  values (p_lab, e, 'manutencao_preventiva', 'concluido', v_h - 60, 'Limpeza e verificação de nível');

  -- Pipeta: calibração vence em 12 dias, já agendada
  insert into equipamentos (lab_id, codigo, nome, tipo, local_id, criticidade, exige_calibracao, periodicidade_calibracao_dias, faixa_uso)
  values (p_lab, 'PIP-020', 'Pipeta monocanal 20–200 µL', 'pipeta', v_sala, 'E', true, 180, '20 a 200 µL') returning id into e;
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, realizado_em, resultado, numero_certificado, valida_ate)
  values (p_lab, e, 'calibracao', 'concluido', v_h - 168, 'aprovado', 'RBC-2026-0233', v_h + 12);
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, agendado_para, executor)
  values (p_lab, e, 'calibracao', 'agendado', v_h + 8, 'Laboratório de calibração RBC');

  -- Freezer: preventiva atrasada
  insert into equipamentos (lab_id, codigo, nome, tipo, local_id, criticidade, periodicidade_manutencao_dias)
  values (p_lab, 'PAT-0230', 'Freezer −20 °C vertical', 'freezer', v_frz, 'V', 180) returning id into e;
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, realizado_em, descricao)
  values (p_lab, e, 'manutencao_preventiva', 'concluido', v_h - 210, 'Degelo e troca da borracha de vedação');

  -- Termômetro da geladeira: calibração vencida
  insert into equipamentos (lab_id, codigo, nome, tipo, local_id, criticidade, exige_calibracao, periodicidade_calibracao_dias)
  values (p_lab, 'TER-004', 'Termômetro digital da geladeira', 'termometro', v_gel, 'E', true, 365) returning id into e;
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, realizado_em, resultado, numero_certificado, valida_ate)
  values (p_lab, e, 'calibracao', 'concluido', v_h - 380, 'aprovado', 'RBC-2025-1190', v_h - 15);

  -- Centrífuga: em manutenção corretiva
  insert into equipamentos (lab_id, codigo, nome, tipo, local_id, criticidade, periodicidade_manutencao_dias)
  values (p_lab, 'PAT-0315', 'Centrífuga refrigerada', 'centrifuga', v_sala, 'E', 365) returning id into e;
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, realizado_em, descricao)
  values (p_lab, e, 'manutencao_preventiva', 'concluido', v_h - 100, 'Revisão anual');
  insert into servicos_equipamento (lab_id, equipamento_id, tipo, status, iniciado_em, descricao)
  values (p_lab, e, 'manutencao_corretiva', 'em_andamento', now() - interval '2 days', 'Desbalanceamento no rotor; aguardando assistência');
end $$;
