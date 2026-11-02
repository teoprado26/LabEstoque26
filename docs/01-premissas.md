# 1. Premissas e dúvidas

## Premissas adotadas

### Negócio
1. **Não há venda.** Todo valor é custo de aquisição, valorado por **custo médio ponderado móvel** por item e laboratório. O custo do lote (quando conhecido) é usado para valorar perdas daquele lote.
2. "Cliente" = **solicitante interno**; "pedido" = **requisição interna**. O custo de consumo é apropriado ao **projeto / fonte de recurso** informado na dispensação.
3. Laboratório padrão: **Lab. de Biologia Celular**. O sistema já nasce multi-laboratório, com isolamento por `lab_id` garantido por RLS no Postgres.
4. Um usuário pode pertencer a mais de um laboratório, com um perfil por laboratório (Administrador, Gestor, Técnico, Solicitante, Coordenador, Auditor).
5. Metas da especificação são **valores iniciais**, editáveis por laboratório.

### Técnica
6. **Front-end:** Expo SDK 58 + Expo Router + NativeWind 4 (Tailwind 3), um só código para Android, iOS e Web.
7. **Back-end:** Supabase (Postgres + Auth + RLS + pg_cron). O Appwrite citado no início foi trocado por Supabase a pedido do usuário.
8. **Fonte da verdade:** tabela `movimentacoes` só aceita `INSERT` (trigger bloqueia `UPDATE`/`DELETE`). Correção = movimentação `ESTORNO` que referencia a original.
9. **Saldo** é a view `v_saldo` (Σ movimentações por item × lote × local). Não existe coluna de saldo editável.
10. **"Disponível"** tem uma única definição, na view `v_disponivel` (seção 4 do prompt). Telas, alertas e KPIs leem só dela. O TypeScript tem a mesma regra em `src/domain/disponibilidade.ts`, usada apenas para simulações e testes, e coberta por testes que comparam com a definição SQL.
11. **KPIs:** cada KPI tem uma única função de cálculo em `src/kpis/` (fórmula pura, testada) alimentada por RPCs SQL. Painel, PDF e Excel chamam a mesma função.
12. **Snapshot diário:** função `fn_snapshot_diario(data)` idempotente (upsert por data), agendada no pg_cron às 00:30 America/Sao_Paulo.
13. **Datas:** gravadas em `timestamptz` (UTC), exibidas em America/Sao_Paulo e pt-BR.
14. **Exclusão:** sempre lógica (`ativo = false` / `excluido_em`). Registros com movimentação nunca são apagados.
15. **Auditoria:** trigger genérico grava em `auditoria` (usuário, data, tabela, registro, valor anterior e novo em JSON). A tabela de auditoria também só aceita `INSERT`.
16. **Conversão de unidades:** no recebimento, `quantidade_compra × fator_conversao` vira unidade de estoque. O livro-razão guarda só a unidade de estoque.
17. **QR code:** o conteúdo do QR é `labestoque://lote/<uuid>`. A leitura usa `expo-camera` (já traz o leitor de código de barras).
18. **Offline:** fora da Fase 1. O app exige conexão para registrar movimentações, o que garante a ordem do livro-razão.

## Dúvidas em aberto (com o padrão que adotei até você responder)

| # | Dúvida | Padrão adotado |
|---|---|---|
| D1 | A aprovação de requisição pelo coordenador é obrigatória para todo projeto? | Configurável por projeto (`exige_aprovacao`), desligada por padrão. |
| D2 | Um técnico pode dispensar sem requisição (balcão)? | Sim, com projeto e finalidade obrigatórios. Gera uma requisição "atendida na hora" para não perder o K02. |
| D3 | A validade após abertura conta a partir da primeira dispensação? | Sim: a primeira dispensação de um lote LIBERADO o passa a ABERTO e grava `aberto_em`. |
| D4 | Fracionamento: o consumo de um frasco aberto é registrado em mL ou em frascos? | Na unidade de estoque do item (ex.: mL). Itens contáveis usam `un`. |
| D5 | Produtos controlados (PF/Exército) precisam de relatório próprio já na Fase 1? | Não. Na Fase 1 só há a marcação e um filtro. |
| D6 | Itens doados ou sem custo entram nos KPIs financeiros? | Excluídos por padrão (`incluir_sem_custo = false` nos parâmetros). |
| D7 | Quem libera um lote da quarentena? | Gestor de estoque. O técnico pode, se o parâmetro `tecnico_libera_lote` estiver ligado. |
| D8 | Login: e-mail e senha, link mágico ou SSO institucional? | E-mail e senha do Supabase Auth na Fase 1. SSO fica para depois. |
| D9 | Haverá importação de cadastro inicial (planilha de itens e saldos)? | Previsto na Fase 1 como carga via CSV → movimentação ENTRADA "saldo inicial". |
