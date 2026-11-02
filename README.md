# LabEstoque

Gestão de estoque laboratorial para consumo interno: rastreabilidade por lote, FEFO, reposição baseada em dados e indicadores com definição única.
Expo SDK 58 + Expo Router + NativeWind 4 · Supabase (Postgres, Auth, RLS) · Android, iOS e Web.

## Documentos
- [Premissas e dúvidas](docs/01-premissas.md)
- [Modelo de dados (ER)](docs/02-modelo-de-dados.md)
- [Catálogo de KPIs](src/kpis/catalog.ts): configuração lida pelo app
- [Plano de fases](docs/04-plano-de-fases.md)
- Design system: tokens em [src/theme/tokens.ts](src/theme/tokens.ts) e [tailwind.config.js](tailwind.config.js)

## Como rodar

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito serve).
2. No painel do Supabase, abra **SQL Editor** e rode, em ordem, os arquivos de [`supabase/migrations/`](supabase/migrations/).
   Com a Supabase CLI: `npx supabase link` e `npx supabase db push`.
3. Opcional: em **Database → Extensions**, habilite `pg_cron` e rode
   `select cron.schedule('job-diario', '30 3 * * *', $$ select fn_job_diario() $$);` (vencimento automático e snapshot diário às 00:30 de Brasília).
4. Copie `.env.example` para `.env.local` e preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API).
5. `npm install` e `npx expo start`. Abra no celular pelo Expo Go (QR no terminal), ou aperte `w` para a versão web.
6. Crie a conta, crie o laboratório e, na aba **Mais**, carregue os dados de demonstração.

A leitura de QR usa a câmera (`expo-camera`), que já vem no Expo Go.

## Testes

```bash
npm test          # domínio e KPIs com valores esperados conhecidos (Vitest)
npm run test:sql  # migrações + cenário do livro-razão num Postgres em memória (PGlite)
npm run typecheck
```

## Regras que o banco garante
- `movimentacoes` só aceita INSERT, e só pelas funções `fn_*` (sem política de escrita direta). Correção = `fn_estornar`.
- Saldo = `v_saldo` (Σ movimentações). "Disponível" = `v_disponivel`, a única definição usada por telas, alertas e KPIs.
- Lote devolvido vira lote derivado BLOQUEADO até a avaliação do gestor (`fn_avaliar_devolucao`).
- Reserva planejada protege o saldo de outros projetos e não conta como ruptura.
- Contagem de inventário às cegas (`v_inventario_contagens` oculta o saldo até a contagem); ajuste só com aprovação.
- Auditoria imutável em `auditoria`; exclusão física bloqueada em cadastros.
