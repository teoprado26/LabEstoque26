-- Dados fictícios para testar o app (botão "Carregar dados de demonstração" na aba Mais).
-- Só o administrador roda, e só num laboratório ainda sem itens.

create or replace function fn_carregar_demonstracao(p_lab uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := fn_hoje();
  c_meio uuid; c_reag uuid; c_cons uuid; c_epi uuid;
  l_lab uuid; l_sala uuid; l_gel uuid; l_frz uuid; l_arm uuid; l_est uuid;
  p_pesq uuid; p_aula uuid; p_rot uuid;
  r record;
  v_item uuid;
  v_lote uuid;
  v_dia date;
  v_q numeric;
  v_projs uuid[];
  v_req uuid;
  v_linha uuid;
  v_inv uuid;
begin
  perform fn_exigir_perfil(p_lab, '{}');
  if exists (select 1 from itens where lab_id = p_lab) then
    raise exception 'O laboratório já tem itens cadastrados; a demonstração só roda num laboratório vazio.';
  end if;
  perform setseed(0.42);

  insert into categorias (lab_id, nome) values (p_lab, 'Meios de cultura') returning id into c_meio;
  insert into categorias (lab_id, nome) values (p_lab, 'Reagentes') returning id into c_reag;
  insert into categorias (lab_id, nome) values (p_lab, 'Consumíveis') returning id into c_cons;
  insert into categorias (lab_id, nome) values (p_lab, 'EPI') returning id into c_epi;

  insert into locais (lab_id, nivel, nome) values (p_lab, 'laboratorio', 'Lab. de Biologia Celular') returning id into l_lab;
  insert into locais (lab_id, pai_id, nivel, nome) values (p_lab, l_lab, 'sala', 'Sala 101') returning id into l_sala;
  insert into locais (lab_id, pai_id, nivel, nome, temp_min, temp_max) values (p_lab, l_sala, 'equipamento', 'Geladeira 4 °C', 2, 8) returning id into l_gel;
  insert into locais (lab_id, pai_id, nivel, nome, temp_min, temp_max, grade_linhas, grade_colunas) values (p_lab, l_sala, 'equipamento', 'Freezer −20 °C', -25, -15, 9, 9) returning id into l_frz;
  insert into locais (lab_id, pai_id, nivel, nome, temp_min, temp_max, classes_aceitas) values (p_lab, l_sala, 'equipamento', 'Armário de reagentes', 15, 25, '{geral,inflamavel}') returning id into l_arm;
  insert into locais (lab_id, pai_id, nivel, nome, temp_min, temp_max) values (p_lab, l_sala, 'equipamento', 'Estante de consumíveis', 15, 30) returning id into l_est;

  insert into projetos (lab_id, codigo, nome, fonte_recurso) values (p_lab, 'PQ-01', 'Linhagens tumorais', 'Agência de fomento') returning id into p_pesq;
  insert into projetos (lab_id, codigo, nome, fonte_recurso) values (p_lab, 'EN-02', 'Aula prática de biologia celular', 'Departamento') returning id into p_aula;
  insert into projetos (lab_id, codigo, nome, fonte_recurso) values (p_lab, 'RT-00', 'Rotina do laboratório', 'Departamento') returning id into p_rot;
  v_projs := array[p_pesq, p_aula, p_rot];

  -- código, nome, categoria, tipo, un. compra, un. estoque, fator, contável, crit., tmin, tmax, pós-abertura, LT, val. típica, múltiplo,
  -- local, custo por un. de compra, consumo médio diário (un. estoque), lotes: dias até vencer
  for r in select * from (values
    ('MC-DMEM', 'Meio DMEM alta glicose', c_meio, 'meio_cultura', 'frasco 500 mL', 'mL', 500, false, 'V', 2, 8, 30, 15, 180, 500, l_gel, 120.0, 45.0, array[12, 75, 160]),
    ('MC-SFB',  'Soro fetal bovino',      c_meio, 'meio_cultura', 'frasco 500 mL', 'mL', 500, false, 'V', -25, -15, 30, 30, 365, 500, l_frz, 1800.0, 6.0, array[200, 330]),
    ('RG-TRIP', 'Tripsina-EDTA 0,25%',    c_reag, 'reagente',     'frasco 100 mL', 'mL', 100, false, 'E', -25, -15, 14, 10, 365, 100, l_frz, 95.0, 4.0, array[25, 140]),
    ('RG-PBS',  'PBS 10x',                c_reag, 'reagente',     'frasco 500 mL', 'mL', 500, false, 'E', 15, 25, null, 7, 730, 500, l_arm, 60.0, 15.0, array[300]),
    ('RG-ETOH', 'Etanol 70%',             c_reag, 'reagente',     'frasco 1 L',    'mL', 1000, false, 'D', 15, 25, null, 5, 730, 1000, l_arm, 18.0, 120.0, array[400]),
    ('CS-PONT', 'Ponteira 200 µL',        c_cons, 'consumivel',   'caixa 960 un',  'un', 960, true,  'E', null, null, null, 7, null, 960, l_est, 85.0, 140.0, array[]::int[]),
    ('CS-PETRI','Placa de Petri 90 mm',   c_cons, 'consumivel',   'pacote 20 un',  'un', 20, true,   'D', null, null, null, 7, null, 20, l_est, 22.0, 3.0, array[]::int[]),
    ('EP-LUVA', 'Luva nitrílica M',       c_epi,  'epi',          'caixa 100 un',  'un', 100, true,  'V', null, null, null, 5, null, 100, l_est, 32.0, 40.0, array[]::int[])
  ) as t(codigo, nome, cat, tipo, ucomp, uest, fator, contavel, crit, tmin, tmax, posab, lt, valtip, mult, local, custo, consumo, lotes)
  loop
    insert into itens (lab_id, codigo, nome, categoria_id, tipo, unidade_compra, unidade_estoque, fator_conversao, unidade_contavel,
                       criticidade, temp_min, temp_max, validade_pos_abertura_dias, lead_time_manual_dias, validade_tipica_dias, multiplo_embalagem)
    values (p_lab, r.codigo, r.nome, r.cat, r.tipo, r.ucomp, r.uest, r.fator, r.contavel, r.crit::criticidade, r.tmin, r.tmax, r.posab, r.lt, r.valtip, r.mult)
    returning id into v_item;

    -- Lote antigo, recebido há 120 dias, que sustenta o histórico de consumo
    insert into lotes (lab_id, item_id, numero, fabricante, validade, custo_unitario, status)
    values (p_lab, v_item, 'H' || substr(md5(r.codigo), 1, 6), 'Fabricante Demo', v_hoje + 400, r.custo / r.fator, 'LIBERADO')
    returning id into v_lote;
    insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_destino_id, quantidade, custo_unitario, ocorrido_em, motivo)
    values (p_lab, 'ENTRADA', v_item, v_lote, r.local, ceil(r.consumo * 125 / r.fator) * r.fator, r.custo / r.fator, now() - interval '120 days', 'saldo inicial');

    -- Consumo diário dos últimos 119 dias (dias úteis), com variação
    for v_dia in select generate_series(v_hoje - 119, v_hoje - 1, interval '1 day')::date loop
      continue when extract(isodow from v_dia) > 5;
      v_q := round(r.consumo * 7 / 5 * (0.5 + random()));
      continue when v_q <= 0 or fn_saldo_lote_local(v_lote, r.local) < v_q;
      insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, quantidade, projeto_id, finalidade, ocorrido_em)
      values (p_lab, 'DISPENSACAO', v_item, v_lote, r.local, v_q, v_projs[1 + floor(random() * 3)::int], 'uso de rotina',
              (v_dia + time '10:00') at time zone 'America/Sao_Paulo');
    end loop;

    -- Lotes atuais, com validades variadas
    for i in 1 .. coalesce(array_length(r.lotes, 1), 0) loop
      insert into lotes (lab_id, item_id, numero, fabricante, validade, custo_unitario, status)
      values (p_lab, v_item, 'L' || (2026000 + i * 17 + length(r.codigo)), 'Fabricante Demo', v_hoje + r.lotes[i], r.custo / r.fator, 'LIBERADO')
      returning id into v_lote;
      insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_destino_id, quantidade, custo_unitario, ocorrido_em, motivo)
      values (p_lab, 'ENTRADA', v_item, v_lote, r.local, r.fator * 2, r.custo / r.fator, now() - interval '10 days', 'recebimento');
    end loop;
  end loop;

  -- Um lote em quarentena aguardando conferência
  select id into v_item from itens where lab_id = p_lab and codigo = 'MC-DMEM';
  perform fn_receber(v_item, 'Q2026-118', v_hoje + 200, 2, l_gel, 120);

  -- Perdas
  select l.id into v_lote from lotes l join itens i on i.id = l.item_id where i.codigo = 'RG-TRIP' and l.lab_id = p_lab and l.numero like 'H%';
  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, quantidade, motivo, ocorrido_em)
  select p_lab, 'PERDA', item_id, id, l_frz, 20, 'contaminacao', now() - interval '12 days' from lotes where id = v_lote
  and fn_saldo_lote_local(v_lote, l_frz) >= 20;
  select l.id into v_lote from lotes l join itens i on i.id = l.item_id where i.codigo = 'MC-DMEM' and l.lab_id = p_lab and l.numero like 'H%';
  insert into movimentacoes (lab_id, tipo, item_id, lote_id, local_origem_id, quantidade, motivo, ocorrido_em)
  select p_lab, 'PERDA', item_id, id, l_gel, 250, 'vencimento', now() - interval '5 days' from lotes where id = v_lote
  and fn_saldo_lote_local(v_lote, l_gel) >= 250;

  -- Requisições encerradas nos últimos 30 dias (uma parcial por atraso de fornecedor)
  for i in 1 .. 12 loop
    insert into requisicoes (lab_id, solicitante_id, projeto_id, finalidade, status, criada_em, aprovada_em, atendida_em)
    values (p_lab, auth.uid(), v_projs[1 + (i % 3)], 'experimento ' || i, case when i = 7 then 'parcial' else 'atendida' end::requisicao_status,
            now() - make_interval(days => 31 - i * 2), now() - make_interval(days => 31 - i * 2), now() - make_interval(days => 30 - i * 2))
    returning id into v_req;
    insert into requisicao_linhas (lab_id, requisicao_id, item_id, qtd_solicitada, qtd_aprovada, qtd_atendida, encerrada, motivo_nao_atendimento, causa_ruptura)
    select p_lab, v_req, id, 100, 100, case when i = 7 then 40 else 100 end, true,
           case when i = 7 then 'estoque insuficiente' end, case when i = 7 then 'atraso_fornecedor' end
    from itens where lab_id = p_lab and codigo = (array['MC-DMEM', 'CS-PONT', 'EP-LUVA', 'RG-PBS'])[1 + (i % 4)];
  end loop;

  -- Inventário cíclico da geladeira, contado e aprovado
  v_inv := fn_iniciar_inventario(p_lab, 'ciclico', l_gel);
  for r in select c.id, c.lote_id, c.local_id from inventario_contagens c where c.inventario_id = v_inv loop
    perform fn_registrar_contagem(r.id, fn_saldo_lote_local(r.lote_id, r.local_id) - case when random() < 0.25 then 30 else 0 end);
  end loop;

  -- Snapshots dos últimos 120 dias reconstruídos a partir do livro-razão
  delete from snapshot_itens where lab_id = p_lab;
  insert into snapshot_itens (dia, lab_id, item_id, ativo, criticidade, fisico, disponivel, valor)
  select d::date, p_lab, i.id, true, i.criticidade,
    coalesce(sum(e.delta), 0), greatest(0, coalesce(sum(e.delta) filter (where l.status in ('LIBERADO', 'ABERTO')), 0)),
    coalesce(sum(e.delta), 0) * i.custo_medio
  from generate_series(v_hoje - 120, v_hoje - 1, interval '1 day') d
  cross join itens i
  left join v_mov_efeito e on e.item_id = i.id and (e.ocorrido_em at time zone 'America/Sao_Paulo')::date <= d::date
  left join lotes l on l.id = e.lote_id
  where i.lab_id = p_lab
  group by d, i.id, i.criticidade, i.custo_medio;
  perform fn_snapshot_diario(v_hoje);
end $$;
