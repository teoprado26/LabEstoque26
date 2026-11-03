// Relatórios: PDF técnico do período (com escolha das seções) e CSVs para conferência no Excel.
import { FileSpreadsheet, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { Aviso, Botao, Campo, Card, Interruptor, Opcoes, Tela, T } from '@/components/ui';
import {
  SECOES_PDF, csvEquipamentos, csvEstoque, csvIndicadores, csvLotes, csvMovimentacoes, exportarCsv, exportarPdf, htmlRelatorio, type SecaoPdf,
} from '@/data/relatorios';
import { carregarIndicadores, type Indicadores } from '@/data/servicoAnalises';
import { ultimosDias } from '@/data/servicoKpis';
import { lerData } from '@/domain/entrada';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

type Periodo = '7' | '30' | '90' | '180' | '365' | 'personalizado';

export default function Relatorios() {
  const { lab } = useSessao();
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [secoes, setSecoes] = useState<SecaoPdf[]>(SECOES_PDF.map((s) => s.valor));
  const [obs, setObs] = useState('');
  const [gerando, setGerando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cache, setCache] = useState<{ chave: string; d: Indicadores } | null>(null);

  const deIso = lerData(de);
  const ateIso = lerData(ate);
  const intervalo = periodo === 'personalizado' ? (deIso && ateIso && deIso <= ateIso ? { de: deIso, ate: ateIso } : null) : ultimosDias(Number(periodo));
  const sufixo = intervalo ? `${intervalo.de}_a_${intervalo.ate}` : '';

  // Um só cálculo por período, usado pelo PDF e por todos os CSVs.
  const indicadores = async () => {
    if (!lab || !intervalo) throw new Error('Escolha um período válido.');
    const chave = `${intervalo.de}|${intervalo.ate}`;
    if (cache?.chave === chave) return cache.d;
    const d = await carregarIndicadores(lab.id, intervalo);
    setCache({ chave, d });
    return d;
  };

  const executar = async (rotulo: string, fn: () => Promise<void>) => {
    setGerando(rotulo);
    setErro(null);
    setOk(null);
    try {
      await fn();
      setOk(`${rotulo}: pronto.`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(null);
    }
  };

  return (
    <Tela titulo="Relatórios" voltar>
      <T v="caption">Os números são os mesmos do painel e das análises: vêm do mesmo serviço, com o mesmo período.</T>
      <Opcoes rotulo="Período" valor={periodo} onChange={(p) => { setPeriodo(p); setCache(null); }} opcoes={[
        { valor: '7', rotulo: 'Semana' }, { valor: '30', rotulo: 'Mês' }, { valor: '90', rotulo: 'Trimestre' }, { valor: '180', rotulo: 'Semestre' },
        { valor: '365', rotulo: 'Ano' }, { valor: 'personalizado', rotulo: 'Personalizado' },
      ]} />
      {periodo === 'personalizado' ? (
        <>
          <Campo rotulo="De" placeholder="dd/mm/aaaa" value={de} onChangeText={(t) => { setDe(t); setCache(null); }} keyboardType="numbers-and-punctuation" />
          <Campo rotulo="Até" placeholder="dd/mm/aaaa" value={ate} onChangeText={(t) => { setAte(t); setCache(null); }} keyboardType="numbers-and-punctuation"
            erro={de && ate && !intervalo ? 'Use dd/mm/aaaa, com a data inicial antes da final.' : null} />
        </>
      ) : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}

      <Card className="gap-3">
        <T v="subtitle">Relatório técnico em PDF</T>
        <T v="caption">Cabeçalho com laboratório e período, tabelas de KPIs com meta, status por extenso (legível em preto e branco), plano de ação, versão da metodologia e identificador único. No navegador, escolha “Salvar como PDF” na janela de impressão.</T>
        {SECOES_PDF.map((s) => (
          <Interruptor key={s.valor} rotulo={s.rotulo} valor={secoes.includes(s.valor)}
            onChange={(v) => setSecoes((xs) => (v ? [...xs, s.valor] : xs.filter((x) => x !== s.valor)))} />
        ))}
        <Campo rotulo="Observações do gestor (entram no plano de ação)" value={obs} onChangeText={setObs} multiline />
        <Botao titulo="Gerar PDF" icone={FileText} carregando={gerando === 'PDF'} desabilitado={!intervalo || !secoes.length || !!gerando}
          onPress={() => executar('PDF', async () => exportarPdf(htmlRelatorio(await indicadores(), lab?.nome ?? '', secoes, obs.trim())))} />
      </Card>

      <Card className="gap-3">
        <T v="subtitle">Planilhas CSV (Excel)</T>
        <T v="caption">Separador “;” e vírgula decimal. Os indicadores vêm com numerador, denominador e amostra, para conferência independente.</T>
        <Botao tipo="secundario" titulo="Indicadores (KPIs)" icone={FileSpreadsheet} carregando={gerando === 'Indicadores'} desabilitado={!intervalo || !!gerando}
          onPress={() => executar('Indicadores', async () => exportarCsv(`indicadores_${sufixo}.csv`, csvIndicadores(await indicadores())))} />
        <Botao tipo="secundario" titulo="Estoque e reposição" icone={FileSpreadsheet} carregando={gerando === 'Estoque'} desabilitado={!intervalo || !!gerando}
          onPress={() => executar('Estoque', async () => exportarCsv(`estoque_${sufixo}.csv`, csvEstoque(await indicadores())))} />
        <Botao tipo="secundario" titulo="Lotes e validades" icone={FileSpreadsheet} carregando={gerando === 'Lotes'} desabilitado={!intervalo || !!gerando}
          onPress={() => executar('Lotes', async () => exportarCsv(`lotes_${sufixo}.csv`, csvLotes(await indicadores())))} />
        <Botao tipo="secundario" titulo="Movimentações do período" icone={FileSpreadsheet} carregando={gerando === 'Movimentações'} desabilitado={!intervalo || !!gerando}
          onPress={() => executar('Movimentações', async () => exportarCsv(`movimentacoes_${sufixo}.csv`, await csvMovimentacoes(lab!.id, intervalo!)))} />
        <Botao tipo="secundario" titulo="Equipamentos" icone={FileSpreadsheet} carregando={gerando === 'Equipamentos'} desabilitado={!!gerando}
          onPress={() => executar('Equipamentos', async () => exportarCsv(`equipamentos_${hoje()}.csv`, await csvEquipamentos(lab!.id)))} />
      </Card>
    </Tela>
  );
}

const hoje = () => new Date().toISOString().slice(0, 10);
