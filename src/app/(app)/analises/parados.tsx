// Itens parados (K11): saldo > 0 e sem dispensação há ≥ N dias, com valor imobilizado.
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Aviso, Card, Carregando, Opcoes, Tela, T } from '@/components/ui';
import { carregarEstoque, type ItemEstoque } from '@/data/servicoKpis';
import { diasEntre, hoje } from '@/domain/datas';
import { fmtData, fmtMoeda, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

export default function Parados() {
  const { lab } = useSessao();
  const [estoque, setEstoque] = useState<ItemEstoque[] | null>(null);
  const [datas, setDatas] = useState<Map<string, { ultima: string | null; primeira_entrada: string | null }>>(new Map());
  const [limite, setLimite] = useState<'90' | '180' | '365'>('180');
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lab) return;
    Promise.all([carregarEstoque(lab.id), supabase.rpc('fn_ultima_dispensacao', { p_lab: lab.id })])
      .then(([e, u]) => {
        if (u.error) throw new Error(u.error.message);
        setEstoque(e);
        setDatas(new Map(((u.data ?? []) as { item_id: string; ultima: string | null; primeira_entrada: string | null }[]).map((x) => [x.item_id, x])));
      })
      .catch((x) => setErro(mensagemErro(x)));
  }, [lab]));

  if (!estoque) return erro ? <Tela titulo="Itens parados" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const dia = hoje();
  const parados = estoque
    .filter((i) => i.fisico > 0)
    .map((i) => {
      const d = datas.get(i.itemId);
      const ref = d?.ultima ?? d?.primeira_entrada ?? null;
      return { i, ref, nunca: !d?.ultima, dias: ref ? diasEntre(ref, dia) : null, valor: i.custoMedio == null ? 0 : i.fisico * i.custoMedio };
    })
    .filter((x) => x.dias != null && x.dias >= Number(limite))
    .sort((a, b) => b.valor - a.valor);

  return (
    <Tela titulo="Itens parados" voltar>
      <T v="caption">Itens com saldo que não saem há muito tempo. Considere redistribuir para outros laboratórios, doar ou descartar com motivo técnico, e reveja a compra.</T>
      <Opcoes rotulo="Sem saída há pelo menos" valor={limite} onChange={setLimite} opcoes={[{ valor: '90', rotulo: '90 dias' }, { valor: '180', rotulo: '180 dias' }, { valor: '365', rotulo: '1 ano' }]} />
      <T v="subtitle">{parados.length} ite{parados.length === 1 ? 'm' : 'ns'} · {fmtMoeda(parados.reduce((s, x) => s + x.valor, 0))} imobilizados</T>
      {parados.map(({ i, ref, nunca, dias, valor }) => (
        <Card key={i.itemId} onPress={() => router.push(`/item/${i.itemId}` as Href)} className="gap-1">
          <T v="subtitle">{i.nome}</T>
          <T v="caption">{fmtQtd(i.fisico, i.unidade)} · {fmtMoeda(valor)} · {nunca ? `nunca dispensado (entrada em ${fmtData(ref)})` : `última saída em ${fmtData(ref)}`} · {dias} dias</T>
        </Card>
      ))}
      {parados.length === 0 ? <Aviso tom="ok">Nenhum item parado nesse limite.</Aviso> : null}
    </Tela>
  );
}
