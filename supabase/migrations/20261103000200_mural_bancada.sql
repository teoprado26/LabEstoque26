-- Mural da equipe (comunicados e tarefas coletivas, com comentários) e fotos da bancada que somem em 24 h.
-- Funções vindas do protótipo LabEstoqueGG, aqui ligadas ao banco real, com isolamento por laboratório.

-- =====================================================================
-- Mural de atividades
-- =====================================================================
create table mural_atividades (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  autor_id uuid not null default auth.uid() references perfis_usuario (id),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  tag text not null default 'Rotina' check (tag in ('Rotina', 'Assepsia', 'Calibração', 'Amostras', 'Alerta')),
  criado_em timestamptz not null default now(),
  realizada_por uuid references perfis_usuario (id),
  realizada_em timestamptz,
  arquivada_em timestamptz
);

create table mural_comentarios (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  atividade_id uuid not null references mural_atividades (id),
  autor_id uuid not null default auth.uid() references perfis_usuario (id),
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now()
);

create index on mural_atividades (lab_id, criado_em desc);
create index on mural_comentarios (atividade_id, criado_em);

-- Comentário sempre no laboratório da atividade.
create or replace function fn_validar_comentario_mural() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from mural_atividades where id = new.atividade_id and lab_id = new.lab_id) then
    raise exception 'Atividade de outro laboratório.';
  end if;
  return new;
end $$;
create trigger trg_validar_comentario_mural before insert on mural_comentarios for each row execute function fn_validar_comentario_mural();

-- Concluir (ou reabrir) uma atividade: qualquer membro, exceto auditor.
create or replace function fn_concluir_atividade(p_atividade uuid, p_concluida boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare a mural_atividades%rowtype;
begin
  select * into a from mural_atividades where id = p_atividade;
  if not found then raise exception 'Atividade inexistente.'; end if;
  perform fn_exigir_perfil(a.lab_id, '{solicitante,tecnico,gestor,coordenador}');
  update mural_atividades
    set realizada_por = case when p_concluida then auth.uid() end, realizada_em = case when p_concluida then now() end
  where id = p_atividade;
end $$;

-- Arquivar: o autor ou um gestor (some do mural; o registro fica).
create or replace function fn_arquivar_atividade(p_atividade uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a mural_atividades%rowtype;
begin
  select * into a from mural_atividades where id = p_atividade;
  if a.autor_id is distinct from auth.uid() then perform fn_exigir_perfil(a.lab_id, '{gestor}'); end if;
  update mural_atividades set arquivada_em = now() where id = p_atividade;
end $$;

alter table mural_atividades enable row level security;
alter table mural_comentarios enable row level security;
create policy membro_le on mural_atividades for select to authenticated using (fn_membro(lab_id));
create policy membro_publica on mural_atividades for insert to authenticated
  with check (autor_id = auth.uid() and fn_tem_perfil(lab_id, '{solicitante,tecnico,gestor,coordenador}') and realizada_em is null and arquivada_em is null);
create policy membro_le on mural_comentarios for select to authenticated using (fn_membro(lab_id));
create policy membro_comenta on mural_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and fn_tem_perfil(lab_id, '{solicitante,tecnico,gestor,coordenador}'));

create view v_mural as
  select a.id, a.lab_id, a.titulo, a.descricao, a.tag, a.criado_em, a.realizada_em, a.autor_id,
    coalesce(nullif(pa.nome, ''), pa.email) as autor_nome,
    coalesce(nullif(pr.nome, ''), pr.email) as realizada_por_nome,
    (select count(*) from mural_comentarios c where c.atividade_id = a.id) as comentarios
  from mural_atividades a
  join perfis_usuario pa on pa.id = a.autor_id
  left join perfis_usuario pr on pr.id = a.realizada_por
  where fn_membro(a.lab_id) and a.arquivada_em is null;

create view v_mural_comentarios as
  select c.id, c.lab_id, c.atividade_id, c.texto, c.criado_em, c.autor_id, coalesce(nullif(p.nome, ''), p.email) as autor_nome,
    (select array_agg(m.perfil) from lab_membros m where m.lab_id = c.lab_id and m.user_id = c.autor_id and m.ativo) as autor_perfis
  from mural_comentarios c join perfis_usuario p on p.id = c.autor_id
  where fn_membro(c.lab_id);
grant select on v_mural, v_mural_comentarios to authenticated;

-- =====================================================================
-- Fotos da bancada (24 h)
-- =====================================================================
create table fotos_bancada (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  autor_id uuid not null default auth.uid() references perfis_usuario (id),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  tag text,
  -- caminho no bucket "bancada": <lab_id>/<autor_id>/<arquivo>
  caminho text not null,
  postada_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '24 hours',
  check (expira_em > postada_em and expira_em <= postada_em + interval '24 hours')
);

create table fotos_curtidas (
  foto_id uuid not null references fotos_bancada (id),
  user_id uuid not null default auth.uid() references perfis_usuario (id),
  lab_id uuid not null references laboratorios (id),
  em timestamptz not null default now(),
  primary key (foto_id, user_id)
);

create table fotos_comentarios (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references laboratorios (id),
  foto_id uuid not null references fotos_bancada (id),
  autor_id uuid not null default auth.uid() references perfis_usuario (id),
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now()
);

create or replace function fn_validar_interacao_foto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from fotos_bancada where id = new.foto_id and lab_id = new.lab_id and expira_em > now()) then
    raise exception 'Foto expirada ou de outro laboratório.';
  end if;
  return new;
end $$;
create trigger trg_validar_curtida before insert on fotos_curtidas for each row execute function fn_validar_interacao_foto();
create trigger trg_validar_comentario_foto before insert on fotos_comentarios for each row execute function fn_validar_interacao_foto();

-- A foto precisa estar na pasta do laboratório e do autor.
create or replace function fn_validar_foto() returns trigger
language plpgsql as $$
begin
  if split_part(new.caminho, '/', 1) <> new.lab_id::text or split_part(new.caminho, '/', 2) <> new.autor_id::text then
    raise exception 'Caminho da foto fora da pasta do laboratório e do autor.';
  end if;
  return new;
end $$;
create trigger trg_validar_foto before insert on fotos_bancada for each row execute function fn_validar_foto();

alter table fotos_bancada enable row level security;
alter table fotos_curtidas enable row level security;
alter table fotos_comentarios enable row level security;
create policy membro_ve_vigentes on fotos_bancada for select to authenticated using (fn_membro(lab_id) and expira_em > now());
create policy membro_posta on fotos_bancada for insert to authenticated
  with check (autor_id = auth.uid() and fn_tem_perfil(lab_id, '{solicitante,tecnico,gestor,coordenador}'));
create policy autor_remove on fotos_bancada for delete to authenticated using (autor_id = auth.uid() or fn_tem_perfil(lab_id, '{gestor}'));
create policy membro_le on fotos_curtidas for select to authenticated using (fn_membro(lab_id));
create policy proprio_curte on fotos_curtidas for insert to authenticated with check (user_id = auth.uid() and fn_membro(lab_id));
create policy proprio_descurte on fotos_curtidas for delete to authenticated using (user_id = auth.uid());
create policy membro_le on fotos_comentarios for select to authenticated using (fn_membro(lab_id));
create policy membro_comenta on fotos_comentarios for insert to authenticated with check (autor_id = auth.uid() and fn_membro(lab_id));

create view v_fotos_bancada as
  select f.id, f.lab_id, f.titulo, f.descricao, f.tag, f.caminho, f.postada_em, f.expira_em, f.autor_id,
    coalesce(nullif(p.nome, ''), p.email) as autor_nome,
    (select count(*) from fotos_curtidas c where c.foto_id = f.id) as curtidas,
    exists (select 1 from fotos_curtidas c where c.foto_id = f.id and c.user_id = auth.uid()) as curtida_por_mim,
    (select count(*) from fotos_comentarios c where c.foto_id = f.id) as comentarios
  from fotos_bancada f join perfis_usuario p on p.id = f.autor_id
  where fn_membro(f.lab_id) and f.expira_em > now();

create view v_fotos_comentarios as
  select c.id, c.lab_id, c.foto_id, c.texto, c.criado_em, coalesce(nullif(p.nome, ''), p.email) as autor_nome
  from fotos_comentarios c join perfis_usuario p on p.id = c.autor_id
  where fn_membro(c.lab_id);
grant select on v_fotos_bancada, v_fotos_comentarios to authenticated;

-- Limpeza: remove registros de fotos vencidas há mais de 1 dia (o arquivo sai do Storage pelo app ou pelo job).
create or replace function fn_limpar_fotos_vencidas() returns setof text
language plpgsql security definer set search_path = public as $$
begin
  return query
  with velhas as (select id, caminho from fotos_bancada where expira_em < now() - interval '1 day'),
       c as (delete from fotos_comentarios where foto_id in (select id from velhas)),
       k as (delete from fotos_curtidas where foto_id in (select id from velhas)),
       f as (delete from fotos_bancada where id in (select id from velhas) returning caminho)
  select caminho from f;
end $$;
revoke execute on function fn_limpar_fotos_vencidas() from public, anon, authenticated;

-- =====================================================================
-- Storage: bucket privado "bancada"; cada laboratório só lê e grava a própria pasta
-- =====================================================================
insert into storage.buckets (id, name, public) values ('bancada', 'bancada', false) on conflict (id) do nothing;

create policy bancada_le on storage.objects for select to authenticated
  using (bucket_id = 'bancada' and fn_membro(((storage.foldername(name))[1])::uuid));
create policy bancada_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'bancada' and fn_membro(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2] = auth.uid()::text);
create policy bancada_remove on storage.objects for delete to authenticated
  using (bucket_id = 'bancada' and (storage.foldername(name))[2] = auth.uid()::text);

-- =====================================================================
-- Demonstração: algumas atividades no mural
-- =====================================================================
create or replace function fn_demo_mural(p_lab uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  perform fn_exigir_perfil(p_lab, '{}');
  if exists (select 1 from mural_atividades where lab_id = p_lab) then return; end if;
  insert into mural_atividades (lab_id, autor_id, titulo, descricao, tag, criado_em)
  values (p_lab, auth.uid(), 'Assepsia da cabine de biossegurança', 'Limpar com etanol 70% antes e depois do uso; registrar no caderno da cabine.', 'Assepsia', now() - interval '2 days')
  returning id into a;
  insert into mural_comentarios (lab_id, atividade_id, autor_id, texto, criado_em) values (p_lab, a, auth.uid(), 'Feito na quinta à tarde.', now() - interval '1 day');
  insert into mural_atividades (lab_id, autor_id, titulo, descricao, tag) values
    (p_lab, auth.uid(), 'Calibração das pipetas agendada', 'O laboratório de calibração retira as pipetas na próxima semana. Separar as de 20–200 µL.', 'Calibração'),
    (p_lab, auth.uid(), 'Freezer −20 °C: degelo pendente', 'Preventiva atrasada. Remanejar as caixas para o freezer reserva antes do degelo.', 'Alerta');
end $$;
