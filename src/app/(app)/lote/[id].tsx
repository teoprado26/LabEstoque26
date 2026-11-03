// Rastreabilidade de um lote: dados de recebimento, onde está, linha do tempo e etiqueta QR.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { LinhaDoTempo } from '@/components/LinhaDoTempo';
import { qrDoLote } from '@/components/LeitorQR';
import { Aviso, Botao, Card, Carregando, SeloLote, Tela, T } from '@/components/ui';
import { linhaDoTempo, listarLotesDoItem, obterLote, type Evento, type LoteDoItem } from '@/data/rastreabilidade';
import { validadeEfetiva } from '@/domain/disponibilidade';
import { fmtData, fmtDataHora, fmtMoeda, fmtQtd } from '@/domain/formato';
import { mensagemErro } from '@/lib/supabase';

export default function Lote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lote, setLote] = useState<Awaited<ReturnType<typeof obterLote>>>(null);
  const [irmaos, setIrmaos] = useState<LoteDoItem[]>([]);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      obterLote(id!)
        .then(async (l) => {
          setLote(l);
          if (l) setIrmaos(await listarLotesDoItem(l.item_id));
        })
        .catch((e) => setErro(mensagemErro(e)));
      linhaDoTempo({ loteId: id! }).then(setEventos).catch((e) => setErro(mensagemErro(e)));
    }, [id]),
  );

  if (!lote) return erro ? <Tela titulo="Lote" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const u = lote.itens.unidade_estoque;
  const este = irmaos.find((l) => l.id === lote.id);
  const origem = lote.lote_origem_id ? irmaos.find((l) => l.id === lote.lote_origem_id) : null;
  const derivados = irmaos.filter((l) => l.lote_origem_id === lote.id);
  const vEfetiva = validadeEfetiva({ validade: lote.validade, abertoEm: lote.aberto_em, validadePosAberturaDias: lote.itens.validade_pos_abertura_dias });

  return (
    <Tela titulo={`Lote ${lote.numero}`} voltar>
      <View className="flex-row flex-wrap items-center gap-2">
        <SeloLote status={lote.status} />
        <T v="caption">{lote.itens.nome} · {lote.itens.codigo}</T>
      </View>
      {erro ? <Aviso>{erro}</Aviso> : null}

      <Card className="gap-1">
        <T v="label">Identificação</T>
        <T v="caption">Fabricante: {lote.fabricante ?? '—'} · Fornecedor: {lote.fornecedores?.nome ?? '—'}</T>
        <T v="caption">Fabricação {fmtData(lote.fabricacao)} · validade {fmtData(lote.validade)}</T>
        {lote.aberto_em ? <T v="caption">Aberto em {fmtDataHora(lote.aberto_em)} · usar até {fmtData(vEfetiva)}</T> : null}
        <T v="caption">Recebido em {fmtDataHora(lote.criado_em)}{lote.temp_chegada != null ? ` · chegou a ${lote.temp_chegada} °C` : ''}</T>
        <T v="caption">Custo {lote.custo_unitario == null ? 'sem custo' : `${fmtMoeda(Number(lote.custo_unitario))} / ${u}`}</T>
        {lote.observacao ? <T v="caption">{lote.observacao}</T> : null}
      </Card>

      <Card className="gap-1">
        <T v="label">Onde está</T>
        {este && este.locais.length ? este.locais.map((x) => <T key={x.localId} v="body">{x.local}: <T v="code">{fmtQtd(x.saldo, u)}</T></T>) : <T v="caption">Sem saldo.</T>}
      </Card>

      {origem || derivados.length ? (
        <Card className="gap-2">
          <T v="label">Lotes relacionados</T>
          {origem ? <Botao tipo="sutil" titulo={`Veio da devolução do lote ${origem.numero}`} onPress={() => router.push(`/lote/${origem.id}`)} /> : null}
          {derivados.map((d) => <Botao key={d.id} tipo="sutil" titulo={`Devolução registrada como ${d.numero} (${d.status})`} onPress={() => router.push(`/lote/${d.id}`)} />)}
        </Card>
      ) : null}

      <Card className="items-center gap-2">
        <T v="label">Etiqueta</T>
        {/* QR sempre em fundo branco, para leitura em qualquer tema. */}
        <View className="rounded-md p-3" style={{ backgroundColor: '#ffffff' }}>
          <QRCode value={qrDoLote(lote.id)} size={140} />
        </View>
        <T v="caption">Lida na dispensação e no inventário.</T>
      </Card>

      <T v="title">Rastreabilidade</T>
      {eventos ? <LinhaDoTempo eventos={eventos} unidade={u} mostrarLote={false} /> : <Carregando />}
      <Botao tipo="secundario" titulo="Ver o item" onPress={() => router.push(`/item/${lote.item_id}`)} />
    </Tela>
  );
}
