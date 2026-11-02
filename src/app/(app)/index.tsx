import { useFocusEffect, router } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { KpiCard } from '@/components/KpiCard';
import { Aviso, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { carregarPainel, ultimosDias, type Painel } from '@/data/servicoKpis';
import { diasEntre, hoje } from '@/domain/datas';
import { fmtData, fmtDataHora, fmtMoeda, fmtPct, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

const PERIODOS = [
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: '180', rotulo: '180 dias' },
] as const;

export default function PainelTela() {
  const { lab } = useSessao();
  const [dias, setDias] = useState<'30' | '90' | '180'>('30');
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback(async () => {
    if (!lab) return;
    setCarregando(true);
    setErro(null);
    try {
      setPainel(await carregarPainel(lab.id, ultimosDias(Number(dias))));
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [lab, dias]);

  useFocusEffect(useCallback(() => { atualizar(); }, [atualizar]));

  if (!painel && !erro) return <Carregando />;

  const a = painel?.atual ?? {};
  const ant = painel?.anterior ?? {};
  const abaixoPR = painel?.estoque.filter((i) => i.ativo && i.reposicao.abaixoDoPR) ?? [];
  const vencendo = (painel?.estoque ?? [])
    .flatMap((i) => i.posicoes.map((p) => ({ item: i, p })))
    .filter(({ p }) => p.validade && diasEntre(hoje(), p.validade) <= 30 && p.saldoFisico > 0)
    .sort((x, y) => (x.p.validade! < y.p.validade! ? -1 : 1));

  return (
    <Tela
      titulo="Indicadores"
      acao={
        <Pressable onPress={atualizar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Atualizar">
          <RefreshCw size={22} color="rgb(138 149 143)" />
        </Pressable>
      }
    >
      <View className="gap-1">
        <T v="caption">{lab?.nome}{painel ? ` · atualizado em ${fmtDataHora(painel.atualizadoEm)}` : ''}{carregando ? ' · atualizando…' : ''}</T>
        {a.K12 ? <T v="subtitle">Valor do estoque: {a.K12.valor == null ? 'Dados insuficientes' : fmtMoeda(a.K12.valor)}</T> : null}
        {painel ? <T v="caption">Período {fmtData(painel.periodo.de)} a {fmtData(painel.periodo.ate)}, comparado ao período anterior de mesma duração.</T> : null}
      </View>
      <Opcoes rotulo="Período" valor={dias} opcoes={[...PERIODOS]} onChange={setDias} />
      {erro ? <Aviso>{erro}</Aviso> : null}

      {painel ? (
        <View className="gap-4">
          <KpiCard r={a.K01} anterior={ant.K01} detalhe={`Itens vitais: ${a.K01.extra?.vitais == null ? 'Dados insuficientes' : fmtPct(a.K01.extra.vitais)} (meta ≥ 98%)`} />
          <KpiCard r={a.K02} anterior={ant.K02} />
          <KpiCard r={a.K09} detalhe={a.K09.extra ? `${a.K09.extra.vitais} vitais · ${a.K09.extra.semParametro} itens sem parâmetro de reposição` : undefined} />
          <KpiCard r={a.K13} anterior={ant.K13} />
          <KpiCard r={a.K15} rotulo="Valor em risco de vencimento (90 dias)" detalhe={a.K15.extra ? `30 dias: ${fmtMoeda(a.K15.extra.h30 ?? 0)} · 60 dias: ${fmtMoeda(a.K15.extra.h60 ?? 0)}` : undefined} />
          <KpiCard r={a.K16} anterior={ant.K16} />
          <Card className="gap-1">
            <T v="label">Entregas no prazo e lead time</T>
            <Selo tom="neutro" texto="Disponível na Fase 2 (compras)" />
          </Card>
          <Card className="gap-1">
            <T v="label">Ocupação do local mais crítico</T>
            <Selo tom="neutro" texto="Disponível na Fase 3 (armazenamento)" />
          </Card>

          <T v="title">Atendimento</T>
          <KpiCard r={a.K03} anterior={ant.K03} />
          <KpiCard r={a.K04} anterior={ant.K04} />
          <T v="title">Perdas e validade</T>
          <KpiCard r={a.K14} anterior={ant.K14} />

          <T v="title">Alertas</T>
          {abaixoPR.length === 0 && vencendo.length === 0 ? <T v="caption">Nenhum alerta de reposição ou vencimento.</T> : null}
          {abaixoPR.map((i) => (
            <Card key={i.itemId} onPress={() => router.push(`/item/${i.itemId}`)} className="gap-1">
              <View className="flex-row items-center gap-2">
                <Selo tom={i.criticidade === 'V' ? 'crit' : 'warn'} texto={i.criticidade === 'V' ? 'Vital abaixo do PR' : 'Abaixo do PR'} />
              </View>
              <T v="subtitle">{i.nome}</T>
              <T v="caption">
                Posição {fmtQtd(i.posicaoProjetada, i.unidade)} · PR {fmtQtd(i.reposicao.prEmUso ?? 0, i.unidade)} · sugestão de compra {fmtQtd(i.reposicao.quantidadeSugerida ?? 0, i.unidade)}
              </T>
            </Card>
          ))}
          {vencendo.map(({ item, p }) => (
            <Card key={`${p.loteId}-${p.localId}`} onPress={() => router.push(`/item/${item.itemId}`)} className="gap-1">
              <Selo tom={diasEntre(hoje(), p.validade!) < 0 ? 'crit' : 'warn'} texto={`Vence em ${fmtData(p.validade)}`} />
              <T v="subtitle">{item.nome}</T>
              <T v="code">Lote {p.numero} · {fmtQtd(p.saldoFisico, item.unidade)}</T>
            </Card>
          ))}
          <T v="caption">Valores calculados pelo serviço único de KPIs. Itens sem custo excluídos do valor do estoque: {a.K12?.extra?.semCusto ?? 0}.</T>
        </View>
      ) : null}
    </Tela>
  );
}
