// Ficha do produto: visão geral (posição, reposição, cadastro completo), lotes e rastreabilidade.
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { CADASTROS, type CampoDef, type Registro } from '@/cadastros/config';
import { KpiCard } from '@/components/KpiCard';
import { LinhaDoTempo } from '@/components/LinhaDoTempo';
import { ButtonGroup, Tabs } from '@/components/sds';
import { Aviso, Botao, Card, Carregando, Interruptor, Selo, SeloLote, Tela, T } from '@/components/ui';
import { listarReferencias, obterRegistro } from '@/data/repositorioCadastros';
import { linhaDoTempo, listarLotesDoItem, type Evento, type LoteDoItem } from '@/data/rastreabilidade';
import { carregarEstoque, type ItemEstoque } from '@/data/servicoKpis';
import { diasEntre, hoje } from '@/domain/datas';
import { saldoDisponivel, validadeEfetiva } from '@/domain/disponibilidade';
import { ordenarFEFO } from '@/domain/fefo';
import { fmtData, fmtMoeda, fmtNumero, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

type Aba = 'geral' | 'lotes' | 'rastreio';

function valorCampo(c: CampoDef, r: Registro, categorias: Record<string, string>): string {
  const v = r[c.chave];
  if (v == null || v === '') return '—';
  if (c.tipo === 'bool') return v ? 'Sim' : 'Não';
  if (c.tipo === 'opcao') return c.opcoes.find((o) => o.valor === v)?.rotulo ?? String(v);
  if (c.tipo === 'ref') return categorias[String(v)] ?? '—';
  if (c.tipo === 'numero') return fmtNumero(Number(v), Number.isInteger(Number(v)) ? 0 : 2);
  if (c.tipo === 'lista') return (v as string[]).join(', ');
  return String(v);
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View className="flex-row justify-between gap-4 border-t border-default py-2">
      <T v="caption" className="flex-1">{rotulo}</T>
      <T v="body" className="flex-1 text-right">{valor}</T>
    </View>
  );
}

export default function ItemDetalhe() {
  const { id, aba: abaInicial } = useLocalSearchParams<{ id: string; aba?: Aba }>();
  const { lab, pode } = useSessao();
  const [aba, setAba] = useState<Aba>(abaInicial ?? 'geral');
  const [item, setItem] = useState<ItemEstoque | null>(null);
  const [cadastro, setCadastro] = useState<Registro | null>(null);
  const [categorias, setCategorias] = useState<Record<string, string>>({});
  const [lotes, setLotes] = useState<LoteDoItem[]>([]);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [historicos, setHistoricos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!lab) return;
      Promise.all([carregarEstoque(lab.id), obterRegistro('itens', id!), listarReferencias(lab.id, 'categorias'), listarLotesDoItem(id!)])
        .then(([itens, reg, cats, ls]) => {
          setItem(itens.find((i) => i.itemId === id) ?? null);
          setCadastro(reg);
          setCategorias(Object.fromEntries(cats.map((c) => [c.id, c.nome])));
          setLotes(ls);
        })
        .catch((e) => setErro(mensagemErro(e)));
      linhaDoTempo({ itemId: id! }).then(setEventos).catch((e) => setErro(mensagemErro(e)));
    }, [lab, id]),
  );

  if (!item || !cadastro) return erro ? <Tela titulo="Item" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;

  const dia = hoje();
  const fefo = ordenarFEFO(item.posicoes, dia)[0];
  const r = item.reposicao;
  const comSaldo = lotes.filter((l) => l.saldo > 0);
  const visiveis = historicos ? lotes : comSaldo;
  const disponivelDoLote = (loteId: string) => item.posicoes.filter((p) => p.loteId === loteId).reduce((t, p) => t + saldoDisponivel(p, dia), 0);
  const fds = cadastro.fds_url as string | null;

  return (
    <Tela titulo={item.nome} voltar>
      <View className="flex-row flex-wrap items-center gap-2">
        <T v="code" className="text-secondary">{item.codigo}</T>
        {item.criticidade === 'V' ? <Selo tom="primary" texto="Vital" /> : <Selo tom="neutro" texto={item.criticidade === 'E' ? 'Essencial' : 'Desejável'} />}
        {!item.ativo ? <Selo tom="neutro" texto="Inativo" /> : null}
        {cadastro.controlado ? <Selo tom="warn" texto="Controlado" /> : null}
      </View>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <ButtonGroup>
        <Botao titulo="Dispensar" onPress={() => router.push({ pathname: '/dispensar', params: { item: item.itemId } })} />
        <Botao tipo="secundario" titulo="Receber" onPress={() => router.push({ pathname: '/receber', params: { item: item.itemId } })} />
      </ButtonGroup>

      <Tabs value={aba} onChange={setAba} tabs={[
        { value: 'geral', label: 'Visão geral' },
        { value: 'lotes', label: 'Lotes', count: comSaldo.length },
        { value: 'rastreio', label: 'Rastreio' },
      ]} />

      {aba === 'geral' ? (
        <View className="gap-4">
          <Card className="gap-1">
            <T v="label">Posição agora</T>
            <Info rotulo="Disponível para uso" valor={fmtQtd(item.disponivel, item.unidade)} />
            <Info rotulo="Saldo físico (todos os lotes)" valor={fmtQtd(item.fisico, item.unidade)} />
            <Info rotulo="Posição projetada" valor={fmtQtd(item.posicaoProjetada, item.unidade)} />
            <Info rotulo="Próxima validade" valor={fmtData(item.proximaValidade)} />
            <Info rotulo="Custo médio" valor={item.custoMedio == null ? 'sem custo' : `${fmtMoeda(item.custoMedio)} / ${item.unidade}`} />
            <Info rotulo="Valor em estoque" valor={item.custoMedio == null ? '—' : fmtMoeda(item.fisico * item.custoMedio)} />
            <T v="caption">Disponível = lotes liberados ou abertos, dentro da validade, em local conforme, menos reservas.</T>
          </Card>

          <KpiCard r={item.cobertura} />

          <Card className="gap-1">
            <T v="label">Reposição</T>
            {r.abaixoDoPR ? <Selo tom="warn" texto="! Abaixo do ponto de reposição: comprar" /> : null}
            <Info rotulo="Consumo médio" valor={`${fmtNumero(r.consumoMedio, 2)} ${item.unidade}/dia`} />
            <Info rotulo="Estoque de segurança (em uso)" valor={r.esEmUso == null ? '—' : fmtQtd(r.esEmUso, item.unidade)} />
            <Info rotulo="Ponto de reposição (em uso)" valor={r.prEmUso == null ? '—' : fmtQtd(r.prEmUso, item.unidade)} />
            <Info rotulo="Ponto de reposição calculado" valor={r.prCalculado == null ? '—' : fmtQtd(r.prCalculado, item.unidade)} />
            <Info rotulo="Estoque máximo" valor={r.estoqueMaximo == null ? '—' : fmtQtd(r.estoqueMaximo, item.unidade)} />
            <Info rotulo="Sugestão de compra" valor={r.quantidadeSugerida == null ? '—' : fmtQtd(r.quantidadeSugerida, item.unidade)} />
            {r.parametroManualRecomendado ? <Aviso tom="warn">Parâmetro manual recomendado: {r.motivosManual.join('; ')}.</Aviso> : null}
          </Card>

          {CADASTROS.itens.secoes.map((s) => (
            <Card key={s.titulo} className="gap-1">
              <T v="label">{s.titulo}</T>
              {s.campos.map((c) => <Info key={c.chave} rotulo={c.rotulo} valor={valorCampo(c, cadastro, categorias)} />)}
            </Card>
          ))}
          {fds ? <Botao tipo="secundario" titulo="Abrir FDS/FISPQ" onPress={() => Linking.openURL(fds)} /> : null}
          <Botao tipo="secundario" titulo={pode('gestor') ? 'Editar cadastro' : 'Ver cadastro'} onPress={() => router.push(`/cadastros/itens/${item.itemId}`)} />
        </View>
      ) : null}

      {aba === 'lotes' ? (
        <View className="gap-4">
          <T v="caption">Ordenados por validade. O lote com contorno é o sugerido pela regra FEFO (primeiro a vencer, primeiro a sair). Toque para ver a rastreabilidade completa.</T>
          <Interruptor rotulo="Mostrar lotes sem saldo" valor={historicos} onChange={setHistoricos} />
          {visiveis.length === 0 ? <T v="caption">Nenhum lote com saldo.</T> : null}
          {visiveis.map((l) => {
            const v = validadeEfetiva({ validade: l.validade, abertoEm: l.aberto_em, validadePosAberturaDias: Number(cadastro.validade_pos_abertura_dias ?? NaN) || null });
            const d = v ? diasEntre(dia, v) : null;
            return (
              <Card key={l.id} selecionado={fefo?.loteId === l.id} onPress={() => router.push(`/lote/${l.id}`)} className="gap-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <T v="code">Lote {l.numero}</T>
                  <SeloLote status={l.status} />
                  {fefo?.loteId === l.id ? <Selo tom="primary" texto="Usar primeiro (FEFO)" /> : null}
                  {d != null && l.saldo > 0 && d <= 30 ? <Selo tom={d < 0 ? 'crit' : 'warn'} texto={d < 0 ? '✕ Vencido' : `! ${d} dias`} /> : null}
                </View>
                <T v="caption">Validade {fmtData(l.validade)}{v && v !== l.validade ? ` · após abertura ${fmtData(v)}` : ''}{l.fornecedor ? ` · ${l.fornecedor}` : ''}</T>
                <T v="caption">Saldo <T v="code">{fmtQtd(l.saldo, item.unidade)}</T> · disponível <T v="code">{fmtQtd(disponivelDoLote(l.id), item.unidade)}</T></T>
                {l.locais.map((x) => <T key={x.localId} v="caption">{x.local}: {fmtQtd(x.saldo, item.unidade)}</T>)}
              </Card>
            );
          })}
        </View>
      ) : null}

      {aba === 'rastreio' ? (
        <View className="gap-4">
          <T v="caption">Todas as entradas, saídas, transferências, perdas, ajustes, estornos e mudanças de status deste item, com quem registrou, quando, onde e para qual projeto. Nada aqui pode ser editado: correções aparecem como estorno.</T>
          {eventos ? <LinhaDoTempo eventos={eventos} unidade={item.unidade} /> : <Carregando />}
        </View>
      ) : null}
    </Tela>
  );
}
