// Valida as migrações do LabEstoque num Postgres em memória (PGlite) com stubs do Supabase Auth,
// e roda um cenário ponta a ponta das regras do livro-razão.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);

for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
    console.log('OK   ', f);
  } catch (e) {
    console.log('ERRO ', f, e.message);
    process.exit(1);
  }
}

const U = '00000000-0000-0000-0000-000000000001';
const as = (u) => db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const expectErr = async (label, sql, p, contains) => {
  try { await db.query(sql, p); console.log('FALHOU (não deu erro):', label); process.exitCode = 1; }
  catch (e) { const ok = !contains || e.message.includes(contains); console.log(ok ? 'ok   ' : 'FALHOU', label, '→', e.message); if (!ok) process.exitCode = 1; }
};
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? 'ok   ' : 'FALHOU', label, ok ? '' : `→ obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`);
  if (!ok) process.exitCode = 1;
};

await db.query(`insert into auth.users values ($1, 'gestor@lab.br', '{"nome":"Gestora"}')`, [U]);
await as(U);
const { id: lab } = await one(`select fn_criar_laboratorio('Lab. de Biologia Celular', 'LBC') as id`);
await db.query(`insert into lab_membros values ($1, $2, 'gestor')`, [lab, U]);
const { id: proj } = await one(`insert into projetos (lab_id, codigo, nome) values ($1, 'P1', 'Projeto 1') returning id`, [lab]);
const { id: proj2 } = await one(`insert into projetos (lab_id, codigo, nome) values ($1, 'P2', 'Projeto 2') returning id`, [lab]);
const { id: labLocal } = await one(`insert into locais (lab_id, nivel, nome) values ($1, 'laboratorio', 'LBC') returning id`, [lab]);
const { id: sala101 } = await one(`insert into locais (lab_id, pai_id, nivel, nome) values ($1, $2, 'sala', 'Sala 101') returning id`, [lab, labLocal]);
const { id: geladeira } = await one(`insert into locais (lab_id, pai_id, nivel, nome, temp_min, temp_max) values ($1, $2, 'equipamento', 'Geladeira 1', 2, 8) returning id`, [lab, sala101]);
const { id: armario } = await one(`insert into locais (lab_id, pai_id, nivel, nome, temp_min, temp_max) values ($1, $2, 'equipamento', 'Armário', 15, 25) returning id`, [lab, sala101]);
const { id: item } = await one(`
  insert into itens (lab_id, codigo, nome, tipo, unidade_compra, unidade_estoque, fator_conversao, unidade_contavel, temp_min, temp_max, validade_pos_abertura_dias, criticidade)
  values ($1, 'DMEM', 'Meio DMEM', 'meio_cultura', 'frasco 500 mL', 'mL', 500, false, 2, 8, 30, 'V') returning id`, [lab]);

// Recebimento: 2 frascos × R$ 100 → 1000 mL a R$ 0,20/mL, em QUARENTENA
const { id: loteA } = await one(`select fn_receber($1, 'A1', current_date + 10, 2, $2, 100) as id`, [item, geladeira]);
const { id: loteB } = await one(`select fn_receber($1, 'B1', current_date + 200, 1, $2, 130) as id`, [item, geladeira]);
check('conversão para unidade de estoque', (await one(`select saldo from v_saldo where lote_id = $1`, [loteA])).saldo, '1000');
check('quarentena não é disponível', (await one(`select disponivel from v_disponivel where lote_id = $1`, [loteA])).disponivel, '0');
check('custo médio ponderado móvel', Number((await one(`select round(custo_medio, 4) c from itens where id = $1`, [item])).c), 0.22);

await db.query(`select fn_alterar_status_lote($1, 'LIBERADO', 'conferido')`, [loteA]);
await db.query(`select fn_alterar_status_lote($1, 'LIBERADO', 'conferido')`, [loteB]);
check('liberado vira disponível', (await one(`select disponivel from v_disponivel where lote_id = $1`, [loteA])).disponivel, '1000');

// FEFO
await expectErr('FEFO exige justificativa para outro lote', `select fn_dispensar($1, $2, 50, $3, 'cultivo')`, [loteB, geladeira, proj], 'Justifique');
await db.query(`select fn_dispensar($1, $2, 100, $3, 'cultivo')`, [loteA, geladeira, proj]);
check('primeira dispensação abre o lote', (await one(`select status from lotes where id = $1`, [loteA])).status, 'ABERTO');
await db.query(`select fn_dispensar($1, $2, 10, $3, 'teste', null, 'lote B já aberto na bancada')`, [loteB, geladeira, proj]);
await expectErr('saldo insuficiente', `select fn_dispensar($1, $2, 99999, $3, 'x')`, [loteA, geladeira, proj], 'insuficiente');

// Livro-razão imutável
await expectErr('UPDATE em movimentação bloqueado', `update movimentacoes set quantidade = 1`, [], 'imutáveis');
await expectErr('DELETE em movimentação bloqueado', `delete from movimentacoes`, [], 'imutáveis');
await expectErr('DELETE de item bloqueado', `delete from itens`, [], 'imutáveis');

// Saldo = Σ movimentações
check('saldo do lote A após dispensação', (await one(`select saldo from v_saldo where lote_id = $1`, [loteA])).saldo, '900');

// Reserva de item para P2: P1 não pode consumir o reservado
await db.query(`insert into reservas (lab_id, item_id, quantidade, projeto_id, uso_previsto, valida_ate) values ($1, $2, 1300, $3, current_date + 5, current_date + 10)`, [lab, item, proj2]);
check('disponível do item desconta reserva', (await one(`select disponivel from v_posicao_item where item_id = $1`, [item])).disponivel, '90');
await expectErr('reserva protege saldo de outro projeto', `select fn_dispensar($1, $2, 200, $3, 'x')`, [loteA, geladeira, proj], 'reservada');
await db.query(`select fn_dispensar($1, $2, 200, $3, 'x')`, [loteA, geladeira, proj2]);
check('reserva parcialmente consumida', (await one(`select quantidade from reservas where projeto_id = $1`, [proj2])).quantidade, '1100');

// Devolução: lote derivado BLOQUEADO, fora do disponível até avaliação
const { id: dev } = await one(`select fn_devolver($1, $2, 50, 'aberto') as id`, [loteA, geladeira]);
const der = await one(`select l.id, l.status from lotes l where lote_origem_id = $1`, [loteA]);
check('devolvido entra BLOQUEADO', der.status, 'BLOQUEADO');
check('devolvido não é disponível', (await one(`select disponivel from v_disponivel where lote_id = $1`, [der.id])).disponivel, '0');
check('lote original continua disponível', (await one(`select status from lotes where id = $1`, [loteA])).status, 'ABERTO');
await db.query(`select fn_avaliar_devolucao($1, 'reintegrar')`, [dev]);
check('reintegrado volta como ABERTO', (await one(`select status from lotes where id = $1`, [der.id])).status, 'ABERTO');

// Transferência incompatível
await expectErr('temperatura incompatível', `select fn_transferir($1, $2, $3, 10)`, [loteA, geladeira, armario], 'incompatível');

// Perda e estorno
const { id: perda } = await one(`select fn_registrar_perda($1, $2, 20, 'contaminacao') as id`, [loteA, geladeira]);
await expectErr('perda "outro" exige descrição', `select fn_registrar_perda($1, $2, 1, 'outro')`, [loteA, geladeira], 'Descreva');
await db.query(`select fn_estornar($1, 'registrado no lote errado')`, [perda]);
check('estorno anula a perda', (await one(`select saldo from v_saldo where lote_id = $1`, [loteA])).saldo, '700');
await expectErr('não estorna duas vezes', `select fn_estornar($1, 'de novo')`, [perda], 'já foi estornada');

// Inventário às cegas
const { id: inv } = await one(`select fn_iniciar_inventario($1, 'ciclico', $2) as id`, [lab, geladeira]);
const c = await one(`select id from inventario_contagens where inventario_id = $1 and lote_id = $2`, [inv, loteA]);
check('saldo oculto antes da contagem', (await one(`select saldo_sistema from v_inventario_contagens where id = $1`, [c.id])).saldo_sistema, null);
await db.query(`select fn_registrar_contagem($1, 690)`, [c.id]);
const cc = await one(`select saldo_sistema, divergencia, dentro_tolerancia from v_inventario_contagens where id = $1`, [c.id]);
check('divergência e tolerância (−10 mL de 700 = 1,4%)', [cc.saldo_sistema, cc.divergencia, cc.dentro_tolerancia], ['700', '-10', true]);
await db.query(`select fn_aprovar_ajuste($1, true, 'evaporação')`, [c.id]);
check('ajuste aprovado gera movimentação', (await one(`select saldo from v_saldo where lote_id = $1`, [loteA])).saldo, '690');

// Requisição e encerramento
const { id: req } = await one(`insert into requisicoes (lab_id, projeto_id, finalidade) values ($1, $2, 'aula') returning id`, [lab, proj]);
const { id: linha } = await one(`insert into requisicao_linhas (lab_id, requisicao_id, item_id, qtd_solicitada) values ($1, $2, $3, 30) returning id`, [lab, req, item]);
await db.query(`select fn_enviar_requisicao($1)`, [req]);
await db.query(`select fn_dispensar($1, $2, 20, $3, 'aula', $4)`, [loteA, geladeira, proj, linha]);
await expectErr('motivo obrigatório no atendimento parcial', `select fn_encerrar_requisicao($1)`, [req], 'motivo');
const st = await one(`select fn_encerrar_requisicao($1, $2) s`, [req, JSON.stringify({ [linha]: { motivo: 'falta', causa_ruptura: 'atraso_fornecedor' } })]);
check('requisição parcial', st.s, 'parcial');

// KPIs: dados agregados e snapshot idempotente
const saidas = (await db.query(`select tipo, sum(quantidade) q from fn_kpi_saidas($1, now() - interval '1 day', now() + interval '1 day') group by tipo order by tipo`, [lab])).rows;
check('saídas agregadas', saidas.map((r) => [r.tipo, r.q]), [['DISPENSACAO', '330'], ['DEVOLUCAO', '50'], ['PERDA', '20']]);
await db.exec(`select fn_snapshot_diario(); select fn_snapshot_diario();`);
check('snapshot idempotente', Number((await one(`select count(*) n from snapshot_itens`)).n), 1);
const cons = await one(`select consumo, saidas from fn_consumo_itens($1)`, [lab]);
check('consumo líquido (330 − 50 reintegrado)', [Number(cons.consumo), Number(cons.saidas)], [280, 4]);
check('auditoria registrou alterações', Number((await one(`select count(*) n from auditoria`)).n) > 10, true);

console.log(process.exitCode ? '\nHÁ FALHAS' : '\nTodas as verificações passaram.');

// Demonstração: roda num laboratório vazio e alimenta os KPIs
const { id: labDemo } = await one(`select fn_criar_laboratorio('Lab. Demo') as id`);
await db.query(`select fn_carregar_demonstracao($1)`, [labDemo]);
const resumo = await one(`select (select count(*) from itens where lab_id = $1) itens, (select count(*) from movimentacoes where lab_id = $1) movs,
  (select count(*) from snapshot_itens where lab_id = $1) snaps, (select count(*) from lotes where lab_id = $1 and status = 'QUARENTENA') quarentena`, [labDemo]);
console.log('demo :', resumo);
check('demonstração cria 8 itens e 1 lote em quarentena', [Number(resumo.itens), Number(resumo.quarentena)], [8, 1]);
await expectErr('demonstração não roda duas vezes', `select fn_carregar_demonstracao($1)`, [labDemo], 'vazio');
console.log(process.exitCode ? '\nHÁ FALHAS' : '\nDemonstração verificada.');

// Integridade dos cadastros
const { id: labB } = await one(`select fn_criar_laboratorio('Outro lab') as id`);
const { id: catB } = await one(`insert into categorias (lab_id, nome) values ($1, 'Cat B') returning id`, [labB]);
await expectErr('item não usa categoria de outro laboratório', `update itens set categoria_id = $1 where id = $2`, [catB, item], 'outro laboratório');
await expectErr('item com faixa de temperatura invertida', `update itens set temp_min = 9, temp_max = 2 where id = $1`, [item], 'máxima');
await expectErr('reposição manual exige justificativa', `update itens set pr_manual = 10 where id = $1`, [item], 'Justifique');
const { id: raiz } = await one(`insert into locais (lab_id, nivel, nome) values ($1, 'laboratorio', 'Raiz') returning id`, [lab]);
const { id: sala } = await one(`insert into locais (lab_id, pai_id, nivel, nome) values ($1, $2, 'sala', 'Sala') returning id`, [lab, raiz]);
const { id: frz } = await one(`insert into locais (lab_id, pai_id, nivel, nome) values ($1, $2, 'equipamento', 'Freezer') returning id`, [lab, sala]);
await expectErr('local fora da raiz precisa de pai', `insert into locais (lab_id, nivel, nome) values ($1, 'sala', 'Solta')`, [lab], 'raiz');
await expectErr('nível do pai precisa ser acima', `insert into locais (lab_id, pai_id, nivel, nome) values ($1, $2, 'sala', 'Sala no freezer')`, [lab, frz], 'não pode ficar dentro');
await expectErr('sem ciclo na hierarquia', `update locais set pai_id = $1, nivel = 'laboratorio' where id = $2`, [frz, raiz], 'não pode ficar dentro');
await expectErr('lab de cadastro não muda', `update itens set lab_id = $1 where id = $2`, [labB, item], 'outro laboratório');
await expectErr('coordenador precisa ser membro', `update projetos set coordenador_id = gen_random_uuid() where id = $1`, [proj], 'membro');
console.log(process.exitCode ? '\nHÁ FALHAS' : '\nIntegridade dos cadastros verificada.');

// Equipamentos: manutenção e calibração
const { id: bal } = await one(`insert into equipamentos (lab_id, codigo, nome, tipo, exige_calibracao, periodicidade_calibracao_dias, periodicidade_manutencao_dias, local_id)
  values ($1, 'PAT-001', 'Balança analítica', 'balanca', true, 365, 180, $2) returning id`, [lab, sala101]);
const sit = async () => (await one(`select situacao from v_equipamentos_situacao where equipamento_id = $1`, [bal])).situacao;
await expectErr('exige calibração sem periodicidade', `insert into equipamentos (lab_id, codigo, nome, tipo, exige_calibracao) values ($1, 'X', 'X', 'pipeta', true)`, [lab], 'periodicidade');
await expectErr('local de outro laboratório', `update equipamentos set local_id = (select id from locais where lab_id = $1 limit 1) where id = $2`, [labDemo, bal], 'outro laboratório');
check('sem calibração registrada', await sit(), 'sem_calibracao');
await expectErr('não agenda no passado', `select fn_agendar_servico($1, 'calibracao', current_date - 1)`, [bal], 'passado');
const { id: agCal } = await one(`select fn_agendar_servico($1, 'calibracao', current_date + 7, 'Lab. Cal RBC') as id`, [bal]);
check('agenda aparece na situação', (await one(`select calibracao_agendada is not null a from v_equipamentos_situacao where equipamento_id = $1`, [bal])).a, true);
await expectErr('calibração exige resultado', `select fn_concluir_servico($1, current_date)`, [agCal], 'resultado');
await db.query(`select fn_concluir_servico($1, current_date - 400, null, null, null, 850, 'aprovado', 'CERT-123')`, [agCal]);
check('validade padrão = realização + periodicidade → vencida', await sit(), 'calibracao_vencida');
await expectErr('serviço concluído é imutável', `update servicos_equipamento set custo = 1 where id = $1`, [agCal], 'encerrado');
await db.query(`select fn_concluir_servico(null, current_date - 340, null, null, null, null, 'aprovado', 'CERT-124', null, null, null, $1, 'calibracao')`, [bal]);
check('calibração vence em 25 dias → a vencer', await sit(), 'calibracao_a_vencer');
await db.query(`select fn_concluir_servico(null, current_date, null, null, null, null, 'reprovado', 'CERT-125', null, current_date + 365, null, $1, 'calibracao')`, [bal]);
check('última calibração reprovada', await sit(), 'calibracao_reprovada');
await db.query(`select fn_concluir_servico(null, current_date, null, null, null, null, 'aprovado', 'CERT-126', null, current_date + 365, null, $1, 'calibracao')`, [bal]);
check('sem preventiva registrada', await sit(), 'sem_manutencao');
await db.query(`select fn_concluir_servico(null, current_date - 200, 'limpeza e ajuste', null, null, null, null, null, null, null, null, $1, 'manutencao_preventiva')`, [bal]);
check('preventiva vencida há 20 dias → atrasada', await sit(), 'manutencao_atrasada');
await expectErr('resultado só em calibração', `select fn_concluir_servico(null, current_date, null, null, null, null, 'aprovado', null, null, null, null, $1, 'manutencao_preventiva')`, [bal], 'só se aplicam');
const { id: corr } = await one(`select fn_iniciar_manutencao($1, 'display apagado') as id`, [bal]);
check('corretiva em andamento → em manutenção', await sit(), 'em_manutencao');
await db.query(`select fn_concluir_servico($1, current_date, 'troca da fonte', 'Assistência X', null, 320)`, [corr]);
await db.query(`select fn_concluir_servico(null, current_date, 'preventiva semestral', null, null, null, null, null, null, null, null, $1, 'manutencao_preventiva')`, [bal]);
check('tudo em dia', await sit(), 'ok');
const { id: agMan } = await one(`select fn_agendar_servico($1, 'manutencao_preventiva', current_date + 170) as id`, [bal]);
await expectErr('cancelar exige motivo', `select fn_cancelar_servico($1, ' ')`, [agMan], 'motivo');
await db.query(`select fn_reagendar_servico($1, current_date + 175, 'técnico indisponível')`, [agMan]);
await db.query(`select fn_cancelar_servico($1, 'equipamento será substituído')`, [agMan]);
check('cancelado guarda o motivo', (await one(`select status from servicos_equipamento where id = $1`, [agMan])).status, 'cancelado');
await expectErr('serviço não é apagado', `delete from servicos_equipamento`, [], 'imutáveis');
console.log(process.exitCode ? '\nHÁ FALHAS' : '\nEquipamentos verificados.');

// Demonstração de equipamentos
await db.query(`select fn_demo_equipamentos($1)`, [labDemo]);
const sits = (await db.query(`select codigo, situacao from v_equipamentos_situacao where lab_id = $1 order by codigo`, [labDemo])).rows;
check('situações da demonstração', sits.map((r) => `${r.codigo}:${r.situacao}`),
  ['PAT-0101:ok', 'PAT-0230:manutencao_atrasada', 'PAT-0315:em_manutencao', 'PIP-020:calibracao_a_vencer', 'TER-004:calibracao_vencida']);
console.log(process.exitCode ? '\nHÁ FALHAS' : '\nDemonstração de equipamentos verificada.');
