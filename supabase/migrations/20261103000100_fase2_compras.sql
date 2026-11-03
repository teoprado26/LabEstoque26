-- Fase 2 — Abastecimento e análise: compras e etapas do ciclo, código de barras dos itens,
-- posição projetada com pedidos abertos e dados agregados para os KPIs K05–K06, K08, K10–K11, K17–K22, ABC e Pareto.

set check_function_bodies = off;

-- =====================================================================
-- Código de barras (EAN/GTIN/Code128) do produto, para cadastrar e dispensar pela câmera
-- =====================================================================
alter table itens add column codigo_barras text;
create unique index itens_lab_codigo_barras on itens (lab_id, codigo_barras) where codigo_barras is not null;

-- =====================================================================
-- Compras
-- =====================================================================
create type etapa_pedido as enum ('solicitado', 'aprovado', 'enviado', 'recebido', 'conferido', 'liberado', 'cancelado');

create table pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  numero bigint generated always as identity,
  fornecedor_id uuid references fornecedores (id),
  projeto_id uuid references projetos (id),
  status etapa_pedido not null default 'solicitado',
  observacao text,
  solicitado_em timestamptz not null default now(),
  solicitado_por uuid default auth.uid(),
  aprovado_em timestamptz,
  aprovado_por uuid,
  enviado_em timestamptz,
  previsto_para date,
  recebido_em timestamptz,
  conferido_em timestamptz,
  liberado_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text
);

create table pedido_linhas (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  pedido_id uuid not null references pedidos_compra (id),
  item_id uuid not null references itens (id),
  -- na unidade de compra do item
  qtd_pedida numeric not null check (qtd_pedida > 0),
  qtd_recebida numeric not null default 0,
  custo_unitario_previsto numeric check (custo_unitario_previsto >= 0),
  unique (pedido_id, item_id)
);

alter table lotes add column pedido_linha_id uuid references pedido_linhas (id);

create trigger trg_auditoria after insert or update or delete on pedidos_compra for each row execute function fn_auditar();
create trigger trg_auditoria after insert or update or delete on pedido_linhas for each row execute function fn_auditar();
create trigger trg_sem_delete before delete on pedidos_compra for each row execute function fn_bloquear_alteracao();
create trigger trg_sem_delete before delete on pedido_linhas for each row execute function fn_bloquear_alteracao();

alter table pedidos_compra enable row level security;
alter table pedido_linhas enable row level security;
create policy membro_le on pedidos_compra for select to authenticated using (fn_membro(lab_id));
create policy membro_le on pedido_linhas for select to authenticated using (fn_membro(lab_id));

-- Cria a solicitação com suas linhas: p_linhas = [{"item_id": "...", "qtd": 2, "custo": 120}]
create or replace function fn_criar_pedido(p_lab uuid, p_fornecedor uuid, p_projeto uuid, p_linhas jsonb, p_observacao text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; l jsonb;
begin
  perform fn_exigir_perfil(p_lab, '{tecnico,gestor}');
  if jsonb_array_length(coalesce(p_linhas, '[]')) = 0 then raise exception 'Inclua ao menos um item no pedido.'; end if;
  if p_fornecedor is not null and not exists (select 1 from fornecedores where id = p_fornecedor and lab_id = p_lab) then
    raise exception 'O fornecedor pertence a outro laboratório.';
  end if;
  insert into pedidos_compra (lab_id, fornecedor_id, projeto_id, observacao) values (p_lab, p_fornecedor, p_projeto, p_observacao) returning id into v_id;
  for l in select * from jsonb_array_elements(p_linhas) loop
    if not exists (select 1 from itens where id = (l ->> 'item_id')::uuid and lab_id = p_lab) then raise exception 'Item de outro laboratório.'; end if;
    insert into pedido_linhas (lab_id, pedido_id, item_id, qtd_pedida, custo_unitario_previsto)
    values (p_lab, v_id, (l ->> 'item_id')::uuid, (l ->> 'qtd')::numeric, nullif(l ->> 'custo', '')::numeric);
  end loop;
  return v_id;
end $$;

-- Avança uma etapa manual: aprovado (gestor), enviado (com data prevista), conferido; ou cancela.
create or replace function fn_avancar_pedido(p_pedido uuid, p_etapa etapa_pedido, p_previsto_para date default null, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p pedidos_compra%rowtype;
begin
  select * into p from pedidos_compra where id = p_pedido for update;
  if not found then raise exception 'Pedido inexistente.'; end if;
  if p_etapa = 'aprovado' then
    perform fn_exigir_perfil(p.lab_id, '{gestor}');
    if p.status <> 'solicitado' then raise exception 'Só solicitações podem ser aprovadas.'; end if;
    update pedidos_compra set status = 'aprovado', aprovado_em = now(), aprovado_por = auth.uid() where id = p_pedido;
  elsif p_etapa = 'enviado' then
    perform fn_exigir_perfil(p.lab_id, '{tecnico,gestor}');
    if p.status <> 'aprovado' then raise exception 'Aprove o pedido antes de enviá-lo ao fornecedor.'; end if;
    if p_previsto_para is null then raise exception 'Informe a previsão de entrega.'; end if;
    update pedidos_compra set status = 'enviado', enviado_em = now(), previsto_para = p_previsto_para where id = p_pedido;
  elsif p_etapa = 'conferido' then
    perform fn_exigir_perfil(p.lab_id, '{tecnico,gestor}');
    if p.status <> 'recebido' then raise exception 'O pedido ainda não foi recebido por completo.'; end if;
    update pedidos_compra set status = 'conferido', conferido_em = now() where id = p_pedido;
    perform fn_verificar_liberacao_pedido(p_pedido);
  elsif p_etapa = 'cancelado' then
    perform fn_exigir_perfil(p.lab_id, '{gestor}');
    if p.status in ('recebido', 'conferido', 'liberado', 'cancelado') then raise exception 'Pedido já recebido ou cancelado.'; end if;
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    update pedidos_compra set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = p_motivo where id = p_pedido;
  else
    raise exception 'A etapa % é registrada automaticamente.', p_etapa;
  end if;
end $$;

-- Liberação: quando o pedido está conferido e nenhum lote dele segue em QUARENTENA.
create or replace function fn_verificar_liberacao_pedido(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update pedidos_compra p set status = 'liberado', liberado_em = now()
  where p.id = p_pedido and p.status = 'conferido'
    and not exists (select 1 from lotes l join pedido_linhas pl on pl.id = l.pedido_linha_id where pl.pedido_id = p_pedido and l.status = 'QUARENTENA');
end $$;
revoke execute on function fn_verificar_liberacao_pedido(uuid) from public, anon, authenticated;

create or replace function fn_lote_liberado_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> old.status and old.status = 'QUARENTENA' and new.pedido_linha_id is not null then
    perform fn_verificar_liberacao_pedido((select pedido_id from pedido_linhas where id = new.pedido_linha_id));
  end if;
  return new;
end $$;

create trigger trg_lote_liberado_pedido after update of status on lotes for each row execute function fn_lote_liberado_pedido();

-- Recebimento passa a aceitar a linha do pedido: vincula o lote, soma o recebido e fecha a etapa "recebido".
drop function fn_receber(uuid, text, date, numeric, uuid, numeric, uuid, text, date, numeric, text, timestamptz);

create or replace function fn_receber(
  p_item uuid, p_numero text, p_validade date, p_qtd_compra numeric, p_local uuid,
  p_custo_unitario_compra numeric default null, p_fornecedor uuid default null, p_fabricante text default null,
  p_fabricacao date default null, p_temp_chegada numeric default null, p_observacao text default null,
  p_ocorrido_em timestamptz default now(), p_pedido_linha uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_item itens%rowtype;
  v_lote uuid;
  v_qtd numeric;
  v_linha pedido_linhas%rowtype;
  v_pedido pedidos_compra%rowtype;
begin
  select * into v_item from itens where id = p_item;
  if not found or not v_item.ativo then raise exception 'Item inexistente ou inativo.'; end if;
  perform fn_exigir_perfil(v_item.lab_id, '{tecnico,gestor}');
  if p_qtd_compra is null or p_qtd_compra <= 0 then raise exception 'Informe a quantidade recebida.'; end if;
  if p_validade is not null and p_validade < fn_hoje() then raise exception 'Lote já chega vencido (%).', to_char(p_validade, 'DD/MM/YYYY'); end if;

  if p_pedido_linha is not null then
    select * into v_linha from pedido_linhas where id = p_pedido_linha for update;
    select * into v_pedido from pedidos_compra where id = v_linha.pedido_id for update;
    if v_linha.item_id <> p_item then raise exception 'A linha do pedido é de outro item.'; end if;
    if v_pedido.status not in ('aprovado', 'enviado') then raise exception 'Este pedido não está aguardando entrega.'; end if;
  end if;

  v_qtd := p_qtd_compra * v_item.fator_conversao;

  select id into v_lote from lotes where item_id = p_item and numero = p_numero;
  if v_lote is null then
    insert into lotes (lab_id, item_id, numero, fabricante, fornecedor_id, fabricacao, validade, custo_unitario, temp_chegada, observacao, pedido_linha_id)
    values (v_item.lab_id, p_item, p_numero, p_fabricante, coalesce(p_fornecedor, v_pedido.fornecedor_id), p_fabricacao, p_validade,
            coalesce(p_custo_unitario_compra, v_linha.custo_unitario_previsto) / v_item.fator_conversao, p_temp_chegada, p_observacao, p_pedido_linha)
    returning id into v_lote;
    insert into lote_status_historico (lab_id, lote_id, de, para, motivo) values (v_item.lab_id, v_lote, null, 'QUARENTENA', 'recebimento');
  end if;

  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_destino_id, quantidade, custo_unitario, ocorrido_em, motivo)
  values (v_item.lab_id, 'ENTRADA', p_item, v_lote, p_local, v_qtd,
          coalesce(p_custo_unitario_compra, v_linha.custo_unitario_previsto) / v_item.fator_conversao, p_ocorrido_em,
          case when p_pedido_linha is null then 'recebimento' else 'recebimento de pedido' end);

  if p_pedido_linha is not null then
    update pedido_linhas set qtd_recebida = qtd_recebida + p_qtd_compra where id = p_pedido_linha;
    if not exists (select 1 from pedido_linhas where pedido_id = v_pedido.id and qtd_recebida < qtd_pedida) then
      update pedidos_compra set status = 'recebido', recebido_em = p_ocorrido_em,
        enviado_em = coalesce(enviado_em, aprovado_em, solicitado_em)
      where id = v_pedido.id;
    end if;
  end if;
  return v_lote;
end $$;

-- Posição projetada = disponível + pedidos abertos (solicitados, aprovados ou enviados), na unidade de estoque.
create or replace view v_posicao_item with (security_invoker = true) as
  select i.lab_id, i.id as item_id, i.codigo, i.nome, i.criticidade, i.unidade_estoque, i.custo_medio, i.ativo,
    coalesce(f.fisico, 0) as fisico,
    greatest(0, coalesce(d.disponivel, 0) - coalesce(ri.reservado, 0)) as disponivel,
    coalesce(ri.reservado, 0) as reservado_item,
    coalesce(pe.em_pedido, 0) as em_pedido,
    greatest(0, coalesce(d.disponivel, 0) - coalesce(ri.reservado, 0)) + coalesce(pe.em_pedido, 0) as posicao_projetada,
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
  ) ri on ri.item_id = i.id
  left join (
    select pl.item_id, sum(greatest(0, pl.qtd_pedida - pl.qtd_recebida) * it.fator_conversao) em_pedido
    from pedido_linhas pl join pedidos_compra p on p.id = pl.pedido_id join itens it on it.id = pl.item_id
    where p.status in ('solicitado', 'aprovado', 'enviado') group by pl.item_id
  ) pe on pe.item_id = i.id;

-- =====================================================================
-- Dados agregados para os KPIs da Fase 2 (as fórmulas ficam em src/kpis)
-- =====================================================================

-- Pedidos recebidos no período, com as datas de cada etapa e se vieram completos e no prazo (K20, K21, K22).
create or replace function fn_kpi_pedidos(p_lab uuid, p_de timestamptz, p_ate timestamptz)
returns table (pedido_id uuid, numero bigint, fornecedor_id uuid, fornecedor text, solicitado_em timestamptz, aprovado_em timestamptz,
  enviado_em timestamptz, previsto_para date, recebido_em timestamptz, conferido_em timestamptz, liberado_em timestamptz, completo boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.numero, p.fornecedor_id, f.nome, p.solicitado_em, p.aprovado_em, p.enviado_em, p.previsto_para, p.recebido_em, p.conferido_em, p.liberado_em,
    not exists (select 1 from pedido_linhas l where l.pedido_id = p.id and l.qtd_recebida < l.qtd_pedida)
  from pedidos_compra p left join fornecedores f on f.id = p.fornecedor_id
  where fn_membro(p_lab) and p.lab_id = p_lab and p.recebido_em >= p_de and p.recebido_em < p_ate
$$;

-- Lead times (dias) de todos os pedidos recebidos que contêm cada item, para os parâmetros de reposição.
create or replace function fn_lead_times(p_lab uuid)
returns table (item_id uuid, fornecedor_id uuid, dias numeric)
language sql stable security definer set search_path = public as $$
  select l.item_id, p.fornecedor_id, extract(epoch from (p.recebido_em - coalesce(p.enviado_em, p.aprovado_em, p.solicitado_em))) / 86400
  from pedidos_compra p join pedido_linhas l on l.pedido_id = p.id
  where fn_membro(p_lab) and p.lab_id = p_lab and p.recebido_em is not null
$$;

-- Consumo valorado por item no período (ABC, K10, maior consumo/custo). Devoluções reintegradas e estornos reduzem.
create or replace function fn_consumo_valorado(p_lab uuid, p_de timestamptz, p_ate timestamptz)
returns table (item_id uuid, quantidade numeric, valor numeric, saidas bigint, primeira_saida date)
language sql stable security definer set search_path = public as $$
  select m.item_id,
    sum(case when m.tipo = 'DISPENSACAO' then m.quantidade else -m.quantidade end),
    sum((case when m.tipo = 'DISPENSACAO' then 1 else -1 end) * m.quantidade * coalesce(l.custo_unitario, i.custo_medio, 0)),
    count(*) filter (where m.tipo = 'DISPENSACAO'),
    min((m.ocorrido_em at time zone 'America/Sao_Paulo')::date) filter (where m.tipo = 'DISPENSACAO')
  from movimentacoes m
  join lotes l on l.id = m.lote_id
  join itens i on i.id = m.item_id
  left join devolucoes d on d.movimentacao_id = m.id
  left join movimentacoes o on o.id = m.estorno_de
  where fn_membro(p_lab) and m.lab_id = p_lab and m.ocorrido_em >= p_de and m.ocorrido_em < p_ate
    and (m.tipo = 'DISPENSACAO' or (m.tipo = 'DEVOLUCAO' and d.avaliacao = 'reintegrar') or (m.tipo = 'ESTORNO' and o.tipo = 'DISPENSACAO'))
  group by m.item_id
$$;

-- Última dispensação e primeira entrada por item (K11 — itens sem movimentação; nunca dispensado conta desde a entrada).
create or replace function fn_ultima_dispensacao(p_lab uuid)
returns table (item_id uuid, ultima date, primeira_entrada date)
language sql stable security definer set search_path = public as $$
  select item_id,
    max((ocorrido_em at time zone 'America/Sao_Paulo')::date) filter (where tipo = 'DISPENSACAO'),
    min((ocorrido_em at time zone 'America/Sao_Paulo')::date) filter (where tipo = 'ENTRADA')
  from movimentacoes where fn_membro(p_lab) and lab_id = p_lab and tipo in ('DISPENSACAO', 'ENTRADA') group by item_id
$$;

-- Qualidade dos registros no período (K18 rastreabilidade, K19 retroativos).
create or replace function fn_kpi_registros(p_lab uuid, p_de timestamptz, p_ate timestamptz)
returns table (total bigint, completas bigint, retroativas bigint)
language sql stable security definer set search_path = public as $$
  select count(*),
    count(*) filter (where lote_id is not null and coalesce(local_origem_id, local_destino_id) is not null and usuario_id is not null
                       and (tipo <> 'DISPENSACAO' or (projeto_id is not null and coalesce(trim(finalidade), '') <> ''))),
    count(*) filter (where registrado_em - ocorrido_em > interval '24 hours')
  from movimentacoes where fn_membro(p_lab) and lab_id = p_lab and ocorrido_em >= p_de and ocorrido_em < p_ate
$$;

-- Pareto: um tema por vez; devolve frequência, quantidade e valor por categoria (a métrica é escolhida no app).
create or replace function fn_pareto(p_lab uuid, p_tema text, p_de timestamptz, p_ate timestamptz)
returns table (categoria text, frequencia bigint, quantidade numeric, valor numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_membro(p_lab) then return; end if;
  if p_tema = 'causas_perda' then
    return query select coalesce(m.motivo, 'sem motivo'), count(*), sum(m.quantidade), sum(m.quantidade * coalesce(l.custo_unitario, i.custo_medio, 0))
      from movimentacoes m join lotes l on l.id = m.lote_id join itens i on i.id = m.item_id
      where m.lab_id = p_lab and m.tipo = 'PERDA' and m.ocorrido_em >= p_de and m.ocorrido_em < p_ate
        and not exists (select 1 from movimentacoes e where e.estorno_de = m.id)
      group by 1;
  elsif p_tema = 'causas_ruptura' then
    return query select rl.causa_ruptura, count(*), sum(coalesce(rl.qtd_aprovada, rl.qtd_solicitada) - rl.qtd_atendida), 0::numeric
      from requisicao_linhas rl join requisicoes r on r.id = rl.requisicao_id
      where rl.lab_id = p_lab and rl.causa_ruptura is not null and r.atendida_em >= p_de and r.atendida_em < p_ate group by 1;
  elsif p_tema = 'motivos_nao_atendimento' then
    return query select rl.motivo_nao_atendimento, count(*), sum(coalesce(rl.qtd_aprovada, rl.qtd_solicitada) - rl.qtd_atendida), 0::numeric
      from requisicao_linhas rl join requisicoes r on r.id = rl.requisicao_id
      where rl.lab_id = p_lab and rl.motivo_nao_atendimento is not null and r.atendida_em >= p_de and r.atendida_em < p_ate group by 1;
  elsif p_tema = 'atrasos_fornecedor' then
    return query select coalesce(f.nome, 'sem fornecedor'), count(*), sum(greatest(0, (p.recebido_em at time zone 'America/Sao_Paulo')::date - p.previsto_para))::numeric, 0::numeric
      from pedidos_compra p left join fornecedores f on f.id = p.fornecedor_id
      where p.lab_id = p_lab and p.recebido_em >= p_de and p.recebido_em < p_ate and (p.recebido_em at time zone 'America/Sao_Paulo')::date > p.previsto_para group by 1;
  elsif p_tema = 'divergencias_inventario' then
    return query select i.nome, count(*), sum(abs(c.divergencia)), sum(abs(c.divergencia) * coalesce(l.custo_unitario, i.custo_medio, 0))
      from inventario_contagens c join itens i on i.id = c.item_id join lotes l on l.id = c.lote_id
      where c.lab_id = p_lab and c.status <> 'pendente' and c.divergencia <> 0 and c.contado_em >= p_de and c.contado_em < p_ate group by 1;
  elsif p_tema in ('itens_maior_consumo', 'itens_maior_custo') then
    return query select i.nome, c.saidas, c.quantidade, c.valor
      from fn_consumo_valorado(p_lab, p_de, p_ate) c join itens i on i.id = c.item_id where c.quantidade > 0;
  end if;
  -- 'nao_conformidades_armazenamento' entra com as verificações de armazenamento (Fase 3).
end $$;

-- Custo da posição contada (K17 — acuracidade financeira).
create or replace view v_inventario_contagens_detalhe as
  select c.*, i.nome as item_nome, i.codigo as item_codigo, i.unidade_estoque, l.numero as lote_numero, lc.nome as local_nome,
    coalesce(l.custo_unitario, i.custo_medio) as custo_unitario
  from v_inventario_contagens c
  join itens i on i.id = c.item_id
  join lotes l on l.id = c.lote_id
  join locais lc on lc.id = c.local_id;

-- =====================================================================
-- Movimentações com nomes (aba Movimentações: quem deu entrada e quem deu saída)
-- =====================================================================
create or replace view v_movimentacoes as
  select m.id, m.lab_id, m.tipo, m.item_id, i.nome as item_nome, i.codigo as item_codigo, i.unidade_estoque, i.categoria_id,
    m.lote_id, l.numero as lote_numero, m.quantidade, m.custo_unitario,
    m.local_origem_id, lo.nome as local_origem, m.local_destino_id, ld.nome as local_destino,
    m.projeto_id, pj.codigo as projeto_codigo, m.finalidade, m.motivo, m.descricao_motivo, m.justificativa_fefo, m.estorno_de,
    m.ocorrido_em, m.registrado_em, m.usuario_id, coalesce(nullif(pu.nome, ''), pu.email) as usuario_nome,
    case when m.local_destino_id is not null and m.local_origem_id is null then 'entrada'
         when m.local_origem_id is not null and m.local_destino_id is null then 'saida'
         else 'interna' end as sentido
  from movimentacoes m
  join itens i on i.id = m.item_id
  join lotes l on l.id = m.lote_id
  left join locais lo on lo.id = m.local_origem_id
  left join locais ld on ld.id = m.local_destino_id
  left join projetos pj on pj.id = m.projeto_id
  left join perfis_usuario pu on pu.id = m.usuario_id
  where fn_membro(m.lab_id);
grant select on v_movimentacoes to authenticated;

-- =====================================================================
-- Demonstração de compras: fornecedores e 9 pedidos recebidos nos últimos meses
-- =====================================================================
create or replace function fn_demo_compras(p_lab uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f1 uuid; f2 uuid; p uuid; it record; n int := 0; v_env timestamptz; v_prev date; v_rec timestamptz;
begin
  perform fn_exigir_perfil(p_lab, '{}');
  if exists (select 1 from pedidos_compra where lab_id = p_lab) then return; end if;
  insert into fornecedores (lab_id, nome, lead_time_padrao_dias) values (p_lab, 'Distribuidora Científica Demo', 12) returning id into f1;
  insert into fornecedores (lab_id, nome, lead_time_padrao_dias) values (p_lab, 'Reagentes Brasil Demo', 20) returning id into f2;
  perform setseed(0.7);
  for it in select id, codigo, fator_conversao from itens where lab_id = p_lab and ativo order by codigo loop
    for k in 1 .. 3 loop
      n := n + 1;
      v_env := now() - make_interval(days => 30 * k + (n % 7));
      v_prev := (v_env at time zone 'America/Sao_Paulo')::date + case when n % 2 = 0 then 10 else 18 end;
      v_rec := v_env + make_interval(days => (case when n % 2 = 0 then 9 else 16 end) + floor(random() * 8)::int);
      insert into pedidos_compra (lab_id, fornecedor_id, status, solicitado_em, aprovado_em, enviado_em, previsto_para, recebido_em, conferido_em, liberado_em)
      values (p_lab, case when n % 2 = 0 then f1 else f2 end, 'liberado', v_env - interval '3 days', v_env - interval '1 day', v_env, v_prev, v_rec,
              v_rec + interval '1 day', v_rec + interval '2 days')
      returning id into p;
      insert into pedido_linhas (lab_id, pedido_id, item_id, qtd_pedida, qtd_recebida) values (p_lab, p, it.id, 2, case when n % 5 = 0 then 1 else 2 end);
    end loop;
  end loop;
  -- Um pedido em andamento (enviado), que já entra na posição projetada
  select id into it from itens where lab_id = p_lab and codigo = 'MC-SFB';
  if found then
    insert into pedidos_compra (lab_id, fornecedor_id, status, solicitado_em, aprovado_em, enviado_em, previsto_para)
    values (p_lab, f2, 'enviado', now() - interval '6 days', now() - interval '5 days', now() - interval '4 days', fn_hoje() + 8) returning id into p;
    insert into pedido_linhas (lab_id, pedido_id, item_id, qtd_pedida) values (p_lab, p, it.id, 1);
  end if;
end $$;
