// Consumo valorado por categoria ou por projeto no período.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { BarrasHorizontais } from '@/components/graficos';
import { Aviso, Card, Carregando, Opcoes, Tela, T } from '@/components/ui';
import { consumoPor } from '@/data/servicoAnalises';
import { ultimosDias } from '@/data/servicoKpis';
import { fmtMoeda, fmtPct } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

export default function Consumo() {
  const { lab } = useSessao();
  const [dimensao, setDimensao] = useState<'categoria' | 'projeto'>('projeto');
  const [dias, setDias] = useState<'30' | '90' | '365'>('90');
  const [linhas, setLinhas] = useState<{ rotulo: string; valor: number; quantidade: number }[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lab) return;
    setLinhas(null);
    consumoPor(lab.id, dimensao, ultimosDias(Number(dias))).then(setLinhas).catch((e) => setErro(mensagemErro(e)));
  }, [lab, dimensao, dias]));

  const total = (linhas ?? []).reduce((s, l) => s + l.valor, 0);
  return (
    <Tela titulo="Consumo" voltar>
      <T v="caption">Valor das dispensações a custo de aquisição (custo do lote). É o custo apropriado a cada projeto ou fonte de recurso.</T>
      <Opcoes rotulo="Agrupar por" valor={dimensao} onChange={setDimensao} opcoes={[{ valor: 'projeto', rotulo: 'Projeto' }, { valor: 'categoria', rotulo: 'Categoria' }]} />
      <Opcoes rotulo="Período" valor={dias} onChange={setDias} opcoes={[{ valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }, { valor: '365', rotulo: '12 meses' }]} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {!linhas ? <Carregando /> : linhas.length === 0 ? <T v="caption">Sem dispensações no período.</T> : (
        <>
          <T v="subtitle">Total consumido: {fmtMoeda(total)}</T>
          <Card className="gap-2"><BarrasHorizontais linhas={linhas} formatar={fmtMoeda} /></Card>
          <Card className="gap-1">
            <T v="label">Tabela</T>
            {linhas.map((l) => (
              <View key={l.rotulo} className="flex-row justify-between gap-2 border-t border-default py-2">
                <T v="body" className="flex-1">{l.rotulo}</T>
                <T v="caption" className="text-default">{fmtMoeda(l.valor)} · {fmtPct(total ? (l.valor / total) * 100 : 0)} · {l.quantidade} saídas</T>
              </View>
            ))}
          </Card>
        </>
      )}
    </Tela>
  );
}
