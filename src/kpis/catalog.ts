// Catálogo único de indicadores (seção 7). Painel, PDF e Excel leem daqui.
// Metas são valores de referência iniciais; cada laboratório sobrescreve em `metas_kpi`.

export type Polaridade = 'maior_melhor' | 'menor_melhor' | 'informativo' | 'tendencia_queda';
export type Granularidade = 'diaria' | 'periodo' | 'item' | 'pedido' | 'posicao';
export type Filtro = 'categoria' | 'local' | 'projeto' | 'fornecedor' | 'tipo' | 'criticidade' | 'abc';
export type Fase = 1 | 2 | 3;

export interface KpiDef {
  id: string;
  nome: string;
  objetivo: string;
  formula: string;
  numerador: string;
  denominador: string | null;
  fonte: string;
  granularidade: Granularidade;
  unidade: '%' | 'dias' | 'itens' | 'R$' | 'h' | 'giro' | 'eventos';
  polaridade: Polaridade;
  meta: number | null;
  limiteAlerta: number | null;
  /** Mínimo de observações no denominador para exibir valor. */
  minimoAmostra: number;
  filtros: Filtro[];
  metodologia: string;
  fase: Fase;
}

const TODOS: Filtro[] = ['categoria', 'local', 'projeto', 'fornecedor', 'tipo', 'criticidade', 'abc'];
const SEM_FORN: Filtro[] = ['categoria', 'local', 'projeto', 'tipo', 'criticidade', 'abc'];

export const KPIS: KpiDef[] = [
  // 7.1 Disponibilidade e atendimento
  {
    id: 'K01', nome: 'Disponibilidade de itens ativos', fase: 1,
    objetivo: 'Garantir que os itens ativos estejam disponíveis para uso.',
    formula: 'itens ativos com disponível > 0 ÷ itens ativos × 100 (média dos snapshots diários)',
    numerador: 'Σ dias × itens ativos com disponível > 0', denominador: 'Σ dias × itens ativos',
    fonte: 'snapshot_saldos + v_disponivel', granularidade: 'diaria', unidade: '%',
    polaridade: 'maior_melhor', meta: 95, limiteAlerta: 90, minimoAmostra: 1, filtros: SEM_FORN,
    metodologia: 'Para cada dia do período, conta os itens ativos com saldo disponível maior que zero (lote liberado ou aberto, dentro da validade, em local conforme, descontadas as reservas) e divide pelo total de itens ativos. O valor do período é a média dos dias. Itens vitais são exibidos separadamente, com meta de 98%.',
  },
  {
    id: 'K02', nome: 'Nível de atendimento (linhas)', fase: 1,
    objetivo: 'Medir quantas linhas de requisição foram atendidas por completo.',
    formula: 'linhas atendidas integralmente ÷ linhas totais × 100',
    numerador: 'linhas com qtd_atendida ≥ qtd_aprovada', denominador: 'linhas encerradas no período, exceto canceladas pelo solicitante e itens fora do catálogo',
    fonte: 'requisicao_linhas', granularidade: 'periodo', unidade: '%',
    polaridade: 'maior_melhor', meta: 95, limiteAlerta: 90, minimoAmostra: 5, filtros: SEM_FORN,
    metodologia: 'Considera as linhas de requisição encerradas no período. Requisições canceladas pelo solicitante e itens fora do catálogo não entram na conta.',
  },
  {
    id: 'K03', nome: 'Nível de atendimento (quantidade)', fase: 1,
    objetivo: 'Medir a fração da quantidade pedida que foi entregue.',
    formula: 'quantidade atendida ÷ quantidade solicitada × 100',
    numerador: 'Σ qtd_atendida', denominador: 'Σ qtd_solicitada (mesmas exclusões do K02)',
    fonte: 'requisicao_linhas', granularidade: 'periodo', unidade: '%',
    polaridade: 'maior_melhor', meta: 97, limiteAlerta: 92, minimoAmostra: 5, filtros: SEM_FORN,
    metodologia: 'Soma as quantidades atendidas e solicitadas, na unidade de estoque de cada item, das linhas encerradas no período.',
  },
  {
    id: 'K04', nome: 'Taxa de ruptura', fase: 1,
    objetivo: 'Medir as linhas não atendidas por falta de estoque.',
    formula: 'linhas não ou parcialmente atendidas por falta de estoque ÷ linhas totais × 100',
    numerador: 'linhas com causa_ruptura preenchida', denominador: 'linhas encerradas (mesmas exclusões do K02)',
    fonte: 'requisicao_linhas', granularidade: 'periodo', unidade: '%',
    polaridade: 'menor_melhor', meta: 3, limiteAlerta: 5, minimoAmostra: 5, filtros: SEM_FORN,
    metodologia: 'Uma linha é ruptura quando ficou não ou parcialmente atendida por falta de estoque. Não é ruptura a indisponibilidade causada só por reserva planejada, se o material está disponível para a finalidade reservada.',
  },
  {
    id: 'K05', nome: 'Dias em ruptura', fase: 2,
    objetivo: 'Medir a duração das faltas.',
    formula: 'Σ dias com disponível = 0 por item ativo; duração média por evento; eventos por item',
    numerador: 'dias-item com disponível = 0', denominador: null,
    fonte: 'snapshot_saldos', granularidade: 'item', unidade: 'dias',
    polaridade: 'tendencia_queda', meta: null, limiteAlerta: null, minimoAmostra: 1, filtros: SEM_FORN,
    metodologia: 'Um evento de ruptura começa no primeiro dia com disponível zero e termina no primeiro dia com disponível positivo.',
  },
  {
    id: 'K06', nome: 'Tempo de atendimento', fase: 2,
    objetivo: 'Medir a rapidez entre aprovação e atendimento.',
    formula: 'atendimento − aprovação (mediana e P90)',
    numerador: 'horas entre aprovada_em e atendida_em', denominador: null,
    fonte: 'requisicoes', granularidade: 'periodo', unidade: 'h',
    polaridade: 'menor_melhor', meta: null, limiteAlerta: null, minimoAmostra: 5, filtros: SEM_FORN,
    metodologia: 'Mediana e percentil 90 das requisições atendidas no período. Requisições sem aprovação usam a data de criação.',
  },
  // 7.2 Estoque, cobertura e reposição
  {
    id: 'K07', nome: 'Cobertura', fase: 1,
    objetivo: 'Estimar por quantos dias o estoque utilizável atende ao consumo.',
    formula: 'quantidade utilizável ÷ consumo médio diário',
    numerador: 'quantidade utilizável (simulação FEFO)', denominador: 'consumo médio diário (janela de N dias)',
    fonte: 'v_disponivel + v_consumo_diario', granularidade: 'item', unidade: 'dias',
    polaridade: 'maior_melhor', meta: null, limiteAlerta: null, minimoAmostra: 3, filtros: SEM_FORN,
    metodologia: 'Valor projetado. Para cada lote, conta só o que pode ser consumido antes do vencimento: mín(saldo do lote, consumo médio diário × dias até vencer). Exige 60 dias de histórico e ao menos 3 saídas. A meta é o lead time do item mais a margem de segurança.',
  },
  {
    id: 'K08', nome: 'Itens com cobertura insuficiente', fase: 2,
    objetivo: 'Listar itens cuja cobertura não chega ao lead time.',
    formula: 'contagem de itens com cobertura < lead time',
    numerador: 'itens com K07 < LT', denominador: null,
    fonte: 'K07 + lead time', granularidade: 'item', unidade: 'itens',
    polaridade: 'menor_melhor', meta: 0, limiteAlerta: 1, minimoAmostra: 1, filtros: SEM_FORN,
    metodologia: 'Meta de zero itens vitais com cobertura abaixo do lead time.',
  },
  {
    id: 'K09', nome: 'Itens abaixo do ponto de reposição', fase: 1,
    objetivo: 'Indicar o que precisa ser comprado.',
    formula: 'itens com posição projetada ≤ ponto de reposição',
    numerador: 'itens ativos com posição projetada ≤ PR', denominador: null,
    fonte: 'v_posicao_item + parâmetros de reposição', granularidade: 'item', unidade: 'itens',
    polaridade: 'menor_melhor', meta: 0, limiteAlerta: 1, minimoAmostra: 1, filtros: SEM_FORN,
    metodologia: 'Posição projetada = disponível + pedidos abertos. PR = consumo médio × lead time + estoque de segurança. Usa o PR manual quando houver. Meta: zero itens vitais.',
  },
  {
    id: 'K10', nome: 'Giro de estoque', fase: 2,
    objetivo: 'Medir quantas vezes o estoque é renovado por ano.',
    formula: 'valor consumido anualizado ÷ valor médio do estoque; tempo médio = 365 ÷ giro',
    numerador: 'valor consumido no período × 365 ÷ dias', denominador: 'média do valor do estoque nos snapshots',
    fonte: 'movimentacoes + snapshot_saldos', granularidade: 'periodo', unidade: 'giro',
    polaridade: 'informativo', meta: null, limiteAlerta: null, minimoAmostra: 30, filtros: SEM_FORN,
    metodologia: 'Analisado por categoria.',
  },
  {
    id: 'K11', nome: 'Itens sem movimentação', fase: 2,
    objetivo: 'Identificar capital imobilizado.',
    formula: 'itens com saldo > 0 e sem dispensação há ≥ 180 dias, com valor imobilizado',
    numerador: 'itens parados', denominador: null,
    fonte: 'v_saldo + movimentacoes', granularidade: 'item', unidade: 'itens',
    polaridade: 'tendencia_queda', meta: null, limiteAlerta: null, minimoAmostra: 1, filtros: SEM_FORN,
    metodologia: 'O limite de dias é configurável.',
  },
  {
    id: 'K12', nome: 'Valor do estoque', fase: 1,
    objetivo: 'Informar o valor imobilizado a custo de aquisição.',
    formula: 'Σ saldo físico × custo médio',
    numerador: 'Σ saldo × custo médio', denominador: null,
    fonte: 'v_saldo + custo médio do item', granularidade: 'posicao', unidade: 'R$',
    polaridade: 'informativo', meta: null, limiteAlerta: null, minimoAmostra: 0, filtros: SEM_FORN,
    metodologia: 'Custo médio ponderado móvel do item no laboratório. Itens sem custo ficam fora, salvo configuração em contrário.',
  },
  // 7.3 Perdas e validade
  {
    id: 'K13', nome: 'Índice de perdas', fase: 1,
    objetivo: 'De cada R$ 100 que saíram do estoque, quanto foi perdido.',
    formula: 'valor perdido ÷ (valor consumido + valor perdido) × 100',
    numerador: 'Σ PERDA × custo', denominador: 'Σ DISPENSACAO × custo − devoluções reintegradas + Σ PERDA × custo',
    fonte: 'movimentacoes', granularidade: 'periodo', unidade: '%',
    polaridade: 'menor_melhor', meta: 2, limiteAlerta: 4, minimoAmostra: 1, filtros: TODOS,
    metodologia: 'Perdas são valoradas pelo custo do lote quando disponível; senão, pelo custo médio (selo "Estimado").',
  },
  {
    id: 'K14', nome: 'Valor vencido', fase: 1,
    objetivo: 'Medir o desperdício por vencimento.',
    formula: 'Σ valor das perdas com motivo "vencimento"',
    numerador: 'Σ PERDA(vencimento) × custo', denominador: null,
    fonte: 'movimentacoes', granularidade: 'periodo', unidade: 'R$',
    polaridade: 'tendencia_queda', meta: null, limiteAlerta: null, minimoAmostra: 0, filtros: TODOS,
    metodologia: 'Soma das perdas registradas com motivo vencimento no período.',
  },
  {
    id: 'K15', nome: 'Valor em risco de vencimento', fase: 1,
    objetivo: 'Antecipar o que vai vencer antes de ser usado.',
    formula: 'valor da quantidade que não será consumida antes do vencimento (30/60/90 dias)',
    numerador: 'Σ (saldo do lote − consumo projetado até vencer) × custo', denominador: null,
    fonte: 'v_disponivel + v_consumo_diario', granularidade: 'item', unidade: 'R$',
    polaridade: 'tendencia_queda', meta: null, limiteAlerta: null, minimoAmostra: 0, filtros: TODOS,
    metodologia: 'Valor projetado por simulação FEFO: os lotes são consumidos em ordem de vencimento ao ritmo do consumo médio diário. O que sobra em cada lote na data de vencimento, dentro do horizonte, é valor em risco.',
  },
  // 7.4 Confiabilidade
  {
    id: 'K16', nome: 'Acuracidade do inventário', fase: 1,
    objetivo: 'Medir se o saldo registrado bate com o físico.',
    formula: 'posições contadas dentro da tolerância ÷ posições contadas × 100',
    numerador: 'contagens com dentro_tolerancia', denominador: 'contagens (item × lote × local) no período',
    fonte: 'inventario_contagens', granularidade: 'posicao', unidade: '%',
    polaridade: 'maior_melhor', meta: 95, limiteAlerta: 90, minimoAmostra: 1, filtros: SEM_FORN,
    metodologia: 'A tolerância padrão é 0 para unidades contáveis e ±2% para volume e massa. Sem contagem no período, o resultado é "Dados insuficientes".',
  },
  {
    id: 'K17', nome: 'Acuracidade financeira', fase: 2,
    objetivo: 'Medir o peso financeiro das divergências.',
    formula: '1 − (Σ |divergência em valor| ÷ valor registrado das posições contadas)',
    numerador: 'Σ |divergência| × custo', denominador: 'Σ saldo_sistema × custo',
    fonte: 'inventario_contagens', granularidade: 'posicao', unidade: '%',
    polaridade: 'maior_melhor', meta: 98, limiteAlerta: 95, minimoAmostra: 1, filtros: SEM_FORN,
    metodologia: 'Calculada sobre as mesmas posições do K16.',
  },
  {
    id: 'K18', nome: 'Índice de rastreabilidade', fase: 2,
    objetivo: 'Medir a completude dos registros.',
    formula: 'movimentações com lote, local, projeto, finalidade e responsável ÷ total × 100',
    numerador: 'movimentações completas', denominador: 'movimentações no período',
    fonte: 'movimentacoes', granularidade: 'periodo', unidade: '%',
    polaridade: 'maior_melhor', meta: 98, limiteAlerta: 95, minimoAmostra: 10, filtros: SEM_FORN,
    metodologia: 'Projeto e finalidade são exigidos apenas para dispensação.',
  },
  {
    id: 'K19', nome: 'Registros retroativos', fase: 2,
    objetivo: 'Medir lançamentos feitos tarde.',
    formula: 'movimentações registradas > 24 h após o fato ÷ total × 100',
    numerador: 'registrado_em − ocorrido_em > 24 h', denominador: 'movimentações no período',
    fonte: 'movimentacoes', granularidade: 'periodo', unidade: '%',
    polaridade: 'menor_melhor', meta: 5, limiteAlerta: 10, minimoAmostra: 10, filtros: SEM_FORN,
    metodologia: 'Compara a data do fato com a data de registro.',
  },
  // 7.5 Abastecimento
  {
    id: 'K20', nome: 'Lead time do fornecedor', fase: 2,
    objetivo: 'Conhecer o prazo real de entrega.',
    formula: 'recebimento − envio do pedido (mediana, P90, desvio-padrão)',
    numerador: 'dias por pedido', denominador: null,
    fonte: 'pedidos_compra', granularidade: 'pedido', unidade: 'dias',
    polaridade: 'menor_melhor', meta: null, limiteAlerta: null, minimoAmostra: 3, filtros: ['fornecedor', 'categoria'],
    metodologia: 'Exige ao menos 3 pedidos recebidos.',
  },
  {
    id: 'K21', nome: 'Ciclo total de abastecimento', fase: 2,
    objetivo: 'Encontrar o gargalo entre solicitação e liberação.',
    formula: 'liberação do lote − solicitação de compra, por etapa',
    numerador: 'dias por etapa', denominador: null,
    fonte: 'pedidos_compra', granularidade: 'pedido', unidade: 'dias',
    polaridade: 'menor_melhor', meta: null, limiteAlerta: null, minimoAmostra: 3, filtros: ['fornecedor', 'categoria'],
    metodologia: 'Etapas: aprovação, processamento da compra, entrega, conferência e liberação. A mais longa é o gargalo.',
  },
  {
    id: 'K22', nome: 'Entregas no prazo e completas', fase: 2,
    objetivo: 'Avaliar a confiabilidade dos fornecedores.',
    formula: 'pedidos recebidos completos até a data prevista ÷ pedidos recebidos × 100',
    numerador: 'pedidos no prazo e completos', denominador: 'pedidos recebidos',
    fonte: 'pedidos_compra', granularidade: 'pedido', unidade: '%',
    polaridade: 'maior_melhor', meta: 90, limiteAlerta: 80, minimoAmostra: 3, filtros: ['fornecedor', 'categoria'],
    metodologia: 'Um pedido é completo quando todas as linhas foram recebidas na quantidade pedida.',
  },
  // 7.6 Armazenamento
  {
    id: 'K23', nome: 'Ocupação', fase: 3,
    objetivo: 'Evitar falta de espaço adequado.',
    formula: 'capacidade ocupada ÷ capacidade total × 100',
    numerador: 'capacidade ocupada', denominador: 'capacidade total',
    fonte: 'locais + v_saldo', granularidade: 'posicao', unidade: '%',
    polaridade: 'menor_melhor', meta: 80, limiteAlerta: 90, minimoAmostra: 1, filtros: ['local', 'categoria'],
    metodologia: 'Prefere unidades contáveis (posições, caixas). Ocupação informada manualmente recebe o selo "Estimado".',
  },
  {
    id: 'K24', nome: 'Conformidade de armazenamento', fase: 3,
    objetivo: 'Medir as verificações sem não conformidade.',
    formula: 'verificações conformes ÷ verificações realizadas × 100',
    numerador: 'verificações conformes', denominador: 'verificações realizadas',
    fonte: 'verificacoes', granularidade: 'periodo', unidade: '%',
    polaridade: 'maior_melhor', meta: 95, limiteAlerta: 90, minimoAmostra: 1, filtros: ['local'],
    metodologia: 'Sempre lida junto com o K25.',
  },
  {
    id: 'K25', nome: 'Aderência ao plano de verificação', fase: 3,
    objetivo: 'Garantir que as verificações aconteçam.',
    formula: 'verificações realizadas ÷ programadas × 100',
    numerador: 'verificações realizadas', denominador: 'verificações programadas',
    fonte: 'plano_verificacoes', granularidade: 'periodo', unidade: '%',
    polaridade: 'maior_melhor', meta: 95, limiteAlerta: 85, minimoAmostra: 1, filtros: ['local'],
    metodologia: 'Evita conformidade alta por falta de verificação.',
  },
  // 7.7 Devoluções
  {
    id: 'K26', nome: 'Taxa de devolução', fase: 3,
    objetivo: 'Acompanhar o retorno de material dispensado.',
    formula: 'quantidade devolvida ÷ quantidade dispensada × 100, por condição',
    numerador: 'Σ DEVOLUCAO', denominador: 'Σ DISPENSACAO',
    fonte: 'movimentacoes + devolucoes', granularidade: 'periodo', unidade: '%',
    polaridade: 'informativo', meta: null, limiteAlerta: null, minimoAmostra: 5, filtros: SEM_FORN,
    metodologia: 'Mostra também o percentual reintegrado e o descartado.',
  },
];

export const KPI_POR_ID: Record<string, KpiDef> = Object.fromEntries(KPIS.map((k) => [k.id, k]));

/** Versão da metodologia impressa nos relatórios. Mude sempre que uma fórmula mudar. */
export const VERSAO_METODOLOGIA = '1.0.0';
