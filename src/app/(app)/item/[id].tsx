import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { KpiCard } from '@/components/KpiCard';
import { Aviso, Botao, Card, Carregando, Selo, SeloLote, Tela, T } from '@/components/ui';
import { carregarEstoque, type ItemEstoque } from '@/data/servicoKpis';
import { saldoDisponivel, validadeEfetiva } from '@/domain/disponibilidade';
import { hoje } from '@/domain/datas';
import { ordenarFEFO } from '@/domain/fefo';
import { fmtData, fmtMoeda, fmtNumero, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

export default function ItemDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lab, pode } = useSessao();
  const [item, setItem] = useState<ItemEstoque | null>(null);
  const [locais, setLocais] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!lab) return;
      Promise.all([carregarEstoque(lab.id), supabase.from('locais').select('id, nome').eq('lab_id', lab.id)])
        .then(([itens, l]) => {
          setItem(itens.find((i) => i.itemId === id) ?? null);
          setLocais(Object.fromEntries((l.data ?? []).map((x) => [x.id, x.nome])));
        })
        .catch((e) => setErro(mensagemErro(e)));
    }, [lab, id]),
  );

  async function liberar(loteId: string) {
    const { error } = await supabase.rpc('fn_alterar_status_lote', { p_lote: loteId, p_para: 'LIBERADO', p_motivo: 'conferência aprovada' });
    if (error) setErro(mensagemErro(error));
    else if (lab) setItem((await carregarEstoque(lab.id)).find((i) => i.itemId === id) ?? null);
  }

  if (!item) return erro ? <Tela titulo="Item" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;

  const dia = hoje();
  const fefo = ordenarFEFO(item.posicoes, dia)[0];
  const r = item.reposicao;

  return (
    <Tela titulo={item.nome} voltar>
      <T v="code" className="text-ink-muted">{item.codigo} · criticidade {item.criticidade}</T>
      <Botao tipo="secundario" titulo={pode('gestor') ? 'Editar cadastro' : 'Ver cadastro'} onPress={() => router.push(`/cadastros/itens/${item.itemId}`)} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      <View className="flex-row gap-2">
        <View className="flex-1"><Botao titulo="Dispensar" onPress={() => router.push({ pathname: '/dispensar', params: { item: item.itemId } })} /></View>
        <View className="flex-1"><Botao tipo="secundario" titulo="Receber" onPress={() => router.push({ pathname: '/receber', params: { item: item.itemId } })} /></View>
      </View>

      <Card className="gap-1">
        <T v="label">Posição</T>
        <T v="caption">Físico <T v="code">{fmtQtd(item.fisico, item.unidade)}</T></T>
        <T v="caption">Disponível <T v="code">{fmtQtd(item.disponivel, item.unidade)}</T></T>
        <T v="caption">Posição projetada <T v="code">{fmtQtd(item.posicaoProjetada, item.unidade)}</T></T>
        <T v="caption">Custo médio {item.custoMedio == null ? 'sem custo' : fmtMoeda(item.custoMedio)}</T>
      </Card>

      <KpiCard r={item.cobertura} />

      <Card className="gap-1">
        <T v="label">Parâmetros de reposição</T>
        <T v="caption">Consumo médio <T v="code">{fmtNumero(r.consumoMedio, 2)} {item.unidade}/dia</T> (σ {fmtNumero(r.desvioConsumo, 2)})</T>
        <T v="caption">Estoque de segurança: calculado {r.esCalculado == null ? '—' : fmtNumero(r.esCalculado, 1)} · em uso {r.esEmUso == null ? '—' : fmtNumero(r.esEmUso, 1)}</T>
        <T v="caption">Ponto de reposição: calculado {r.prCalculado == null ? '—' : fmtNumero(r.prCalculado, 1)} · em uso {r.prEmUso == null ? '—' : fmtNumero(r.prEmUso, 1)}</T>
        <T v="caption">Estoque máximo {r.estoqueMaximo == null ? '—' : fmtNumero(r.estoqueMaximo, 1)} · sugestão de compra {r.quantidadeSugerida == null ? '—' : fmtQtd(r.quantidadeSugerida, item.unidade)}</T>
        {r.parametroManualRecomendado ? <Selo tom="warn" texto={`Parâmetro manual recomendado: ${r.motivosManual.join('; ')}`} /> : null}
      </Card>

      <T v="title">Lotes</T>
      {item.posicoes.length === 0 ? <T v="caption">Sem saldo.</T> : null}
      {item.posicoes.map((p) => (
        <Card key={`${p.loteId}-${p.localId}`} className={`gap-1 ${fefo && fefo.loteId === p.loteId && fefo.localId === p.localId ? 'border-2 border-primary' : ''}`}>
          <View className="flex-row flex-wrap items-center gap-2">
            <T v="code">Lote {p.numero}</T>
            <SeloLote status={p.status} />
            {fefo && fefo.loteId === p.loteId && fefo.localId === p.localId ? <Selo tom="primary" texto="Sugerido FEFO" /> : null}
          </View>
          <T v="caption">{locais[p.localId] ?? 'Local'} · validade efetiva {fmtData(validadeEfetiva(p))}</T>
          <T v="caption">Físico <T v="code">{fmtQtd(p.saldoFisico, item.unidade)}</T> · disponível <T v="code">{fmtQtd(saldoDisponivel(p, dia), item.unidade)}</T>{p.reservado > 0 ? ` · reservado ${fmtQtd(p.reservado, item.unidade)}` : ''}</T>
          {!p.localConforme ? <Selo tom="crit" texto="Local não conforme" /> : null}
          {p.status === 'QUARENTENA' && pode('gestor') ? <Botao tipo="secundario" titulo="Liberar lote" onPress={() => liberar(p.loteId)} /> : null}
        </Card>
      ))}
    </Tela>
  );
}
