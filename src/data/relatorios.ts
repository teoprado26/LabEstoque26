// Relatórios: CSV (Excel pt-BR) e PDF técnico. Todo número vem do serviço único de indicadores e das mesmas views das telas.
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { KPIS, VERSAO_METODOLOGIA } from '@/kpis/catalog';
import { statusDoKpi } from '@/kpis/resultado';
import { formatarValor } from '@/components/KpiCard';
import { diasEntre, hoje, somarDias } from '@/domain/datas';
import { validadeEfetiva } from '@/domain/disponibilidade';
import { fmtData, fmtDataHora, fmtMoeda } from '@/domain/formato';
import { paraCsv } from '@/domain/csv';
import type { Indicadores } from './servicoAnalises';
import type { Periodo } from './servicoKpis';

// ---------------------------------------------------------------- CSV
const num = (v: number | null | undefined, casas = 2) => (v == null || Number.isNaN(v) ? '' : v.toFixed(casas).replace('.', ','));
const ROTULO_STATUS = { ok: 'Na meta', alerta: 'Atenção', critico: 'Fora da meta', neutro: '' } as const;

export function csvIndicadores(d: Indicadores): string {
  return paraCsv(
    ['KPI', 'Indicador', 'Valor', 'Unidade', 'Numerador', 'Denominador', 'n', 'Qualidade do dado', 'Status', 'Meta', 'Período anterior', 'Fórmula', 'Início', 'Fim', 'Versão da metodologia'],
    KPIS.filter((k) => d.atual[k.id]).map((k) => {
      const r = d.atual[k.id];
      return [k.id, k.nome, num(r.valor), k.unidade, num(r.numerador), num(r.denominador), r.n, r.selo, ROTULO_STATUS[statusDoKpi(k, r.valor)],
        num(k.meta), num(d.anterior[k.id]?.valor), k.formula, fmtData(d.periodo.de), fmtData(d.periodo.ate), VERSAO_METODOLOGIA];
    }),
  );
}

export function csvEstoque(d: Indicadores): string {
  return paraCsv(
    ['Código', 'Item', 'Criticidade', 'Unidade', 'Disponível', 'Físico', 'Em pedido', 'Posição projetada', 'Custo médio', 'Valor em estoque', 'Consumo médio/dia', 'Ponto de reposição', 'Estoque de segurança', 'Abaixo do PR', 'Sugestão de compra', 'Cobertura (dias)', 'Próxima validade'],
    d.estoque.map((i) => [i.codigo, i.nome, i.criticidade, i.unidade, num(i.disponivel, 3), num(i.fisico, 3), num(i.emPedido, 3), num(i.posicaoProjetada, 3),
      num(i.custoMedio, 4), num(i.custoMedio == null ? null : i.fisico * i.custoMedio), num(i.reposicao.consumoMedio, 3), num(i.reposicao.prEmUso, 3),
      num(i.reposicao.esEmUso, 3), i.reposicao.abaixoDoPR ? 'SIM' : 'NÃO', num(i.reposicao.quantidadeSugerida, 3), num(i.cobertura.valor, 1), fmtData(i.proximaValidade)]),
  );
}

export function csvLotes(d: Indicadores): string {
  const linhas = d.estoque.flatMap((i) => i.posicoes.filter((p) => p.saldoFisico > 0).map((p) => {
    const v = validadeEfetiva(p);
    return [i.codigo, i.nome, p.numero, p.status, fmtData(p.validade), fmtData(v), v ? diasEntre(hoje(), v) : '', num(p.saldoFisico, 3), i.unidade, num(p.reservado, 3), num(p.custoUnitario, 4), p.localConforme ? 'SIM' : 'NÃO'];
  }));
  return paraCsv(['Código', 'Item', 'Lote', 'Status', 'Validade', 'Validade efetiva', 'Dias até vencer', 'Saldo', 'Unidade', 'Reservado', 'Custo unitário', 'Local conforme'], linhas);
}

export async function csvMovimentacoes(labId: string, p: Periodo): Promise<string> {
  const { data, error } = await supabase.from('v_movimentacoes').select('*').eq('lab_id', labId)
    .gte('ocorrido_em', `${p.de}T00:00:00-03:00`).lt('ocorrido_em', `${somarDias(p.ate, 1)}T00:00:00-03:00`).order('ocorrido_em').limit(50000);
  if (error) throw new Error(error.message);
  return paraCsv(
    ['Data e hora', 'Tipo', 'Sentido', 'Código', 'Item', 'Lote', 'Quantidade', 'Unidade', 'Custo unitário', 'Valor', 'Origem', 'Destino', 'Projeto', 'Finalidade', 'Motivo', 'Responsável', 'Registrado em', 'Estorno de'],
    (data ?? []).map((m) => [fmtDataHora(m.ocorrido_em), m.tipo, m.sentido, m.item_codigo, m.item_nome, m.lote_numero, num(Number(m.quantidade), 3), m.unidade_estoque,
      num(m.custo_unitario == null ? null : Number(m.custo_unitario), 4), num(m.custo_unitario == null ? null : Number(m.quantidade) * Number(m.custo_unitario)),
      m.local_origem, m.local_destino, m.projeto_codigo, m.finalidade, [m.motivo, m.descricao_motivo].filter(Boolean).join(': '), m.usuario_nome, fmtDataHora(m.registrado_em), m.estorno_de]),
  );
}

export async function csvEquipamentos(labId: string): Promise<string> {
  const { data, error } = await supabase.from('v_equipamentos_situacao').select('*').eq('lab_id', labId).eq('ativo', true).order('nome');
  if (error) throw new Error(error.message);
  return paraCsv(
    ['Patrimônio', 'Equipamento', 'Tipo', 'Criticidade', 'Situação', 'Última calibração', 'Resultado', 'Calibração válida até', 'Calibração agendada', 'Última preventiva', 'Preventiva prevista', 'Manutenção agendada'],
    (data ?? []).map((e) => [e.codigo, e.nome, e.tipo, e.criticidade, String(e.situacao).replace(/_/g, ' '), fmtData(e.ultima_calibracao), e.resultado_ultima_calibracao ?? '',
      fmtData(e.calibracao_valida_ate), fmtData(e.calibracao_agendada), fmtData(e.ultima_manutencao_preventiva), fmtData(e.manutencao_prevista), fmtData(e.manutencao_agendada)]),
  );
}

// ---------------------------------------------------------------- PDF
export type SecaoPdf = 'resumo' | 'atendimento' | 'estoque' | 'perdas' | 'confiabilidade' | 'abastecimento' | 'plano';
export const SECOES_PDF: { valor: SecaoPdf; rotulo: string; kpis: string[] }[] = [
  { valor: 'resumo', rotulo: 'Resumo executivo', kpis: ['K01', 'K02', 'K09', 'K13', 'K15', 'K16', 'K22', 'K20'] },
  { valor: 'atendimento', rotulo: 'Atendimento e disponibilidade', kpis: ['K01', 'K02', 'K03', 'K04', 'K05', 'K06'] },
  { valor: 'estoque', rotulo: 'Estoque, reposição e análise financeira', kpis: ['K07', 'K08', 'K09', 'K10', 'K11', 'K12'] },
  { valor: 'perdas', rotulo: 'Perdas e validade', kpis: ['K13', 'K14', 'K15'] },
  { valor: 'confiabilidade', rotulo: 'Confiabilidade dos registros', kpis: ['K16', 'K17', 'K18', 'K19'] },
  { valor: 'abastecimento', rotulo: 'Abastecimento', kpis: ['K20', 'K21', 'K22'] },
  { valor: 'plano', rotulo: 'Plano de ação: itens críticos e sugestões de compra', kpis: [] },
];

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function htmlRelatorio(d: Indicadores, lab: string, secoes: SecaoPdf[], observacoes: string): string {
  const id = `LE-${d.periodo.ate.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const linhaKpi = (kid: string) => {
    const k = KPIS.find((x) => x.id === kid)!;
    const r = d.atual[kid];
    if (!r) return '';
    const st = statusDoKpi(k, r.valor);
    const ant = d.anterior[kid]?.valor;
    return `<tr><td>${k.id}</td><td>${esc(k.nome)}</td><td class="n">${r.valor == null ? 'Dados insuficientes' : esc(formatarValor(kid, r.valor))}</td>
      <td>${k.meta == null ? '—' : esc(formatarValor(kid, k.meta))}</td><td>${esc(ROTULO_STATUS[st] || '—')}</td><td>${esc(r.selo)}</td><td class="n">${r.n}</td>
      <td class="n">${ant == null ? '—' : esc(formatarValor(kid, ant))}</td></tr>`;
  };
  const tabela = (kpis: string[]) => `<table><thead><tr><th>KPI</th><th>Indicador</th><th>Valor</th><th>Meta</th><th>Status</th><th>Dado</th><th>n</th><th>Anterior</th></tr></thead>
    <tbody>${kpis.map(linhaKpi).join('')}</tbody></table>`;
  const criticos = d.estoque.filter((i) => i.ativo && (i.reposicao.abaixoDoPR || i.disponivel <= 0));
  const vencendo = d.estoque.flatMap((i) => i.posicoes.filter((p) => p.saldoFisico > 0).map((p) => ({ i, p, v: validadeEfetiva(p) })))
    .filter((x) => x.v && diasEntre(hoje(), x.v) <= 30).sort((a, b) => (a.v! < b.v! ? -1 : 1));

  const corpo = SECOES_PDF.filter((s) => secoes.includes(s.valor)).map((s) => {
    if (s.valor !== 'plano') return `<h2>${esc(s.rotulo)}</h2>${tabela(s.kpis)}`;
    return `<h2>${esc(s.rotulo)}</h2>
      <h3>Itens no ponto de reposição ou sem disponível (${criticos.length})</h3>
      <table><thead><tr><th>Código</th><th>Item</th><th>Crit.</th><th>Posição</th><th>PR</th><th>Sugestão</th></tr></thead><tbody>
      ${criticos.map((i) => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.nome)}</td><td>${i.criticidade}</td><td class="n">${esc(`${i.posicaoProjetada} ${i.unidade}`)}</td>
        <td class="n">${i.reposicao.prEmUso == null ? '—' : esc(i.reposicao.prEmUso)}</td><td class="n">${i.reposicao.quantidadeSugerida == null ? '—' : esc(`${i.reposicao.quantidadeSugerida} ${i.unidade}`)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum.</td></tr>'}
      </tbody></table>
      <h3>Lotes vencidos ou vencendo em 30 dias (${vencendo.length})</h3>
      <table><thead><tr><th>Item</th><th>Lote</th><th>Validade</th><th>Saldo</th></tr></thead><tbody>
      ${vencendo.map((x) => `<tr><td>${esc(x.i.nome)}</td><td>${esc(x.p.numero)}</td><td>${esc(fmtData(x.v))}</td><td class="n">${esc(`${x.p.saldoFisico} ${x.i.unidade}`)}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum.</td></tr>'}
      </tbody></table>
      <h3>Observações do gestor</h3><p class="obs">${esc(observacoes) || '—'}</p>
      <div class="assin"><div>Responsável técnico</div><div>Aprovação</div></div>`;
  }).join('');

  // Preto e branco legível: sem cor para status (sempre por extenso), linhas finas, Inter com fallback.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(id)}</title><style>
    @page { margin: 18mm 14mm 20mm; }
    body { font-family: Inter, Arial, sans-serif; color: #1e1e1e; font-size: 10.5pt; }
    header { border-bottom: 1px solid #757575; padding-bottom: 8px; margin-bottom: 12px; }
    h1 { font-size: 16pt; margin: 0 0 4px; } h2 { font-size: 12.5pt; margin: 18px 0 6px; page-break-after: avoid; } h3 { font-size: 11pt; margin: 12px 0 4px; }
    .meta { color: #444; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; page-break-inside: auto; }
    th, td { border-bottom: 1px solid #d9d9d9; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { font-size: 8.5pt; text-transform: uppercase; color: #444; border-bottom: 1px solid #757575; }
    td.n { text-align: right; font-variant-numeric: tabular-nums; } tr { page-break-inside: avoid; }
    .obs { min-height: 40px; border: 1px solid #d9d9d9; padding: 6px; }
    .assin { display: flex; gap: 32px; margin-top: 40px; } .assin div { flex: 1; border-top: 1px solid #1e1e1e; padding-top: 4px; font-size: 9pt; }
    footer { position: fixed; bottom: -12mm; left: 0; right: 0; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  </style></head><body>
    <header><h1>Indicadores de desempenho e qualidade do estoque</h1>
    <div class="meta">${esc(lab)} · período ${esc(fmtData(d.periodo.de))} a ${esc(fmtData(d.periodo.ate))} (comparado ao período anterior de mesma duração)</div>
    <div class="meta">Gerado em ${esc(fmtDataHora(new Date().toISOString()))} · valor do estoque ${esc(d.atual.K12?.valor == null ? '—' : fmtMoeda(d.atual.K12.valor))} · filtros: todos os itens do laboratório</div></header>
    ${corpo}
    <footer><span>LabEstoque · metodologia ${VERSAO_METODOLOGIA} · relatório ${esc(id)}</span><span>Valores a custo de aquisição. "Dados insuficientes" = amostra abaixo do mínimo.</span></footer>
  </body></html>`;
}

// ---------------------------------------------------------------- Saída (web e celular)
export async function exportarCsv(nome: string, conteudo: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const arquivo = new File(Paths.cache, nome);
  if (arquivo.exists) arquivo.delete();
  arquivo.create();
  await arquivo.write(conteudo);
  await Sharing.shareAsync(arquivo.uri, { mimeType: 'text/csv', dialogTitle: nome, UTI: 'public.comma-separated-values-text' });
}

export async function exportarPdf(html: string): Promise<void> {
  if (Platform.OS === 'web') {
    // No navegador abre a janela de impressão; escolha "Salvar como PDF".
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Relatório LabEstoque', UTI: 'com.adobe.pdf' });
}
