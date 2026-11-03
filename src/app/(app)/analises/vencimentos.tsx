// Vencimentos: lotes com saldo por validade efetiva (inclui validade após abertura), com filtros.
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { BarrasHorizontais } from '@/components/graficos';
import { Aviso, Campo, Card, Carregando, Opcoes, Selo, SeloLote, Tela, T } from '@/components/ui';
import { carregarEstoque, type ItemEstoque } from '@/data/servicoKpis';
import { diasEntre, hoje } from '@/domain/datas';
import { validadeEfetiva } from '@/domain/disponibilidade';
import { fmtData, fmtMoeda, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

type Faixa = 'vencidos' | '30' | '60' | '90' | 'todos';

export default function Vencimentos() {
  const { lab } = useSessao();
  const [estoque, setEstoque] = useState<ItemEstoque[] | null>(null);
  const [faixa, setFaixa] = useState<Faixa>('30');
  const [crit, setCrit] = useState<'todos' | 'V'>('todos');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (lab) carregarEstoque(lab.id).then(setEstoque).catch((e) => setErro(mensagemErro(e)));
  }, [lab]));

  const dia = hoje();
  const lotes = useMemo(() => (estoque ?? []).flatMap((i) => {
    const porLote = new Map<string, { item: ItemEstoque; loteId: string; numero: string; status: string; validade: string; dias: number; qtd: number; valor: number }>();
    for (const p of i.posicoes) {
      const v = validadeEfetiva(p);
      if (!v || p.saldoFisico <= 0) continue;
      const x = porLote.get(p.loteId) ?? { item: i, loteId: p.loteId, numero: p.numero, status: p.status, validade: v, dias: diasEntre(dia, v), qtd: 0, valor: 0 };
      x.qtd += p.saldoFisico;
      x.valor += p.saldoFisico * (p.custoUnitario ?? i.custoMedio ?? 0);
      porLote.set(p.loteId, x);
    }
    return [...porLote.values()];
  }).sort((a, b) => a.dias - b.dias), [estoque, dia]);

  if (!estoque) return erro ? <Tela titulo="Vencimentos" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const soma = (f: (d: number) => boolean) => lotes.filter((l) => f(l.dias)).reduce((s, l) => s + l.valor, 0);
  const faixas = [
    { rotulo: 'Já vencidos', valor: soma((d) => d < 0), destaque: true },
    { rotulo: 'Até 30 dias', valor: soma((d) => d >= 0 && d <= 30) },
    { rotulo: '31 a 60 dias', valor: soma((d) => d > 30 && d <= 60) },
    { rotulo: '61 a 90 dias', valor: soma((d) => d > 60 && d <= 90) },
  ];
  const visiveis = lotes.filter((l) => (faixa === 'todos' ? true : faixa === 'vencidos' ? l.dias < 0 : l.dias >= 0 && l.dias <= Number(faixa)))
    .filter((l) => crit === 'todos' || l.item.criticidade === 'V')
    .filter((l) => !busca.trim() || `${l.item.nome} ${l.numero}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <Tela titulo="Vencimentos" voltar>
      <T v="caption">Valor de estoque por faixa de validade. Para o que vence logo: use primeiro (a dispensação já sugere pelo FEFO), ofereça a outros grupos ou reveja a quantidade da próxima compra.</T>
      <Card className="gap-2">
        <T v="label">Valor por faixa</T>
        <BarrasHorizontais linhas={faixas} formatar={fmtMoeda} />
      </Card>
      <Campo rotulo="Buscar" placeholder="Item ou lote" value={busca} onChangeText={setBusca} />
      <Opcoes rotulo="Faixa" valor={faixa} onChange={setFaixa} opcoes={[
        { valor: 'vencidos', rotulo: 'Vencidos' }, { valor: '30', rotulo: '30 dias' }, { valor: '60', rotulo: '60 dias' }, { valor: '90', rotulo: '90 dias' }, { valor: 'todos', rotulo: 'Todos' },
      ]} />
      <Opcoes rotulo="Criticidade" valor={crit} onChange={setCrit} opcoes={[{ valor: 'todos', rotulo: 'Todas' }, { valor: 'V', rotulo: 'Só vitais' }]} />
      <T v="caption">{visiveis.length} lote{visiveis.length === 1 ? '' : 's'} · {fmtMoeda(visiveis.reduce((s, l) => s + l.valor, 0))}</T>
      {visiveis.map((l) => (
        <Card key={l.loteId} onPress={() => router.push(`/lote/${l.loteId}` as Href)} className="gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Selo tom={l.dias < 0 || l.dias <= 7 ? 'crit' : l.dias <= 30 ? 'warn' : 'neutro'}
              texto={l.dias < 0 ? `✕ Venceu há ${-l.dias} dias` : l.dias === 0 ? '! Vence hoje' : `${l.dias <= 30 ? '! ' : ''}${l.dias} dias`} />
            <SeloLote status={l.status as never} />
            {l.item.criticidade === 'V' ? <Selo tom="primary" texto="Vital" /> : null}
          </View>
          <T v="subtitle">{l.item.nome}</T>
          <T v="caption">Lote {l.numero} · validade {fmtData(l.validade)} · {fmtQtd(l.qtd, l.item.unidade)} · {fmtMoeda(l.valor)}</T>
        </Card>
      ))}
    </Tela>
  );
}
