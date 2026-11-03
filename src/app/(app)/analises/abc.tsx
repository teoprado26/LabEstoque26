// Curva ABC (valor consumido em 12 meses) e matriz ABC × criticidade (VED).
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { GraficoCurvaABC } from '@/components/graficos';
import { Aviso, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { carregarABC, type AnaliseABC } from '@/data/servicoAnalises';
import { carregarEstoque } from '@/data/servicoKpis';
import { FREQUENCIA_CONTAGEM, matrizABCVED, prioridade, resumoABC, type ClasseABC } from '@/domain/abc';
import { fmtData, fmtMoeda, fmtNumero, fmtPct } from '@/domain/formato';
import type { Criticidade } from '@/domain/tipos';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

const CRIT: Record<Criticidade, string> = { V: 'Vital', E: 'Essencial', D: 'Desejável' };

export default function CurvaABC() {
  const { lab } = useSessao();
  const [meses, setMeses] = useState<'6' | '12'>('12');
  const [d, setD] = useState<AnaliseABC | null>(null);
  const [celula, setCelula] = useState<[ClasseABC, Criticidade] | null>(null);
  const [filtro, setFiltro] = useState<'todos' | ClasseABC>('todos');
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lab) return;
    setD(null);
    carregarEstoque(lab.id).then((e) => carregarABC(lab.id, e, Number(meses))).then(setD).catch((x) => setErro(mensagemErro(x)));
  }, [lab, meses]));

  const matriz = useMemo(() => (d ? matrizABCVED(d.linhas) : null), [d]);
  if (!d || !matriz) return erro ? <Tela titulo="Curva ABC" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const resumo = resumoABC(d.linhas);
  const lista = celula ? matriz[celula[0]][celula[1]] : d.linhas.filter((l) => filtro === 'todos' || l.classe === filtro);

  return (
    <Tela titulo="Curva ABC-VED" voltar>
      <T v="caption">Itens em ordem de valor consumido ({fmtData(d.de)} a {fmtData(d.ate)}). Classe A: os poucos itens que somam 80% do valor; B: os próximos 15%; C: o restante. A criticidade (Vital, Essencial, Desejável) entra na prioridade: vital é sempre prioritário.</T>
      <Opcoes rotulo="Janela" valor={meses} onChange={setMeses} opcoes={[{ valor: '6', rotulo: '6 meses' }, { valor: '12', rotulo: '12 meses' }]} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {!d.suficiente ? <Aviso tom="warn">Dados insuficientes para uma curva confiável: há {fmtNumero(d.mesesDeDados, 1)} meses de consumo (mínimo de 6). Use como referência preliminar.</Aviso> : null}
      {d.linhas.length === 0 ? <T v="caption">Nenhum consumo valorado no período.</T> : (
        <>
          <Card className="gap-2"><GraficoCurvaABC linhas={d.linhas} /></Card>

          <Card className="gap-2">
            <T v="label">Resumo por classe</T>
            {resumo.map((r) => (
              <View key={r.classe} className="flex-row justify-between gap-2 border-t border-default pt-2">
                <T v="body">Classe {r.classe}</T>
                <T v="caption" className="text-default">{r.itens} ite{r.itens === 1 ? 'm' : 'ns'} · {fmtMoeda(r.valor)} · {fmtPct(r.participacao)}</T>
              </View>
            ))}
          </Card>

          <Card className="gap-2">
            <T v="label">Matriz ABC × criticidade</T>
            <T v="caption">Toque numa célula para ver os itens. A cor indica a prioridade de controle e a frequência de contagem cíclica sugerida.</T>
            <View className="flex-row gap-1">
              <View className="w-10" />
              {(['V', 'E', 'D'] as Criticidade[]).map((c) => <T key={c} v="label" className="flex-1 text-center">{CRIT[c]}</T>)}
            </View>
            {(['A', 'B', 'C'] as ClasseABC[]).map((cl) => (
              <View key={cl} className="flex-row gap-1">
                <View className="w-10 justify-center"><T v="label">{cl}</T></View>
                {(['V', 'E', 'D'] as Criticidade[]).map((c) => {
                  const pr = prioridade(cl, c);
                  const sel = celula?.[0] === cl && celula?.[1] === c;
                  return (
                    <Pressable key={c} onPress={() => setCelula(sel ? null : [cl, c])} accessibilityRole="button"
                      accessibilityLabel={`Classe ${cl}, ${CRIT[c]}: ${matriz[cl][c].length} itens, prioridade ${pr}`}
                      className={`min-h-14 flex-1 items-center justify-center rounded-md border ${sel ? 'border-2 border-brand' : 'border-default'} ${pr === 'alta' ? 'bg-danger-tertiary' : pr === 'media' ? 'bg-warning-tertiary' : 'bg-secondary'}`}>
                      <T v="subtitle">{matriz[cl][c].length}</T>
                      <T v="caption" className="text-default">{pr}</T>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <T v="caption">Contagem sugerida: alta a cada {FREQUENCIA_CONTAGEM.alta} dias · média a cada {FREQUENCIA_CONTAGEM.media} · baixa a cada {FREQUENCIA_CONTAGEM.baixa}.</T>
          </Card>

          {celula ? <Selo tom="primary" texto={`Mostrando classe ${celula[0]} · ${CRIT[celula[1]]}`} /> : (
            <Opcoes rotulo="Itens" valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'todos', rotulo: 'Todos' }, { valor: 'A', rotulo: 'A' }, { valor: 'B', rotulo: 'B' }, { valor: 'C', rotulo: 'C' }]} />
          )}
          {lista.map((l) => (
            <Card key={l.itemId} onPress={() => router.push(`/item/${l.itemId}` as Href)} className="gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Selo tom={l.classe === 'A' ? 'primary' : 'neutro'} texto={`Classe ${l.classe}`} />
                <Selo tom={l.criticidade === 'V' ? 'crit' : 'neutro'} texto={CRIT[l.criticidade]} />
              </View>
              <T v="subtitle">{l.posicao}. {l.nome}</T>
              <T v="caption">{fmtMoeda(l.valor)} · {fmtPct(l.participacao)} do consumo · acumulado {fmtPct(l.acumulado)}</T>
            </Card>
          ))}
        </>
      )}
    </Tela>
  );
}
