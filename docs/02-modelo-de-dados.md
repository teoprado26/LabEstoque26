# 2. Modelo de dados

Todas as tabelas de negócio têm `id uuid`, `lab_id uuid` (isolamento por RLS), `criado_em`, `criado_por`. O SQL completo da Fase 1 está em [`supabase/migrations/`](../supabase/migrations/).

```mermaid
erDiagram
  laboratorios ||--o{ lab_membros : tem
  perfis_usuario ||--o{ lab_membros : participa
  laboratorios ||--|| parametros_lab : configura

  categorias ||--o{ itens : agrupa
  itens ||--o{ lotes : possui
  fornecedores ||--o{ lotes : fornece
  locais ||--o{ locais : contem
  projetos ||--o{ movimentacoes : apropria

  itens ||--o{ movimentacoes : registra
  lotes ||--o{ movimentacoes : registra
  locais ||--o{ movimentacoes : "origem/destino"
  movimentacoes ||--o| movimentacoes : estorna

  requisicoes ||--o{ requisicao_linhas : contem
  requisicao_linhas ||--o{ movimentacoes : atende
  projetos ||--o{ requisicoes : financia
  itens ||--o{ requisicao_linhas : pede

  reservas }o--|| itens : reserva
  reservas }o--o| lotes : "lote opcional"
  reservas }o--|| projetos : para

  inventarios ||--o{ inventario_contagens : contem
  inventario_contagens }o--|| lotes : conta
  inventario_contagens }o--|| locais : em
  inventario_contagens ||--o| movimentacoes : "ajuste aprovado"

  devolucoes ||--|| movimentacoes : gera
  lotes ||--o{ lote_status_historico : transita

  laboratorios ||--o{ snapshot_saldos : fotografa
  laboratorios ||--o{ snapshot_kpis : fotografa
  laboratorios ||--o{ metas_kpi : define
  laboratorios ||--o{ auditoria : registra

  itens {
    uuid id PK
    text codigo
    text nome
    uuid categoria_id FK
    text tipo
    text unidade_compra
    text unidade_estoque
    numeric fator_conversao
    numeric multiplo_embalagem
    numrange faixa_temperatura
    text classe_compatibilidade
    char criticidade "V/E/D"
    int validade_pos_abertura_dias
    text fds_url
    bool controlado
    bool ativo
    numeric lead_time_manual_dias
    numeric es_manual
    numeric pr_manual
    text justificativa_manual
  }
  lotes {
    uuid id PK
    uuid item_id FK
    text numero
    text fabricante
    uuid fornecedor_id FK
    date fabricacao
    date validade
    numeric custo_unitario
    text status
    timestamptz aberto_em
  }
  locais {
    uuid id PK
    uuid pai_id FK
    text nivel "laboratorio..posicao"
    text nome
    numrange faixa_temperatura
    text[] classes_aceitas
    numeric capacidade
    text unidade_capacidade
    bool conforme
  }
  movimentacoes {
    uuid id PK
    text tipo
    uuid item_id FK
    uuid lote_id FK
    uuid local_origem_id FK
    uuid local_destino_id FK
    numeric quantidade "sempre > 0"
    numeric custo_unitario
    uuid projeto_id FK
    text finalidade
    uuid requisicao_linha_id FK
    text motivo
    text justificativa_fefo
    uuid estorno_de FK
    timestamptz ocorrido_em
    timestamptz registrado_em
    uuid usuario_id
  }
  requisicoes {
    uuid id PK
    uuid solicitante_id
    uuid projeto_id FK
    text status
    timestamptz aprovada_em
    timestamptz atendida_em
  }
  requisicao_linhas {
    uuid id PK
    uuid requisicao_id FK
    uuid item_id FK
    numeric qtd_solicitada
    numeric qtd_aprovada
    numeric qtd_atendida
    text motivo_nao_atendimento
    text causa_ruptura
  }
  reservas {
    uuid id PK
    uuid item_id FK
    uuid lote_id FK
    numeric quantidade
    uuid projeto_id FK
    date uso_previsto
    date valida_ate
    text status
  }
  inventario_contagens {
    uuid id PK
    uuid inventario_id FK
    uuid item_id FK
    uuid lote_id FK
    uuid local_id FK
    numeric saldo_sistema
    numeric quantidade_contada
    numeric divergencia
    bool dentro_tolerancia
    text status
  }
```

## Sinal das quantidades no livro-razão

`quantidade` é sempre positiva; o efeito vem do tipo e dos locais:

| Tipo | Origem | Destino | Efeito no saldo |
|---|---|---|---|
| ENTRADA | — | local | + destino |
| DISPENSACAO | local | — | − origem |
| DEVOLUCAO | — | local | + destino (lote → BLOQUEADO) |
| TRANSFERENCIA | local A | local B | − A, + B |
| PERDA | local | — | − origem |
| AJUSTE_INVENTARIO | local (sobra: destino) | | ± conforme divergência |
| ESTORNO | inverte origem e destino da movimentação estornada | | anula a original |

## Views centrais (definição única)

- `v_saldo` — saldo físico por item × lote × local.
- `v_disponivel` — saldo em lote LIBERADO/ABERTO, dentro da validade (inclusive pós-abertura), em local `conforme`, menos reservas ativas.
- `v_consumo_diario` — dispensações − devoluções reintegradas, por item e dia.
- `v_posicao_item` — físico, disponível, reservado, em pedido (Fase 2: compras), posição projetada.
