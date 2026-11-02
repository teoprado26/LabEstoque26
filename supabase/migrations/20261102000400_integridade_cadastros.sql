-- Integridade dos cadastros, garantida no banco (a tela aplica as mesmas regras, mas a API pode ser chamada direto):
-- referências sempre do mesmo laboratório e hierarquia de locais sem ciclos e com nível descendente.

create or replace function fn_ordem_nivel(p nivel_local) returns int
language sql immutable as $$ select array_position(enum_range(null::nivel_local), p) $$;

create or replace function fn_validar_local() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pai locais%rowtype; v_atual uuid; v_passos int := 0;
begin
  if new.pai_id is null then
    if new.nivel <> 'laboratorio' then raise exception 'Só o nível laboratório fica na raiz; escolha onde este local fica.'; end if;
    return new;
  end if;
  select * into v_pai from locais where id = new.pai_id;
  if v_pai.lab_id is distinct from new.lab_id then raise exception 'O local pai pertence a outro laboratório.'; end if;
  if fn_ordem_nivel(v_pai.nivel) >= fn_ordem_nivel(new.nivel) then
    raise exception 'Um local de nível % não pode ficar dentro de um de nível %.', new.nivel, v_pai.nivel;
  end if;
  -- Sobe a partir do pai: encontrar o próprio local significa ciclo.
  v_atual := new.pai_id;
  while v_atual is not null and v_passos < 64 loop
    if v_atual = new.id then raise exception 'Hierarquia inválida: o local ficaria dentro dele mesmo.'; end if;
    select pai_id into v_atual from locais where id = v_atual;
    v_passos := v_passos + 1;
  end loop;
  return new;
end $$;

create trigger trg_validar_local before insert or update of pai_id, nivel, lab_id on locais
for each row execute function fn_validar_local();

create or replace function fn_validar_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.categoria_id is not null and not exists (select 1 from categorias where id = new.categoria_id and lab_id = new.lab_id) then
    raise exception 'A categoria pertence a outro laboratório.';
  end if;
  if new.temp_min is not null and new.temp_max is not null and new.temp_min > new.temp_max then
    raise exception 'A temperatura máxima deve ser maior ou igual à mínima.';
  end if;
  if (new.es_manual is not null or new.pr_manual is not null) and coalesce(trim(new.justificativa_manual), '') = '' then
    raise exception 'Justifique o estoque de segurança ou o ponto de reposição manual.';
  end if;
  return new;
end $$;

create trigger trg_validar_item before insert or update on itens
for each row execute function fn_validar_item();

create or replace function fn_validar_projeto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.coordenador_id is not null and not exists (select 1 from lab_membros where lab_id = new.lab_id and user_id = new.coordenador_id and ativo) then
    raise exception 'O coordenador precisa ser membro do laboratório.';
  end if;
  if new.exige_aprovacao and new.coordenador_id is null then
    raise exception 'Projeto que exige aprovação precisa de coordenador.';
  end if;
  return new;
end $$;

create trigger trg_validar_projeto before insert or update on projetos
for each row execute function fn_validar_projeto();

-- O laboratório de um cadastro nunca muda depois de criado.
create or replace function fn_lab_imutavel() returns trigger
language plpgsql as $$
begin
  if new.lab_id is distinct from old.lab_id then raise exception 'Não é possível mover um cadastro para outro laboratório.'; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['itens', 'locais', 'projetos', 'fornecedores', 'categorias', 'lotes'] loop
    execute format('create trigger trg_lab_imutavel before update of lab_id on %I for each row execute function fn_lab_imutavel()', t);
  end loop;
end $$;
