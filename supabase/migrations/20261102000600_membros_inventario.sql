-- Gestão de membros do laboratório e encerramento de inventário.

-- O administrador inclui alguém que já tem conta no LabEstoque, pelo e-mail.
create or replace function fn_adicionar_membro(p_lab uuid, p_email text, p_perfil perfil_lab) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform fn_exigir_perfil(p_lab, '{}');
  select id into v_user from perfis_usuario where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Não há conta com o e-mail %. Peça para a pessoa entrar uma vez no LabEstoque e tente de novo.', trim(p_email);
  end if;
  insert into lab_membros (lab_id, user_id, perfil, ativo) values (p_lab, v_user, p_perfil, true)
  on conflict (lab_id, user_id, perfil) do update set ativo = true;
  return v_user;
end $$;

-- Retira um perfil. O laboratório nunca fica sem administrador ativo.
create or replace function fn_remover_perfil(p_lab uuid, p_user uuid, p_perfil perfil_lab) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform fn_exigir_perfil(p_lab, '{}');
  if p_perfil = 'administrador' and not exists (
    select 1 from lab_membros where lab_id = p_lab and perfil = 'administrador' and ativo and user_id <> p_user
  ) then
    raise exception 'O laboratório precisa de pelo menos um administrador.';
  end if;
  update lab_membros set ativo = false where lab_id = p_lab and user_id = p_user and perfil = p_perfil;
end $$;

-- Lista de membros com nome e e-mail (perfis_usuario só mostra colegas; aqui o administrador vê todos do lab).
create or replace function fn_listar_membros(p_lab uuid)
returns table (user_id uuid, nome text, email text, perfis perfil_lab[])
language sql stable security definer set search_path = public as $$
  select m.user_id, p.nome, p.email, array_agg(m.perfil order by m.perfil)
  from lab_membros m join perfis_usuario p on p.id = m.user_id
  where fn_membro(p_lab) and m.lab_id = p_lab and m.ativo
  group by m.user_id, p.nome, p.email
  order by p.nome, p.email
$$;

-- Encerra o inventário quando todas as contagens foram decididas (aprovadas ou rejeitadas).
create or replace function fn_encerrar_inventario(p_inventario uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i inventarios%rowtype; v_pend int;
begin
  select * into i from inventarios where id = p_inventario for update;
  perform fn_exigir_perfil(i.lab_id, '{gestor}');
  if i.status = 'encerrado' then raise exception 'Inventário já encerrado.'; end if;
  select count(*) into v_pend from inventario_contagens where inventario_id = p_inventario and status in ('pendente', 'contada');
  if v_pend > 0 then raise exception 'Ainda há % posições sem contagem ou sem decisão do gestor.', v_pend; end if;
  update inventarios set status = 'encerrado', encerrado_em = now() where id = p_inventario;
end $$;

-- Nomes para a contagem às cegas (a view não expõe saldo antes da contagem).
create or replace view v_inventario_contagens_detalhe as
  select c.*, i.nome as item_nome, i.codigo as item_codigo, i.unidade_estoque, l.numero as lote_numero, lc.nome as local_nome
  from v_inventario_contagens c
  join itens i on i.id = c.item_id
  join lotes l on l.id = c.lote_id
  join locais lc on lc.id = c.local_id;
grant select on v_inventario_contagens_detalhe to authenticated;
