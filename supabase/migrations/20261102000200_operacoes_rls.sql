-- LabEstoque — Fase 1: operações (RPC), dados para KPIs e segurança (RLS)
-- Toda escrita no livro-razão passa por estas funções; não há política de INSERT direto em movimentacoes.

set check_function_bodies = off;

-- =====================================================================
-- Auxiliares
-- =====================================================================
create or replace function fn_lab_do_lote(p_lote uuid) returns uuid
language sql stable security definer set search_path = public as $$ select lab_id from lotes where id = p_lote $$;

create or replace function fn_mudar_status_lote(p_lote uuid, p_para lote_status, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_de lote_status; v_lab uuid;
begin
  select status, lab_id into v_de, v_lab from lotes where id = p_lote for update;
  if v_de = p_para then return; end if;
  update lotes set status = p_para,
    aberto_em = case when p_para = 'ABERTO' and aberto_em is null then now() else aberto_em end
  where id = p_lote;
  insert into lote_status_historico (lab_id, lote_id, de, para, motivo) values (v_lab, p_lote, v_de, p_para, p_motivo);
end $$;
revoke execute on function fn_mudar_status_lote(uuid, lote_status, text) from public, anon, authenticated;

-- =====================================================================
-- Laboratório
-- =====================================================================
create or replace function fn_criar_laboratorio(p_nome text, p_sigla text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para criar um laboratório.'; end if;
  insert into laboratorios (nome, sigla) values (p_nome, p_sigla) returning id into v_id;
  insert into parametros_lab (lab_id) values (v_id);
  insert into lab_membros (lab_id, user_id, perfil) values (v_id, auth.uid(), 'administrador');
  return v_id;
end $$;

-- =====================================================================
-- Recebimento (quarentena)
-- =====================================================================
create or replace function fn_receber(
  p_item uuid, p_numero text, p_validade date, p_qtd_compra numeric, p_local uuid,
  p_custo_unitario_compra numeric default null, p_fornecedor uuid default null, p_fabricante text default null,
  p_fabricacao date default null, p_temp_chegada numeric default null, p_observacao text default null,
  p_ocorrido_em timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_item itens%rowtype;
  v_lote uuid;
  v_qtd numeric;
begin
  select * into v_item from itens where id = p_item;
  if not found or not v_item.ativo then raise exception 'Item inexistente ou inativo.'; end if;
  perform fn_exigir_perfil(v_item.lab_id, '{tecnico,gestor}');
  if p_qtd_compra is null or p_qtd_compra <= 0 then raise exception 'Informe a quantidade recebida.'; end if;
  if p_validade is not null and p_validade < fn_hoje() then raise exception 'Lote já chega vencido (%).', to_char(p_validade, 'DD/MM/YYYY'); end if;

  v_qtd := p_qtd_compra * v_item.fator_conversao; -- conversão automática para unidade de estoque

  select id into v_lote from lotes where item_id = p_item and numero = p_numero;
  if v_lote is null then
    insert into lotes (lab_id, item_id, numero, fabricante, fornecedor_id, fabricacao, validade, custo_unitario, temp_chegada, observacao)
    values (v_item.lab_id, p_item, p_numero, p_fabricante, p_fornecedor, p_fabricacao, p_validade,
            p_custo_unitario_compra / v_item.fator_conversao, p_temp_chegada, p_observacao)
    returning id into v_lote;
    insert into lote_status_historico (lab_id, lote_id, de, para, motivo) values (v_item.lab_id, v_lote, null, 'QUARENTENA', 'recebimento');
  end if;

  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_destino_id, quantidade, custo_unitario, ocorrido_em, motivo)
  values (v_item.lab_id, 'ENTRADA', p_item, v_lote, p_local, v_qtd, p_custo_unitario_compra / v_item.fator_conversao, p_ocorrido_em, 'recebimento');
  return v_lote;
end $$;

-- Liberação, bloqueio e baixa de lote (o vencimento é aplicado pelo job diário).
create or replace function fn_alterar_status_lote(p_lote uuid, p_para lote_status, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_lab uuid := fn_lab_do_lote(p_lote); v_de lote_status; v_tecnico_libera boolean;
begin
  select status into v_de from lotes where id = p_lote;
  select tecnico_libera_lote into v_tecnico_libera from parametros_lab where lab_id = v_lab;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da mudança de status.'; end if;

  if p_para = 'LIBERADO' then
    if v_de = 'QUARENTENA' and v_tecnico_libera then perform fn_exigir_perfil(v_lab, '{tecnico,gestor}');
    else perform fn_exigir_perfil(v_lab, '{gestor}'); end if;
    if v_de not in ('QUARENTENA', 'BLOQUEADO') then raise exception 'Só lotes em QUARENTENA ou BLOQUEADO podem ser liberados.'; end if;
  elsif p_para = 'BLOQUEADO' then
    perform fn_exigir_perfil(v_lab, '{tecnico,gestor}');
  elsif p_para = 'BAIXADO' then
    perform fn_exigir_perfil(v_lab, '{gestor}');
    if exists (select 1 from v_saldo where lote_id = p_lote) then raise exception 'Lote ainda tem saldo. Registre perda ou ajuste antes de baixar.'; end if;
  else
    raise exception 'Mudança para % não é feita manualmente.', p_para;
  end if;
  perform fn_mudar_status_lote(p_lote, p_para, p_motivo);
end $$;

-- =====================================================================
-- Dispensação com FEFO
-- =====================================================================
create or replace function fn_lote_fefo(p_item uuid) returns table (lote_id uuid, local_id uuid, validade_efetiva date, disponivel numeric)
language sql stable security definer set search_path = public as $$
  select d.lote_id, d.local_id, d.validade_efetiva, d.disponivel
  from v_disponivel d where d.item_id = p_item and d.disponivel > 0
  order by d.validade_efetiva nulls last, d.lote_numero
$$;

create or replace function fn_dispensar(
  p_lote uuid, p_local uuid, p_qtd numeric, p_projeto uuid, p_finalidade text,
  p_requisicao_linha uuid default null, p_justificativa_fefo text default null, p_ocorrido_em timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lab uuid := fn_lab_do_lote(p_lote);
  v_item uuid;
  v_disp numeric;
  v_val date;
  v_fefo date;
  v_status lote_status;
  v_mov uuid;
  v_res_proj numeric;
  v_disp_item numeric;
  v_restante numeric;
  v_res reservas%rowtype;
begin
  perform fn_exigir_perfil(v_lab, '{tecnico,gestor}');
  if coalesce(trim(p_finalidade), '') = '' then raise exception 'Informe a finalidade.'; end if;
  select item_id, status into v_item, v_status from lotes where id = p_lote;

  select disponivel, validade_efetiva into v_disp, v_val from v_disponivel where lote_id = p_lote and local_id = p_local;
  if coalesce(v_disp, 0) < p_qtd then
    raise exception 'Disponível insuficiente neste lote e local: %.', coalesce(v_disp, 0);
  end if;

  -- Reservas por item (sem lote) também protegem o saldo; o próprio projeto pode consumir o que reservou.
  select coalesce(sum(quantidade), 0) into v_res_proj from reservas
  where item_id = v_item and lote_id is null and projeto_id = p_projeto and status = 'ativa' and valida_ate >= fn_hoje();
  select disponivel into v_disp_item from v_posicao_item where item_id = v_item;
  if coalesce(v_disp_item, 0) + v_res_proj < p_qtd then
    raise exception 'Parte do saldo está reservada para outros projetos. Disponível para este projeto: %.', coalesce(v_disp_item, 0) + v_res_proj;
  end if;
  v_restante := least(p_qtd, v_res_proj);
  for v_res in select * from reservas
    where item_id = v_item and lote_id is null and projeto_id = p_projeto and status = 'ativa' and valida_ate >= fn_hoje()
    order by uso_previsto
  loop
    exit when v_restante <= 0;
    if v_res.quantidade <= v_restante then
      update reservas set status = 'consumida' where id = v_res.id;
      v_restante := v_restante - v_res.quantidade;
    else
      update reservas set quantidade = quantidade - v_restante where id = v_res.id;
      v_restante := 0;
    end if;
  end loop;

  select min(validade_efetiva) into v_fefo from fn_lote_fefo(v_item);
  if v_fefo is not null and coalesce(v_val, 'infinity') > v_fefo and coalesce(trim(p_justificativa_fefo), '') = '' then
    raise exception 'Existe lote que vence antes (%). Justifique a escolha de outro lote.', to_char(v_fefo, 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'FEFO';
  end if;

  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, quantidade, projeto_id, finalidade,
                             requisicao_linha_id, justificativa_fefo, ocorrido_em)
  values (v_lab, 'DISPENSACAO', v_item, p_lote, p_local, p_qtd, p_projeto, p_finalidade,
          p_requisicao_linha, nullif(trim(p_justificativa_fefo), ''), p_ocorrido_em)
  returning id into v_mov;

  if v_status = 'LIBERADO' then perform fn_mudar_status_lote(p_lote, 'ABERTO', 'primeira dispensação'); end if;

  if p_requisicao_linha is not null then
    update requisicao_linhas set qtd_atendida = qtd_atendida + p_qtd where id = p_requisicao_linha and lab_id = v_lab;
  end if;
  return v_mov;
end $$;

-- =====================================================================
-- Perda, transferência, estorno
-- =====================================================================
create or replace function fn_registrar_perda(
  p_lote uuid, p_local uuid, p_qtd numeric, p_motivo text, p_descricao text default null,
  p_projeto uuid default null, p_ocorrido_em timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_lab uuid := fn_lab_do_lote(p_lote); v_mov uuid;
begin
  perform fn_exigir_perfil(v_lab, '{tecnico,gestor}');
  if p_motivo not in ('vencimento', 'contaminacao', 'deterioracao', 'armazenamento_inadequado', 'excursao_temperatura',
                      'dano_fisico', 'extravio', 'falha_transporte', 'descarte_tecnico', 'outro') then
    raise exception 'Motivo de perda inválido.';
  end if;
  if p_motivo = 'outro' and coalesce(trim(p_descricao), '') = '' then raise exception 'Descreva o motivo da perda.'; end if;
  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, quantidade, motivo, descricao_motivo, projeto_id, ocorrido_em)
  select v_lab, 'PERDA', item_id, id, p_local, p_qtd, p_motivo, p_descricao, p_projeto, p_ocorrido_em from lotes where id = p_lote
  returning id into v_mov;
  return v_mov;
end $$;

create or replace function fn_compatibilidade(p_item uuid, p_local uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare i itens%rowtype; l locais%rowtype;
begin
  select * into i from itens where id = p_item;
  select * into l from locais where id = p_local;
  if i.temp_min is not null and l.temp_min is not null and (l.temp_min < i.temp_min or l.temp_max > i.temp_max) then
    return format('Faixa do local (%s a %s °C) fora da exigida pelo item (%s a %s °C).', l.temp_min, l.temp_max, i.temp_min, i.temp_max);
  end if;
  if i.classe_compatibilidade is not null and l.classes_aceitas is not null and not (i.classe_compatibilidade = any (l.classes_aceitas)) then
    return format('Local não aceita a classe %s.', i.classe_compatibilidade);
  end if;
  return null;
end $$;

create or replace function fn_transferir(p_lote uuid, p_origem uuid, p_destino uuid, p_qtd numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_lab uuid := fn_lab_do_lote(p_lote); v_item uuid; v_incompat text; v_mov uuid;
begin
  perform fn_exigir_perfil(v_lab, '{tecnico,gestor}');
  select item_id into v_item from lotes where id = p_lote;
  v_incompat := fn_compatibilidade(v_item, p_destino);
  if v_incompat is not null then raise exception 'Armazenamento incompatível: %', v_incompat; end if;
  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, local_destino_id, quantidade)
  values (v_lab, 'TRANSFERENCIA', v_item, p_lote, p_origem, p_destino, p_qtd) returning id into v_mov;
  return v_mov;
end $$;

create or replace function fn_estornar(p_mov uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o movimentacoes%rowtype; v_mov uuid;
begin
  select * into o from movimentacoes where id = p_mov;
  if not found then raise exception 'Movimentação inexistente.'; end if;
  perform fn_exigir_perfil(o.lab_id, '{gestor}');
  if o.tipo = 'ESTORNO' then raise exception 'Um estorno não pode ser estornado; registre nova movimentação.'; end if;
  if exists (select 1 from movimentacoes where estorno_de = p_mov) then raise exception 'Esta movimentação já foi estornada.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, local_destino_id, quantidade, custo_unitario,
                             projeto_id, finalidade, requisicao_linha_id, motivo, estorno_de)
  values (o.lab_id, 'ESTORNO', o.item_id, o.lote_id, o.local_destino_id, o.local_origem_id, o.quantidade, o.custo_unitario,
          o.projeto_id, o.finalidade, o.requisicao_linha_id, p_motivo, o.id)
  returning id into v_mov;
  if o.tipo = 'DISPENSACAO' and o.requisicao_linha_id is not null then
    update requisicao_linhas set qtd_atendida = qtd_atendida - o.quantidade where id = o.requisicao_linha_id;
  end if;
  return v_mov;
end $$;

-- =====================================================================
-- Devolução e avaliação
-- =====================================================================
create or replace function fn_devolver(
  p_lote uuid, p_local uuid, p_qtd numeric, p_condicao text,
  p_dispensacao uuid default null, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o lotes%rowtype;
  v_derivado uuid;
  v_mov uuid;
  v_dev uuid;
  v_seq int;
begin
  select * into o from lotes where id = p_lote;
  perform fn_exigir_perfil(o.lab_id, '{solicitante,tecnico,gestor,coordenador}');
  select count(*) + 1 into v_seq from lotes where lote_origem_id = p_lote;
  insert into lotes (lab_id, item_id, numero, fabricante, fornecedor_id, fabricacao, validade, custo_unitario, status, aberto_em, lote_origem_id, observacao)
  values (o.lab_id, o.item_id, o.numero || '-DEV' || v_seq, o.fabricante, o.fornecedor_id, o.fabricacao, o.validade, o.custo_unitario,
          'BLOQUEADO', case when p_condicao = 'integro_fechado' then null else coalesce(o.aberto_em, now()) end, p_lote,
          'Devolução: ' || p_condicao)
  returning id into v_derivado;
  insert into lote_status_historico (lab_id, lote_id, de, para, motivo) values (o.lab_id, v_derivado, null, 'BLOQUEADO', 'devolução em avaliação');

  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_destino_id, quantidade, custo_unitario, motivo)
  values (o.lab_id, 'DEVOLUCAO', o.item_id, v_derivado, p_local, p_qtd, o.custo_unitario, p_condicao)
  returning id into v_mov;
  insert into devolucoes (lab_id, movimentacao_id, dispensacao_id, condicao, observacao)
  values (o.lab_id, v_mov, p_dispensacao, p_condicao, p_observacao) returning id into v_dev;
  return v_dev;
end $$;

create or replace function fn_avaliar_devolucao(p_devolucao uuid, p_avaliacao text, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare d devolucoes%rowtype; m movimentacoes%rowtype; v_saldo numeric;
begin
  select * into d from devolucoes where id = p_devolucao;
  perform fn_exigir_perfil(d.lab_id, '{gestor}');
  if d.avaliacao is not null then raise exception 'Devolução já avaliada.'; end if;
  select * into m from movimentacoes where id = d.movimentacao_id;
  update devolucoes set avaliacao = p_avaliacao, avaliado_por = auth.uid(), avaliado_em = now(),
    observacao = coalesce(p_observacao, observacao) where id = p_devolucao;
  if p_avaliacao = 'reintegrar' then
    perform fn_mudar_status_lote(m.lote_id, case when d.condicao = 'integro_fechado' then 'LIBERADO' else 'ABERTO' end::lote_status, 'devolução reintegrada');
  elsif p_avaliacao = 'descartar' then
    v_saldo := fn_saldo_lote_local(m.lote_id, m.local_destino_id);
    if v_saldo > 0 then
      insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, quantidade, motivo, descricao_motivo)
      values (d.lab_id, 'PERDA', m.item_id, m.lote_id, m.local_destino_id, v_saldo, 'descarte_tecnico', 'Devolução descartada: ' || d.condicao);
    end if;
    perform fn_mudar_status_lote(m.lote_id, 'BAIXADO', 'devolução descartada');
  else
    raise exception 'Avaliação deve ser reintegrar ou descartar.';
  end if;
end $$;

-- =====================================================================
-- Requisições
-- =====================================================================
create or replace function fn_enviar_requisicao(p_requisicao uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisicoes%rowtype; v_exige boolean;
begin
  select * into r from requisicoes where id = p_requisicao;
  if r.solicitante_id <> auth.uid() then raise exception 'Só o solicitante envia a requisição.'; end if;
  select exige_aprovacao into v_exige from projetos where id = r.projeto_id;
  update requisicoes set
    status = case when v_exige then 'pendente_aprovacao' else 'aprovada' end::requisicao_status,
    aprovada_em = case when v_exige then null else now() end
  where id = p_requisicao;
  if not v_exige then update requisicao_linhas set qtd_aprovada = qtd_solicitada where requisicao_id = p_requisicao; end if;
end $$;

create or replace function fn_aprovar_requisicao(p_requisicao uuid, p_aprovadas jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare r requisicoes%rowtype; v_coord uuid;
begin
  select * into r from requisicoes where id = p_requisicao;
  select coordenador_id into v_coord from projetos where id = r.projeto_id;
  if v_coord is distinct from auth.uid() then perform fn_exigir_perfil(r.lab_id, '{gestor}'); end if;
  if r.status <> 'pendente_aprovacao' then raise exception 'Requisição não está aguardando aprovação.'; end if;
  -- p_aprovadas: {"<linha_id>": qtd}; ausente = aprova o solicitado
  update requisicao_linhas l set qtd_aprovada = coalesce((p_aprovadas ->> l.id::text)::numeric, l.qtd_solicitada)
  where l.requisicao_id = p_requisicao;
  update requisicoes set status = 'aprovada', aprovada_em = now(), aprovada_por = auth.uid() where id = p_requisicao;
end $$;

create or replace function fn_cancelar_requisicao(p_requisicao uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisicoes%rowtype;
begin
  select * into r from requisicoes where id = p_requisicao;
  if r.solicitante_id <> auth.uid() then perform fn_exigir_perfil(r.lab_id, '{gestor}'); end if;
  if r.status in ('atendida', 'parcial', 'nao_atendida') then raise exception 'Requisição já encerrada.'; end if;
  update requisicoes set status = 'cancelada', cancelada_em = now() where id = p_requisicao;
  update requisicao_linhas set encerrada = true where requisicao_id = p_requisicao;
end $$;

-- Encerra o atendimento: motivo obrigatório quando não integral; causa de ruptura só se faltou estoque.
create or replace function fn_encerrar_requisicao(p_requisicao uuid, p_motivos jsonb default '{}') returns requisicao_status
language plpgsql security definer set search_path = public as $$
declare r requisicoes%rowtype; l record; v_status requisicao_status; v_total int; v_integral int; v_zero int;
begin
  select * into r from requisicoes where id = p_requisicao;
  perform fn_exigir_perfil(r.lab_id, '{tecnico,gestor}');
  for l in select * from requisicao_linhas where requisicao_id = p_requisicao loop
    if l.qtd_atendida < coalesce(l.qtd_aprovada, l.qtd_solicitada) and (p_motivos -> l.id::text ->> 'motivo') is null then
      raise exception 'Informe o motivo do não atendimento de todas as linhas incompletas.';
    end if;
    update requisicao_linhas set encerrada = true,
      motivo_nao_atendimento = p_motivos -> l.id::text ->> 'motivo',
      causa_ruptura = p_motivos -> l.id::text ->> 'causa_ruptura'
    where id = l.id;
  end loop;
  select count(*), count(*) filter (where qtd_atendida >= coalesce(qtd_aprovada, qtd_solicitada)), count(*) filter (where qtd_atendida = 0)
    into v_total, v_integral, v_zero from requisicao_linhas where requisicao_id = p_requisicao;
  v_status := case when v_integral = v_total then 'atendida' when v_zero = v_total then 'nao_atendida' else 'parcial' end;
  update requisicoes set status = v_status, atendida_em = now() where id = p_requisicao;
  return v_status;
end $$;

-- =====================================================================
-- Inventário às cegas
-- =====================================================================
create or replace function fn_iniciar_inventario(p_lab uuid, p_tipo text, p_local uuid default null, p_categoria uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv uuid;
begin
  perform fn_exigir_perfil(p_lab, '{gestor}');
  insert into inventarios (lab_id, tipo, escopo) values (p_lab, p_tipo, jsonb_build_object('local_id', p_local, 'categoria_id', p_categoria))
  returning id into v_inv;
  insert into inventario_contagens (lab_id, inventario_id, item_id, lote_id, local_id)
  select s.lab_id, v_inv, s.item_id, s.lote_id, s.local_id
  from v_saldo s join itens i on i.id = s.item_id
  where s.lab_id = p_lab
    and (p_local is null or s.local_id in (
      with recursive arv as (select id from locais where id = p_local union all select l.id from locais l join arv on l.pai_id = arv.id)
      select id from arv))
    and (p_categoria is null or i.categoria_id = p_categoria);
  return v_inv;
end $$;

create or replace function fn_registrar_contagem(p_contagem uuid, p_qtd numeric) returns void
language plpgsql security definer set search_path = public as $$
declare c inventario_contagens%rowtype; v_saldo numeric; v_contavel boolean; p parametros_lab%rowtype;
begin
  select * into c from inventario_contagens where id = p_contagem for update;
  perform fn_exigir_perfil(c.lab_id, '{tecnico,gestor}');
  if c.status not in ('pendente', 'contada') then raise exception 'Contagem já aprovada ou rejeitada.'; end if;
  select * into p from parametros_lab where lab_id = c.lab_id;
  select unidade_contavel into v_contavel from itens where id = c.item_id;
  v_saldo := fn_saldo_lote_local(c.lote_id, c.local_id);
  update inventario_contagens set
    quantidade_contada = p_qtd, saldo_sistema = v_saldo, status = 'contada', contado_por = auth.uid(), contado_em = now(),
    dentro_tolerancia = case
      when v_contavel then abs(p_qtd - v_saldo) <= p.tolerancia_contavel
      when v_saldo = 0 then p_qtd = 0
      else abs(p_qtd - v_saldo) / v_saldo * 100 <= p.tolerancia_volume_massa_pct
    end
  where id = p_contagem;
end $$;

create or replace function fn_adicionar_posicao_contagem(p_inventario uuid, p_lote uuid, p_local uuid, p_qtd numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_lab uuid := fn_lab_do_lote(p_lote);
begin
  perform fn_exigir_perfil(v_lab, '{tecnico,gestor}');
  insert into inventario_contagens (lab_id, inventario_id, item_id, lote_id, local_id)
  select v_lab, p_inventario, item_id, id, p_local from lotes where id = p_lote returning id into v_id;
  perform fn_registrar_contagem(v_id, p_qtd);
  return v_id;
end $$;

create or replace function fn_aprovar_ajuste(p_contagem uuid, p_aprovar boolean, p_justificativa text) returns void
language plpgsql security definer set search_path = public as $$
declare c inventario_contagens%rowtype; v_mov uuid;
begin
  select * into c from inventario_contagens where id = p_contagem for update;
  perform fn_exigir_perfil(c.lab_id, '{gestor}');
  if c.status <> 'contada' then raise exception 'Só contagens registradas podem ser aprovadas.'; end if;
  if coalesce(trim(p_justificativa), '') = '' then raise exception 'Justifique a decisão.'; end if;
  if p_aprovar and c.divergencia <> 0 then
    insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, local_destino_id, quantidade, motivo)
    values (c.lab_id, 'AJUSTE_INVENTARIO', c.item_id, c.lote_id,
            case when c.divergencia < 0 then c.local_id end, case when c.divergencia > 0 then c.local_id end,
            abs(c.divergencia), p_justificativa)
    returning id into v_mov;
  end if;
  update inventario_contagens set status = case when p_aprovar then 'aprovada' else 'rejeitada' end::contagem_status,
    aprovado_por = auth.uid(), aprovado_em = now(), justificativa = p_justificativa, ajuste_mov_id = v_mov
  where id = p_contagem;
end $$;

-- Contagem às cegas: o saldo do sistema só aparece depois da contagem.
create view v_inventario_contagens as
  select c.id, c.lab_id, c.inventario_id, c.item_id, c.lote_id, c.local_id, c.status, c.contado_em,
    c.quantidade_contada,
    case when c.status = 'pendente' then null else c.saldo_sistema end as saldo_sistema,
    case when c.status = 'pendente' then null else c.divergencia end as divergencia,
    case when c.status = 'pendente' then null else c.dentro_tolerancia end as dentro_tolerancia,
    c.justificativa
  from inventario_contagens c
  where fn_membro(c.lab_id);

-- =====================================================================
-- Vencimento automático (job diário) e snapshot
-- =====================================================================
create or replace function fn_job_diario() returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  for l in
    select lt.id from lotes lt join itens i on i.id = lt.item_id
    where lt.status in ('LIBERADO', 'ABERTO', 'QUARENTENA')
      and fn_validade_efetiva(lt.validade, lt.aberto_em, i.validade_pos_abertura_dias) < fn_hoje()
  loop
    perform fn_mudar_status_lote(l.id, 'VENCIDO', 'vencimento automático');
  end loop;
  perform fn_snapshot_diario(fn_hoje());
end $$;
revoke execute on function fn_job_diario() from public, anon, authenticated;
revoke execute on function fn_snapshot_diario(date) from public, anon, authenticated;
-- select cron.schedule('job-diario', '30 3 * * *', $$ select fn_job_diario() $$);

-- =====================================================================
-- Dados agregados para KPIs (a fórmula fica no serviço src/kpis)
-- =====================================================================
create or replace function fn_kpi_saidas(p_lab uuid, p_de timestamptz, p_ate timestamptz)
returns table (tipo mov_tipo, motivo text, reintegrada boolean, estimado boolean, quantidade numeric, valor numeric, n bigint)
language sql stable security definer set search_path = public as $$
  select m.tipo, m.motivo, coalesce(d.avaliacao = 'reintegrar', false), l.custo_unitario is null,
         sum(m.quantidade), sum(m.quantidade * coalesce(l.custo_unitario, i.custo_medio, 0)), count(*)
  from movimentacoes m
  join lotes l on l.id = m.lote_id
  join itens i on i.id = m.item_id
  left join devolucoes d on d.movimentacao_id = m.id
  where fn_membro(p_lab) and m.lab_id = p_lab and m.tipo in ('DISPENSACAO', 'PERDA', 'DEVOLUCAO')
    and m.ocorrido_em >= p_de and m.ocorrido_em < p_ate
  group by 1, 2, 3, 4
$$;

create or replace function fn_consumo_itens(p_lab uuid, p_janela_dias int default 90)
returns table (item_id uuid, consumo numeric, saidas bigint, dias_com_disponibilidade int, dias_historico int)
language sql stable security definer set search_path = public as $$
  with j as (select fn_hoje() - p_janela_dias as ini)
  select i.id,
    coalesce((select sum(c.consumo) from v_consumo_diario c, j where c.item_id = i.id and c.dia > j.ini), 0),
    coalesce((select sum(c.saidas) from v_consumo_diario c, j where c.item_id = i.id and c.dia > j.ini), 0),
    coalesce(nullif((select count(*) from snapshot_itens s, j where s.item_id = i.id and s.dia > j.ini and s.disponivel > 0), 0), p_janela_dias)::int,
    coalesce(fn_hoje() - (select min((m.ocorrido_em at time zone 'America/Sao_Paulo')::date) from movimentacoes m where m.item_id = i.id), 0)
  from itens i where fn_membro(p_lab) and i.lab_id = p_lab and i.ativo
$$;

-- =====================================================================
-- RLS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['laboratorios', 'perfis_usuario', 'lab_membros', 'parametros_lab', 'metas_kpi', 'categorias',
    'fornecedores', 'projetos', 'itens', 'locais', 'lotes', 'lote_status_historico', 'requisicoes', 'requisicao_linhas',
    'reservas', 'movimentacoes', 'devolucoes', 'inventarios', 'inventario_contagens', 'snapshot_saldos', 'snapshot_itens',
    'snapshot_kpis', 'auditoria']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
  -- Leitura por membros do laboratório
  foreach t in array array['parametros_lab', 'metas_kpi', 'categorias', 'fornecedores', 'projetos', 'itens', 'locais', 'lotes',
    'lote_status_historico', 'requisicoes', 'requisicao_linhas', 'reservas', 'movimentacoes', 'devolucoes', 'inventarios',
    'snapshot_saldos', 'snapshot_itens', 'snapshot_kpis']
  loop
    execute format('create policy membro_le on %I for select to authenticated using (fn_membro(lab_id))', t);
  end loop;
  -- Cadastros: gestor e administrador escrevem (exclusão física já é bloqueada por trigger)
  foreach t in array array['categorias', 'fornecedores', 'projetos', 'itens', 'locais']
  loop
    execute format('create policy gestor_insere on %I for insert to authenticated with check (fn_tem_perfil(lab_id, ''{gestor}''))', t);
    execute format('create policy gestor_altera on %I for update to authenticated using (fn_tem_perfil(lab_id, ''{gestor}'')) with check (fn_tem_perfil(lab_id, ''{gestor}''))', t);
  end loop;
end $$;

-- Contagens: tabela fechada; leitura pela view às cegas.
revoke select on inventario_contagens from anon, authenticated;
grant select on v_inventario_contagens to authenticated;

create policy membro_le on laboratorios for select to authenticated using (fn_membro(id));
create policy admin_altera on laboratorios for update to authenticated using (fn_tem_perfil(id, '{}')) with check (fn_tem_perfil(id, '{}'));

create policy proprio_ou_colega on perfis_usuario for select to authenticated using (
  id = auth.uid() or exists (select 1 from lab_membros a join lab_membros b on a.lab_id = b.lab_id
                             where a.user_id = auth.uid() and b.user_id = perfis_usuario.id));
create policy proprio_altera on perfis_usuario for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy membro_le on lab_membros for select to authenticated using (fn_membro(lab_id));
create policy admin_gere on lab_membros for all to authenticated using (fn_tem_perfil(lab_id, '{}')) with check (fn_tem_perfil(lab_id, '{}'));

create policy admin_altera on parametros_lab for update to authenticated using (fn_tem_perfil(lab_id, '{}')) with check (fn_tem_perfil(lab_id, '{}'));
create policy admin_gere on metas_kpi for all to authenticated using (fn_tem_perfil(lab_id, '{}')) with check (fn_tem_perfil(lab_id, '{}'));

-- Requisições: o solicitante cria as suas; mudanças de status só por RPC.
create policy solicitante_cria on requisicoes for insert to authenticated
  with check (solicitante_id = auth.uid() and fn_membro(lab_id) and status in ('rascunho', 'pendente_aprovacao'));
create policy solicitante_cria_linha on requisicao_linhas for insert to authenticated with check (
  exists (select 1 from requisicoes r where r.id = requisicao_id and r.solicitante_id = auth.uid()
          and r.lab_id = requisicao_linhas.lab_id and r.status in ('rascunho', 'pendente_aprovacao')));

create policy membro_reserva on reservas for insert to authenticated
  with check (criada_por = auth.uid() and fn_tem_perfil(lab_id, '{solicitante,tecnico,gestor,coordenador}'));
create policy autor_cancela on reservas for update to authenticated
  using (criada_por = auth.uid() or fn_tem_perfil(lab_id, '{gestor}'))
  with check (status in ('ativa', 'cancelada'));

create policy leitura_auditoria on auditoria for select to authenticated using (fn_tem_perfil(lab_id, '{gestor,auditor}'));
