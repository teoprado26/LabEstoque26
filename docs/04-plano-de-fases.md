# 4. Plano de fases

O catálogo de KPIs (item 3) está em [`src/kpis/catalog.ts`](../src/kpis/catalog.ts): é configuração lida pelo próprio app, com fórmula, numerador, denominador, polaridade, meta, limite, amostra mínima, filtros e texto de metodologia de cada KPI.

## Fase 1 — Núcleo operacional (MVP)

| Etapa | Entrega | Situação |
|---|---|---|
| 1.1 | Projeto Expo + NativeWind + Supabase, tema do design system, fontes | feito |
| 1.2 | Migração SQL: laboratórios, perfis, cadastros, locais hierárquicos, lotes, livro-razão imutável, auditoria, RLS | feito |
| 1.3 | Views `v_saldo`, `v_disponivel`, `v_consumo_diario`, `v_posicao_item`; snapshot diário | feito |
| 1.4 | Domínio em TypeScript com testes: FEFO, quantidade utilizável, cobertura, reposição (ES/PR/Emáx), valor em risco, KPIs K01–K04, K07, K09, K12–K16 | feito |
| 1.5 | Login (Google, link por e-mail, senha com mostrar/ocultar), sessão mantida no aparelho, seleção de laboratório, abas | feito (Google exige configurar o provedor no Supabase) |
| 1.6 | Cadastros: itens, locais, fornecedores, projetos, categorias, equipamentos | feito |
| 1.7 | Recebimento com quarentena e liberação; etiqueta com QR | feito |
| 1.8 | Dispensação FEFO com leitura de QR e justificativa de troca de lote | feito |
| 1.9 | Requisições (criar, aprovar, atender, encerrar com motivo/ruptura), devoluções e avaliação, perdas, transferências | feito; reservas e estorno pela tela: próximo (regras no banco) |
| 1.10 | Inventário às cegas com aprovação de ajuste e encerramento | feito |
| 1.11 | Painel didático: alertas (vencimentos, próximas compras, equipamentos, pendências) e KPIs explicados | feito |
| 1.12 | Ficha do produto: visão geral, lotes e rastreabilidade (linha do tempo por item e por lote) | feito |
| 1.13 | Gestão de membros e perfis por laboratório | feito |
| 1.14 | Equipamentos: cadastro, agenda e registro de manutenção (preventiva/corretiva) e calibração, situação única (`v_equipamentos_situacao`) com alertas no painel | feito (incluído a pedido) |

**Critérios de aceite da Fase 1:** saldo = Σ movimentações e nenhuma tela edita saldo; lote devolvido não aparece como disponível até liberação; reserva planejada não conta como ruptura; denominador zero mostra "Dados insuficientes"; cobertura, PR e índice de perdas batem com os valores esperados na base de testes.

## Fase 2 — Abastecimento e análise
Compras e etapas do ciclo; K05, K06, K08, K10, K11, K17–K22; curva ABC-VED; Pareto (componente único); PDF e Excel/CSV a partir do mesmo serviço de KPIs.

## Fase 3 — Armazenamento e inteligência
Capacidade e mapa de ocupação; verificações de armazenamento (K23–K25); K26; motor de recomendações com plano de ação e verificação de eficácia; integração opcional com sensores de temperatura.
