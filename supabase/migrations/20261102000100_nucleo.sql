-- LabEstoque — Fase 1: núcleo operacional
-- Princípios: o livro-razão (movimentacoes) só aceita INSERT; saldo = Σ movimentações (v_saldo);
-- "disponível" tem uma única definição (v_disponivel); toda escrita operacional passa por RPC.

set check_function_bodies = off;

-- =====================================================================
-- Tipos
-- =====================================================================
create type perfil_lab as enum ('administrador', 'gestor', 'tecnico', 'solicitante', 'coordenador', 'auditor');
create type lote_status as enum ('QUARENTENA', 'LIBERADO', 'ABERTO', 'BLOQUEADO', 'VENCIDO', 'BAIXADO');
create type mov_tipo as enum ('ENTRADA', 'DISPENSACAO', 'DEVOLUCAO', 'TRANSFERENCIA', 'PERDA', 'AJUSTE_INVENTARIO', 'ESTORNO');
create type criticidade as enum ('V', 'E', 'D');
create type nivel_local as enum ('laboratorio', 'sala', 'equipamento', 'prateleira', 'caixa', 'posicao');
create type requisicao_status as enum ('rascunho', 'pendente_aprovacao', 'aprovada', 'atendida', 'parcial', 'nao_atendida', 'cancelada');
create type reserva_status as enum ('ativa', 'consumida', 'expirada', 'cancelada');
create type inventario_status as enum ('aberto', 'em_aprovacao', 'encerrado');
create type contagem_status as enum ('pendente', 'contada', 'aprovada', 'rejeitada');

-- =====================================================================
-- Laboratórios, usuários e perfis
-- =====================================================================
create table laboratorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table perfis_usuario (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text not null,
  criado_em timestamptz not null default now()
);

create table lab_membros (
  lab_id uuid not null references laboratorios (id),
  user_id uuid not null references perfis_usuario (id),
  perfil perfil_lab not null,
  ativo boolean not null default true,
  primary key (lab_id, user_id, perfil)
);

-- LGPD: só nome, e-mail e perfil.
create or replace function fn_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis_usuario (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_novo_usuario after insert on auth.users
for each row execute function fn_novo_usuario();

create or replace function fn_membro(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lab_membros m where m.lab_id = p_lab and m.user_id = auth.uid() and m.ativo);
$$;

create or replace function fn_tem_perfil(p_lab uuid, p_perfis perfil_lab[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lab_membros m
    where m.lab_id = p_lab and m.user_id = auth.uid() and m.ativo
      and (m.perfil = any (p_perfis) or m.perfil = 'administrador')
  );
$$;

create or replace function fn_exigir_perfil(p_lab uuid, p_perfis perfil_lab[]) returns void
language plpgsql stable as $$
begin
  if not fn_tem_perfil(p_lab, p_perfis) then
    raise exception 'Seu perfil não permite esta operação.' using errcode = '42501';
  end if;
end $$;

-- =====================================================================
-- Parâmetros e metas
-- =====================================================================
create table parametros_lab (
  lab_id uuid primary key references laboratorios (id),
  janela_consumo_dias int not null default 90,
  horizontes_vencimento int[] not null default '{30,60,90}',
  limites_ocupacao int[] not null default '{80,90,100}',
  sem_movimentacao_dias int not null default 180,
  abc_cortes numeric[] not null default '{80,15,5}',
  nivel_servico jsonb not null default '{"V":0.98,"E":0.95,"D":0.90}',
  tolerancia_contavel numeric not null default 0,
  tolerancia_volume_massa_pct numeric not null default 2,
  min_dias_historico int not null default 60,
  min_saidas int not null default 3,
  min_pedidos_lead_time int not null default 3,
  min_meses_abc int not null default 6,
  periodo_revisao_dias int not null default 30,
  tecnico_libera_lote boolean not null default false,
  incluir_sem_custo boolean not null default false
);

create table metas_kpi (
  lab_id uuid not null references laboratorios (id),
  kpi_id text not null,
  meta numeric,
  limite_alerta numeric,
  primary key (lab_id, kpi_id)
);

-- =====================================================================
-- Cadastros
-- =====================================================================
create table categorias (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  nome text not null,
  ativo boolean not null default true,
  unique (lab_id, nome)
);

create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  nome text not null,
  cnpj text,
  contato text,
  lead_time_padrao_dias numeric,
  ativo boolean not null default true
);

create table projetos (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  codigo text not null,
  nome text not null,
  fonte_recurso text,
  coordenador_id uuid references perfis_usuario (id),
  exige_aprovacao boolean not null default false,
  ativo boolean not null default true,
  unique (lab_id, codigo)
);

create table itens (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  codigo text not null,
  nome text not null,
  categoria_id uuid references categorias (id),
  tipo text not null check (tipo in ('reagente', 'consumivel', 'vidraria', 'epi', 'meio_cultura', 'kit', 'outro')),
  unidade_compra text not null,
  unidade_estoque text not null,
  fator_conversao numeric not null default 1 check (fator_conversao > 0),
  unidade_contavel boolean not null default true,
  multiplo_embalagem numeric not null default 1 check (multiplo_embalagem > 0),
  temp_min numeric,
  temp_max numeric,
  protegido_luz boolean not null default false,
  umidade_controlada boolean not null default false,
  classe_compatibilidade text,
  criticidade criticidade not null default 'E',
  validade_pos_abertura_dias int,
  validade_tipica_dias int,
  fds_url text,
  controlado boolean not null default false,
  ativo boolean not null default true,
  -- Custo médio ponderado móvel: cache recalculado a cada ENTRADA (fonte = livro-razão).
  custo_medio numeric,
  -- Sobrescritas manuais de reposição (o calculado continua visível)
  lead_time_manual_dias numeric,
  es_manual numeric,
  pr_manual numeric,
  justificativa_manual text,
  criado_em timestamptz not null default now(),
  unique (lab_id, codigo)
);

create table locais (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  pai_id uuid references locais (id),
  nivel nivel_local not null,
  nome text not null,
  temp_min numeric,
  temp_max numeric,
  classes_aceitas text[],
  capacidade numeric,
  unidade_capacidade text,
  grade_linhas int,
  grade_colunas int,
  -- false = excursão de temperatura / não conformidade aberta: material ali não é disponível
  conforme boolean not null default true,
  ativo boolean not null default true
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  item_id uuid not null references itens (id),
  numero text not null,
  fabricante text,
  fornecedor_id uuid references fornecedores (id),
  fabricacao date,
  validade date,
  custo_unitario numeric check (custo_unitario >= 0),
  status lote_status not null default 'QUARENTENA',
  aberto_em timestamptz,
  temp_chegada numeric,
  observacao text,
  -- Material devolvido vira um lote derivado BLOQUEADO, para não bloquear o saldo restante do lote original.
  lote_origem_id uuid references lotes (id),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  unique (item_id, numero)
);

create table lote_status_historico (
  id bigint generated always as identity primary key,
  lab_id uuid not null,
  lote_id uuid not null references lotes (id),
  de lote_status,
  para lote_status not null,
  motivo text,
  usuario_id uuid default auth.uid(),
  em timestamptz not null default now()
);

-- =====================================================================
-- Requisições e reservas
-- =====================================================================
create table requisicoes (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  numero bigint generated always as identity,
  solicitante_id uuid not null references perfis_usuario (id) default auth.uid(),
  projeto_id uuid not null references projetos (id),
  finalidade text not null,
  status requisicao_status not null default 'pendente_aprovacao',
  balcao boolean not null default false,
  criada_em timestamptz not null default now(),
  aprovada_em timestamptz,
  aprovada_por uuid,
  atendida_em timestamptz,
  cancelada_em timestamptz
);

create table requisicao_linhas (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  requisicao_id uuid not null references requisicoes (id),
  item_id uuid references itens (id),
  descricao_fora_catalogo text,
  qtd_solicitada numeric not null check (qtd_solicitada > 0),
  qtd_aprovada numeric,
  qtd_atendida numeric not null default 0,
  motivo_nao_atendimento text,
  causa_ruptura text check (causa_ruptura in ('consumo_acima_previsto', 'atraso_fornecedor', 'compra_nao_realizada', 'lote_bloqueado', 'perda', 'erro_saldo')),
  encerrada boolean not null default false,
  check (item_id is not null or descricao_fora_catalogo is not null)
);

create table reservas (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  item_id uuid not null references itens (id),
  lote_id uuid references lotes (id),
  local_id uuid references locais (id),
  quantidade numeric not null check (quantidade > 0),
  projeto_id uuid not null references projetos (id),
  finalidade text,
  uso_previsto date not null,
  valida_ate date not null,
  status reserva_status not null default 'ativa',
  criada_por uuid default auth.uid(),
  criada_em timestamptz not null default now(),
  -- reserva de lote precisa do local, para não descontar o mesmo saldo duas vezes
  check (lote_id is null or local_id is not null)
);

-- =====================================================================
-- Livro-razão
-- =====================================================================
create table movimentacoes (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  tipo mov_tipo not null,
  item_id uuid not null references itens (id),
  lote_id uuid not null references lotes (id),
  local_origem_id uuid references locais (id),
  local_destino_id uuid references locais (id),
  quantidade numeric not null check (quantidade > 0),
  custo_unitario numeric,
  projeto_id uuid references projetos (id),
  finalidade text,
  requisicao_linha_id uuid references requisicao_linhas (id),
  motivo text,
  descricao_motivo text,
  justificativa_fefo text,
  estorno_de uuid unique references movimentacoes (id),
  ocorrido_em timestamptz not null default now(),
  registrado_em timestamptz not null default now(),
  usuario_id uuid not null default auth.uid(),
  check (
    case tipo
      when 'ENTRADA' then local_destino_id is not null and local_origem_id is null
      when 'DEVOLUCAO' then local_destino_id is not null and local_origem_id is null
      when 'DISPENSACAO' then local_origem_id is not null and local_destino_id is null and projeto_id is not null
      when 'PERDA' then local_origem_id is not null and local_destino_id is null and motivo is not null
      when 'TRANSFERENCIA' then local_origem_id is not null and local_destino_id is not null and local_origem_id <> local_destino_id
      when 'AJUSTE_INVENTARIO' then (local_origem_id is null) <> (local_destino_id is null)
      when 'ESTORNO' then estorno_de is not null and motivo is not null
    end
  ),
  check (tipo <> 'PERDA' or motivo <> 'outro' or coalesce(length(trim(descricao_motivo)), 0) > 0)
);

create index on movimentacoes (lab_id, item_id, ocorrido_em);
create index on movimentacoes (lote_id);
create index on movimentacoes (lab_id, tipo, ocorrido_em);

create or replace function fn_bloquear_alteracao() returns trigger
language plpgsql as $$
begin
  raise exception 'Registros de % são imutáveis. Use um estorno ou ajuste justificado.', tg_table_name
    using errcode = '42501';
end $$;

create trigger trg_mov_imutavel before update or delete on movimentacoes
for each row execute function fn_bloquear_alteracao();

-- Efeito de cada movimentação no saldo: +destino, −origem (vale também para estornos, que invertem os locais).
create view v_mov_efeito with (security_invoker = true) as
  select m.lab_id, m.item_id, m.lote_id, m.local_destino_id as local_id, m.quantidade as delta, m.ocorrido_em, m.tipo, m.id as mov_id
  from movimentacoes m where m.local_destino_id is not null
  union all
  select m.lab_id, m.item_id, m.lote_id, m.local_origem_id, -m.quantidade, m.ocorrido_em, m.tipo, m.id
  from movimentacoes m where m.local_origem_id is not null;

create view v_saldo with (security_invoker = true) as
  select lab_id, item_id, lote_id, local_id, sum(delta) as saldo
  from v_mov_efeito
  group by lab_id, item_id, lote_id, local_id
  having sum(delta) <> 0;

create or replace function fn_hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function fn_validade_efetiva(p_validade date, p_aberto_em timestamptz, p_dias_pos int) returns date
language sql immutable as $$
  select case
    when p_aberto_em is null or p_dias_pos is null then p_validade
    else least(coalesce(p_validade, 'infinity'::date), (p_aberto_em at time zone 'America/Sao_Paulo')::date + p_dias_pos)
  end
$$;

-- DEFINIÇÃO ÚNICA DE "DISPONÍVEL" (seção 4). Espelho TS: src/domain/disponibilidade.ts
create view v_disponivel with (security_invoker = true) as
  select
    s.lab_id, s.item_id, s.lote_id, s.local_id,
    l.numero as lote_numero, l.status, l.validade, l.aberto_em, l.custo_unitario,
    fn_validade_efetiva(l.validade, l.aberto_em, i.validade_pos_abertura_dias) as validade_efetiva,
    lc.conforme as local_conforme,
    s.saldo as saldo_fisico,
    coalesce(r.reservado, 0) as reservado,
    case
      when l.status in ('LIBERADO', 'ABERTO')
       and lc.conforme
       and coalesce(fn_validade_efetiva(l.validade, l.aberto_em, i.validade_pos_abertura_dias), 'infinity'::date) >= fn_hoje()
      then greatest(0, s.saldo - coalesce(r.reservado, 0))
      else 0
    end as disponivel
  from v_saldo s
  join lotes l on l.id = s.lote_id
  join itens i on i.id = s.item_id
  join locais lc on lc.id = s.local_id
  left join lateral (
    select sum(rv.quantidade) as reservado from reservas rv
    where rv.lote_id = s.lote_id and rv.local_id = s.local_id and rv.status = 'ativa' and rv.valida_ate >= fn_hoje()
  ) r on true;

-- Consumo líquido por item e dia: dispensações − devoluções reintegradas − estornos de dispensação.
create table devolucoes (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  movimentacao_id uuid not null unique references movimentacoes (id),
  dispensacao_id uuid references movimentacoes (id),
  condicao text not null check (condicao in ('integro_fechado', 'aberto', 'danificado', 'armazenamento_comprometido')),
  avaliacao text check (avaliacao in ('reintegrar', 'descartar')),
  avaliado_por uuid,
  avaliado_em timestamptz,
  observacao text
);

create view v_consumo_diario with (security_invoker = true) as
  select m.lab_id, m.item_id, (m.ocorrido_em at time zone 'America/Sao_Paulo')::date as dia,
    sum(case
      when m.tipo = 'DISPENSACAO' then m.quantidade
      when m.tipo = 'DEVOLUCAO' and d.avaliacao = 'reintegrar' then -m.quantidade
      when m.tipo = 'ESTORNO' and o.tipo = 'DISPENSACAO' then -m.quantidade
      else 0 end) as consumo,
    count(*) filter (where m.tipo = 'DISPENSACAO') as saidas
  from movimentacoes m
  left join devolucoes d on d.movimentacao_id = m.id
  left join movimentacoes o on o.id = m.estorno_de
  where m.tipo in ('DISPENSACAO', 'DEVOLUCAO', 'ESTORNO')
  group by 1, 2, 3;

-- Posição por item: físico, disponível, reservado (item), em pedido (Fase 2), projetada.
create view v_posicao_item with (security_invoker = true) as
  select i.lab_id, i.id as item_id, i.codigo, i.nome, i.criticidade, i.unidade_estoque, i.custo_medio, i.ativo,
    coalesce(f.fisico, 0) as fisico,
    greatest(0, coalesce(d.disponivel, 0) - coalesce(ri.reservado, 0)) as disponivel,
    coalesce(ri.reservado, 0) as reservado_item,
    0::numeric as em_pedido,
    greatest(0, coalesce(d.disponivel, 0) - coalesce(ri.reservado, 0)) + 0 as posicao_projetada,
    d.proxima_validade
  from itens i
  left join (select item_id, sum(saldo) fisico from v_saldo group by item_id) f on f.item_id = i.id
  left join (
    select item_id, sum(disponivel) disponivel, min(validade_efetiva) filter (where disponivel > 0) proxima_validade
    from v_disponivel group by item_id
  ) d on d.item_id = i.id
  left join (
    select item_id, sum(quantidade) reservado from reservas
    where lote_id is null and status = 'ativa' and valida_ate >= fn_hoje() group by item_id
  ) ri on ri.item_id = i.id;

-- =====================================================================
-- Regras aplicadas a cada movimentação
-- =====================================================================
create or replace function fn_saldo_lote_local(p_lote uuid, p_local uuid) returns numeric
language sql stable as $$
  select coalesce(sum(case when local_destino_id = p_local then quantidade else 0 end)
                - sum(case when local_origem_id = p_local then quantidade else 0 end), 0)
  from movimentacoes where lote_id = p_lote and (local_origem_id = p_local or local_destino_id = p_local);
$$;

create or replace function fn_mov_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lote lotes%rowtype;
  v_saldo numeric;
begin
  -- Serializa movimentações do mesmo lote (evita saldo negativo por concorrência).
  select * into v_lote from lotes where id = new.lote_id for update;
  if v_lote.item_id <> new.item_id or v_lote.lab_id <> new.lab_id then
    raise exception 'Lote não pertence ao item/laboratório informado.';
  end if;
  new.registrado_em := now();
  if new.local_origem_id is not null then
    v_saldo := fn_saldo_lote_local(new.lote_id, new.local_origem_id);
    if v_saldo < new.quantidade then
      raise exception 'Saldo insuficiente no local: % disponível, % solicitado.', v_saldo, new.quantidade;
    end if;
  end if;
  if new.custo_unitario is null then
    new.custo_unitario := coalesce(v_lote.custo_unitario, (select custo_medio from itens where id = new.item_id));
  end if;
  return new;
end $$;

create trigger trg_mov_antes before insert on movimentacoes
for each row execute function fn_mov_antes();

create or replace function fn_mov_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_saldo_ant numeric;
  v_custo_ant numeric;
begin
  if new.tipo = 'ENTRADA' and new.custo_unitario is not null then
    select coalesce(sum(delta), 0) into v_saldo_ant from v_mov_efeito where item_id = new.item_id and mov_id <> new.id;
    select custo_medio into v_custo_ant from itens where id = new.item_id;
    update itens set custo_medio = case
      when v_custo_ant is null or v_saldo_ant <= 0 then new.custo_unitario
      else (v_saldo_ant * v_custo_ant + new.quantidade * new.custo_unitario) / (v_saldo_ant + new.quantidade)
    end where id = new.item_id;
  end if;
  return null;
end $$;

create trigger trg_mov_depois after insert on movimentacoes
for each row execute function fn_mov_depois();

-- =====================================================================
-- Inventário
-- =====================================================================
create table inventarios (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  tipo text not null check (tipo in ('ciclico', 'geral')),
  escopo jsonb not null default '{}',
  status inventario_status not null default 'aberto',
  aberto_por uuid default auth.uid(),
  aberto_em timestamptz not null default now(),
  encerrado_em timestamptz
);

create table inventario_contagens (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  inventario_id uuid not null references inventarios (id),
  item_id uuid not null references itens (id),
  lote_id uuid not null references lotes (id),
  local_id uuid not null references locais (id),
  -- Gravado no momento da contagem; NUNCA enviado ao app antes da contagem (contagem às cegas).
  saldo_sistema numeric,
  quantidade_contada numeric,
  divergencia numeric generated always as (quantidade_contada - saldo_sistema) stored,
  dentro_tolerancia boolean,
  status contagem_status not null default 'pendente',
  contado_por uuid,
  contado_em timestamptz,
  aprovado_por uuid,
  aprovado_em timestamptz,
  justificativa text,
  ajuste_mov_id uuid references movimentacoes (id),
  unique (inventario_id, lote_id, local_id)
);

-- =====================================================================
-- Snapshots diários
-- =====================================================================
create table snapshot_saldos (
  dia date not null,
  lab_id uuid not null,
  item_id uuid not null,
  lote_id uuid not null,
  local_id uuid not null,
  saldo_fisico numeric not null,
  disponivel numeric not null,
  custo_medio numeric,
  primary key (dia, lote_id, local_id)
);

create table snapshot_itens (
  dia date not null,
  lab_id uuid not null,
  item_id uuid not null,
  ativo boolean not null,
  criticidade criticidade not null,
  fisico numeric not null,
  disponivel numeric not null,
  valor numeric,
  primary key (dia, item_id)
);

create table snapshot_kpis (
  dia date not null,
  lab_id uuid not null,
  kpi_id text not null,
  valor numeric,
  n int,
  selo text,
  detalhe jsonb,
  primary key (dia, lab_id, kpi_id)
);

-- Idempotente: pode rodar várias vezes para o mesmo dia.
create or replace function fn_snapshot_diario(p_dia date default fn_hoje()) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from snapshot_saldos where dia = p_dia;
  delete from snapshot_itens where dia = p_dia;
  insert into snapshot_saldos
    select p_dia, d.lab_id, d.item_id, d.lote_id, d.local_id, d.saldo_fisico, d.disponivel, i.custo_medio
    from v_disponivel d join itens i on i.id = d.item_id;
  insert into snapshot_itens
    select p_dia, p.lab_id, p.item_id, p.ativo, p.criticidade, p.fisico, p.disponivel, p.fisico * p.custo_medio
    from v_posicao_item p;
end $$;

-- Agendamento (habilite a extensão pg_cron no painel do Supabase e rode uma vez):
-- select cron.schedule('snapshot-diario', '30 3 * * *', $$ select fn_snapshot_diario(fn_hoje() - 1) $$); -- 03:30 UTC = 00:30 BRT

-- =====================================================================
-- Auditoria (imutável)
-- =====================================================================
create table auditoria (
  id bigint generated always as identity primary key,
  lab_id uuid,
  tabela text not null,
  registro_id text not null,
  acao text not null,
  anterior jsonb,
  novo jsonb,
  usuario_id uuid default auth.uid(),
  em timestamptz not null default now()
);

create trigger trg_auditoria_imutavel before update or delete on auditoria
for each row execute function fn_bloquear_alteracao();

create or replace function fn_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_novo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_ant jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v jsonb := coalesce(v_novo, v_ant);
begin
  insert into auditoria (lab_id, tabela, registro_id, acao, anterior, novo)
  values (
    case when tg_table_name = 'laboratorios' then (v ->> 'id')::uuid else (v ->> 'lab_id')::uuid end,
    tg_table_name,
    coalesce(v ->> 'id', concat_ws(':', v ->> 'lab_id', v ->> 'user_id', v ->> 'kpi_id', v ->> 'perfil')),
    tg_op, v_ant, v_novo);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['laboratorios', 'parametros_lab', 'metas_kpi', 'categorias', 'fornecedores', 'projetos', 'itens',
                           'locais', 'lotes', 'requisicoes', 'requisicao_linhas', 'reservas',
                           'devolucoes', 'inventarios', 'inventario_contagens', 'lab_membros']
  loop
    execute format('create trigger trg_auditoria after insert or update or delete on %I for each row execute function fn_auditar()', t);
  end loop;
end $$;

-- Exclusão física proibida em cadastros com movimentação: use ativo = false.
do $$
declare t text;
begin
  foreach t in array array['itens', 'lotes', 'locais', 'projetos', 'fornecedores', 'categorias', 'requisicoes', 'requisicao_linhas', 'devolucoes', 'inventario_contagens']
  loop
    execute format('create trigger trg_sem_delete before delete on %I for each row execute function fn_bloquear_alteracao()', t);
  end loop;
end $$;
