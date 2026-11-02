// Definição declarativa dos cadastros: campos, seções, validações e como cada registro aparece na lista.
// A tela genérica de formulário e a lista leem só daqui.

export type TabelaCadastro = 'itens' | 'locais' | 'projetos' | 'fornecedores' | 'categorias';
export type TabelaRef = 'categorias' | 'locais' | 'fornecedores';

interface Base {
  chave: string;
  rotulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
}

export type CampoDef =
  | (Base & { tipo: 'texto'; maiusculas?: boolean; multilinha?: boolean; teclado?: 'email-address' | 'url' })
  | (Base & { tipo: 'numero'; inteiro?: boolean; positivo?: boolean })
  | (Base & { tipo: 'bool' })
  | (Base & { tipo: 'opcao'; opcoes: { valor: string; rotulo: string }[] })
  | (Base & { tipo: 'ref'; tabela: TabelaRef })
  | (Base & { tipo: 'usuario' })
  | (Base & { tipo: 'lista' });

export interface Secao {
  titulo: string;
  campos: CampoDef[];
}

export type Registro = Record<string, unknown>;

export interface CadastroDef {
  tabela: TabelaCadastro;
  titulo: string;
  singular: string;
  descricao: string;
  ordem: string;
  secoes: Secao[];
  /** Regras entre campos; recebe o registro já convertido. Retorna erros por chave. */
  validar?: (r: Registro) => Record<string, string>;
  /** Valores iniciais de um registro novo. */
  padrao?: Registro;
}

export const TIPOS_ITEM = [
  { valor: 'reagente', rotulo: 'Reagente' },
  { valor: 'consumivel', rotulo: 'Consumível' },
  { valor: 'vidraria', rotulo: 'Vidraria' },
  { valor: 'epi', rotulo: 'EPI' },
  { valor: 'meio_cultura', rotulo: 'Meio de cultura' },
  { valor: 'kit', rotulo: 'Kit' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const NIVEIS_LOCAL = [
  { valor: 'laboratorio', rotulo: 'Laboratório' },
  { valor: 'sala', rotulo: 'Sala' },
  { valor: 'equipamento', rotulo: 'Equipamento' },
  { valor: 'prateleira', rotulo: 'Prateleira / rack' },
  { valor: 'caixa', rotulo: 'Caixa' },
  { valor: 'posicao', rotulo: 'Posição' },
];

const faixaTemperatura = (r: Registro, erros: Record<string, string>) => {
  const min = r.temp_min as number | null;
  const max = r.temp_max as number | null;
  if ((min == null) !== (max == null)) erros[min == null ? 'temp_min' : 'temp_max'] = 'Informe a faixa completa (mínima e máxima).';
  else if (min != null && max != null && min > max) erros.temp_max = 'A máxima deve ser maior ou igual à mínima.';
};

const ativo: CampoDef = { chave: 'ativo', rotulo: 'Ativo', tipo: 'bool', ajuda: 'Registros com movimentação nunca são apagados; desative para tirá-los de uso.' };

export const CADASTROS: Record<TabelaCadastro, CadastroDef> = {
  itens: {
    tabela: 'itens',
    titulo: 'Itens',
    singular: 'item',
    descricao: 'Reagentes, consumíveis, vidraria, EPI, meios e kits.',
    ordem: 'nome',
    padrao: { fator_conversao: 1, multiplo_embalagem: 1, unidade_contavel: true, criticidade: 'E', ativo: true, controlado: false, protegido_luz: false, umidade_controlada: false },
    secoes: [
      {
        titulo: 'Identificação',
        campos: [
          { chave: 'codigo', rotulo: 'Código (SKU)', tipo: 'texto', obrigatorio: true, maiusculas: true },
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'tipo', rotulo: 'Tipo', tipo: 'opcao', obrigatorio: true, opcoes: TIPOS_ITEM },
          { chave: 'categoria_id', rotulo: 'Categoria', tipo: 'ref', tabela: 'categorias' },
          {
            chave: 'criticidade', rotulo: 'Criticidade', tipo: 'opcao', obrigatorio: true,
            opcoes: [{ valor: 'V', rotulo: 'Vital' }, { valor: 'E', rotulo: 'Essencial' }, { valor: 'D', rotulo: 'Desejável' }],
            ajuda: 'Define o nível de serviço da reposição (V 98%, E 95%, D 90%).',
          },
        ],
      },
      {
        titulo: 'Unidades',
        campos: [
          { chave: 'unidade_compra', rotulo: 'Unidade de compra', tipo: 'texto', obrigatorio: true, ajuda: 'Ex.: frasco 500 mL, caixa com 10 pacotes.' },
          { chave: 'unidade_estoque', rotulo: 'Unidade de estoque', tipo: 'texto', obrigatorio: true, ajuda: 'Unidade do saldo e do consumo: mL, g, un.' },
          { chave: 'fator_conversao', rotulo: 'Fator de conversão', tipo: 'numero', obrigatorio: true, positivo: true, ajuda: 'Quantas unidades de estoque há em 1 unidade de compra.' },
          { chave: 'unidade_contavel', rotulo: 'Unidade contável', tipo: 'bool', ajuda: 'Ligado: tolerância zero no inventário. Desligado (volume/massa): tolerância percentual.' },
          { chave: 'multiplo_embalagem', rotulo: 'Múltiplo de embalagem', tipo: 'numero', positivo: true, ajuda: 'Em unidades de estoque. A sugestão de compra é arredondada para cima neste múltiplo.' },
        ],
      },
      {
        titulo: 'Armazenamento',
        campos: [
          { chave: 'temp_min', rotulo: 'Temperatura mínima (°C)', tipo: 'numero' },
          { chave: 'temp_max', rotulo: 'Temperatura máxima (°C)', tipo: 'numero' },
          { chave: 'protegido_luz', rotulo: 'Proteger da luz', tipo: 'bool' },
          { chave: 'umidade_controlada', rotulo: 'Umidade controlada', tipo: 'bool' },
          { chave: 'classe_compatibilidade', rotulo: 'Classe de compatibilidade', tipo: 'texto', ajuda: 'Ex.: inflamavel, oxidante, biologico. O local precisa aceitar esta classe.' },
        ],
      },
      {
        titulo: 'Validade e segurança',
        campos: [
          { chave: 'validade_pos_abertura_dias', rotulo: 'Validade após abertura (dias)', tipo: 'numero', inteiro: true, positivo: true },
          { chave: 'validade_tipica_dias', rotulo: 'Validade típica de um lote novo (dias)', tipo: 'numero', inteiro: true, positivo: true, ajuda: 'Limita a sugestão de compra ao que pode ser consumido antes de vencer.' },
          { chave: 'fds_url', rotulo: 'Link da FDS/FISPQ', tipo: 'texto', teclado: 'url' },
          { chave: 'controlado', rotulo: 'Produto controlado (PF/Exército)', tipo: 'bool' },
        ],
      },
      {
        titulo: 'Reposição manual',
        campos: [
          { chave: 'lead_time_manual_dias', rotulo: 'Lead time (dias)', tipo: 'numero', positivo: true, ajuda: 'Usado enquanto não houver 3 pedidos de compra registrados.' },
          { chave: 'es_manual', rotulo: 'Estoque de segurança manual', tipo: 'numero', positivo: true, ajuda: 'Vazio = usar o calculado.' },
          { chave: 'pr_manual', rotulo: 'Ponto de reposição manual', tipo: 'numero', positivo: true, ajuda: 'Vazio = usar o calculado.' },
          { chave: 'justificativa_manual', rotulo: 'Justificativa dos valores manuais', tipo: 'texto', multilinha: true },
        ],
      },
      { titulo: 'Situação', campos: [ativo] },
    ],
    validar: (r) => {
      const e: Record<string, string> = {};
      faixaTemperatura(r, e);
      if ((r.es_manual != null || r.pr_manual != null) && !String(r.justificativa_manual ?? '').trim()) {
        e.justificativa_manual = 'Obrigatória quando há estoque de segurança ou ponto de reposição manual.';
      }
      if (r.es_manual != null && r.pr_manual != null && (r.pr_manual as number) < (r.es_manual as number)) {
        e.pr_manual = 'O ponto de reposição não pode ser menor que o estoque de segurança.';
      }
      return e;
    },
  },

  locais: {
    tabela: 'locais',
    titulo: 'Locais de armazenamento',
    singular: 'local',
    descricao: 'Laboratório → sala → equipamento → prateleira → caixa → posição.',
    ordem: 'nome',
    padrao: { conforme: true, ativo: true, nivel: 'equipamento' },
    secoes: [
      {
        titulo: 'Endereçamento',
        campos: [
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, ajuda: 'Ex.: Freezer −80 °C, Rack 2, Caixa B7.' },
          { chave: 'nivel', rotulo: 'Nível', tipo: 'opcao', obrigatorio: true, opcoes: NIVEIS_LOCAL },
          { chave: 'pai_id', rotulo: 'Dentro de', tipo: 'ref', tabela: 'locais', ajuda: 'Só aparecem locais de nível acima.' },
        ],
      },
      {
        titulo: 'Condições',
        campos: [
          { chave: 'temp_min', rotulo: 'Temperatura mínima (°C)', tipo: 'numero' },
          { chave: 'temp_max', rotulo: 'Temperatura máxima (°C)', tipo: 'numero' },
          { chave: 'classes_aceitas', rotulo: 'Classes aceitas', tipo: 'lista', ajuda: 'Separadas por vírgula. Vazio = aceita qualquer classe.' },
          { chave: 'conforme', rotulo: 'Local conforme', tipo: 'bool', ajuda: 'Desligue em excursão de temperatura ou não conformidade: o material aqui deixa de contar como disponível.' },
        ],
      },
      {
        titulo: 'Capacidade',
        campos: [
          { chave: 'capacidade', rotulo: 'Capacidade', tipo: 'numero', positivo: true },
          { chave: 'unidade_capacidade', rotulo: 'Unidade da capacidade', tipo: 'texto', ajuda: 'Prefira unidades contáveis: posições, caixas, compartimentos.' },
          { chave: 'grade_linhas', rotulo: 'Grade: linhas', tipo: 'numero', inteiro: true, positivo: true, ajuda: 'Para caixas de freezer (ex.: 9 × 9).' },
          { chave: 'grade_colunas', rotulo: 'Grade: colunas', tipo: 'numero', inteiro: true, positivo: true },
        ],
      },
      { titulo: 'Situação', campos: [ativo] },
    ],
    validar: (r) => {
      const e: Record<string, string> = {};
      faixaTemperatura(r, e);
      if ((r.grade_linhas == null) !== (r.grade_colunas == null)) e.grade_colunas = 'Informe linhas e colunas da grade.';
      if (r.nivel !== 'laboratorio' && !r.pai_id) e.pai_id = 'Escolha onde este local fica.';
      return e;
    },
  },

  projetos: {
    tabela: 'projetos',
    titulo: 'Projetos e fontes de recurso',
    singular: 'projeto',
    descricao: 'O consumo é apropriado ao projeto informado na dispensação.',
    ordem: 'codigo',
    padrao: { exige_aprovacao: false, ativo: true },
    secoes: [
      {
        titulo: 'Projeto',
        campos: [
          { chave: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true, maiusculas: true },
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'fonte_recurso', rotulo: 'Fonte de recurso', tipo: 'texto', ajuda: 'Ex.: agência de fomento, departamento, convênio.' },
          { chave: 'coordenador_id', rotulo: 'Coordenador', tipo: 'usuario' },
          { chave: 'exige_aprovacao', rotulo: 'Requisições exigem aprovação do coordenador', tipo: 'bool' },
        ],
      },
      { titulo: 'Situação', campos: [ativo] },
    ],
    validar: (r): Record<string, string> => (r.exige_aprovacao && !r.coordenador_id ? { coordenador_id: 'Escolha o coordenador que aprova as requisições.' } : {}),
  },

  fornecedores: {
    tabela: 'fornecedores',
    titulo: 'Fornecedores',
    singular: 'fornecedor',
    descricao: 'Quem entrega os lotes; o lead time padrão vale até haver histórico de pedidos.',
    ordem: 'nome',
    padrao: { ativo: true },
    secoes: [
      {
        titulo: 'Fornecedor',
        campos: [
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' },
          { chave: 'contato', rotulo: 'Contato', tipo: 'texto', ajuda: 'Telefone ou e-mail comercial.' },
          { chave: 'lead_time_padrao_dias', rotulo: 'Lead time padrão (dias)', tipo: 'numero', positivo: true },
        ],
      },
      { titulo: 'Situação', campos: [ativo] },
    ],
    validar: (r): Record<string, string> => {
      const cnpj = String(r.cnpj ?? '').replace(/\D/g, '');
      return cnpj && cnpj.length !== 14 ? { cnpj: 'O CNPJ tem 14 dígitos.' } : {};
    },
  },

  categorias: {
    tabela: 'categorias',
    titulo: 'Categorias',
    singular: 'categoria',
    descricao: 'Agrupam os itens nos filtros, no giro e na curva ABC.',
    ordem: 'nome',
    padrao: { ativo: true },
    secoes: [{ titulo: 'Categoria', campos: [{ chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true }, ativo] }],
  },
};

export const ORDEM_CADASTROS: TabelaCadastro[] = ['itens', 'locais', 'projetos', 'fornecedores', 'categorias'];

export const ehTabelaCadastro = (t: string): t is TabelaCadastro => t in CADASTROS;
