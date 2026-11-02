import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { qrDoLote } from '@/components/LeitorQR';
import { Aviso, Botao, Campo, Card, Opcoes, Selo, Tela, T } from '@/components/ui';
import { lerData, lerNumero, listarItens, listarLocais, type ItemResumo, type Opcao } from '@/data/cadastros';
import { fmtNumero } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

export default function Receber() {
  const params = useLocalSearchParams<{ item?: string }>();
  const { lab, pode } = useSessao();
  const [itens, setItens] = useState<ItemResumo[]>([]);
  const [locais, setLocais] = useState<Opcao[]>([]);
  const [itemId, setItemId] = useState<string | null>(params.item ?? null);
  const [busca, setBusca] = useState('');
  const [numero, setNumero] = useState('');
  const [validade, setValidade] = useState('');
  const [qtd, setQtd] = useState('');
  const [custo, setCusto] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  const [temp, setTemp] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [recebido, setRecebido] = useState<{ loteId: string; numero: string; item: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!lab) return;
      Promise.all([listarItens(lab.id), listarLocais(lab.id)])
        .then(([i, l]) => { setItens(i); setLocais(l); })
        .catch((e) => setErro(mensagemErro(e)));
    }, [lab]),
  );

  const item = itens.find((i) => i.id === itemId) ?? null;
  const quantidade = lerNumero(qtd);
  const dataValidade = validade ? lerData(validade) : null;

  async function confirmar() {
    if (!item || !quantidade || !local) return;
    setEnviando(true);
    setErro(null);
    const { data, error } = await supabase.rpc('fn_receber', {
      p_item: item.id, p_numero: numero.trim(), p_validade: dataValidade, p_qtd_compra: quantidade, p_local: local,
      p_custo_unitario_compra: lerNumero(custo), p_temp_chegada: lerNumero(temp),
    });
    setEnviando(false);
    if (error) return setErro(mensagemErro(error));
    setRecebido({ loteId: data as string, numero: numero.trim(), item: item.nome });
    setNumero('');
    setValidade('');
    setQtd('');
    setCusto('');
    setTemp('');
  }

  return (
    <Tela titulo="Receber" voltar>
      {erro ? <Aviso>{erro}</Aviso> : null}
      {recebido ? (
        <Card className="items-center gap-3">
          <Selo tom="warn" texto="QUARENTENA · aguardando conferência" />
          <T v="subtitle">{recebido.item}</T>
          <T v="code">Lote {recebido.numero}</T>
          <View className="rounded-md bg-white p-3">
            <QRCode value={qrDoLote(recebido.loteId)} size={160} />
          </View>
          <T v="caption">Etiqueta do lote. Imprima e cole na embalagem; o gestor libera o lote após a conferência.</T>
          <Botao tipo="secundario" titulo="Receber outro lote" onPress={() => setRecebido(null)} />
        </Card>
      ) : !item ? (
        <View className="gap-2">
          <Campo rotulo="Item" placeholder="Busque por nome ou código" value={busca} onChangeText={setBusca} />
          {itens
            .filter((i) => !busca || `${i.nome} ${i.codigo}`.toLowerCase().includes(busca.toLowerCase()))
            .slice(0, 20)
            .map((i) => (
              <Card key={i.id} onPress={() => setItemId(i.id)}>
                <T v="subtitle">{i.nome}</T>
                <T v="code" className="text-ink-muted">{i.codigo}</T>
              </Card>
            ))}
          {itens.length === 0 ? <T v="caption">Nenhum item cadastrado.</T> : null}
          {pode('gestor') ? <Botao tipo="secundario" titulo="Cadastrar novo item" onPress={() => router.push('/cadastros/itens/novo')} /> : null}
        </View>
      ) : (
        <View className="gap-4">
          <Card className="gap-1">
            <T v="subtitle">{item.nome}</T>
            <T v="caption">Compra em {item.unidadeCompra}; estoque em {item.unidadeEstoque} (1 = {fmtNumero(item.fator, 3)} {item.unidadeEstoque})</T>
            <Botao tipo="secundario" titulo="Trocar item" onPress={() => setItemId(null)} />
          </Card>
          <Campo rotulo="Número do lote" value={numero} onChangeText={setNumero} autoCapitalize="characters" />
          <Campo rotulo="Validade" placeholder="dd/mm/aaaa" value={validade} onChangeText={setValidade} keyboardType="numbers-and-punctuation"
            erro={validade && !dataValidade ? 'Use o formato dd/mm/aaaa.' : null} />
          <Campo rotulo={`Quantidade recebida (${item.unidadeCompra})`} keyboardType="decimal-pad" value={qtd} onChangeText={setQtd}
            ajuda={quantidade ? `Entra no estoque como ${fmtNumero(quantidade * item.fator, 3)} ${item.unidadeEstoque}.` : undefined} />
          <Campo rotulo={`Custo unitário (R$ por ${item.unidadeCompra})`} keyboardType="decimal-pad" value={custo} onChangeText={setCusto} ajuda="Deixe vazio para doações ou amostras sem custo." />
          <Campo rotulo="Temperatura na chegada (°C)" keyboardType="numbers-and-punctuation" value={temp} onChangeText={setTemp} />
          <Opcoes rotulo="Local de armazenamento" valor={local} opcoes={locais.map((l) => ({ valor: l.id, rotulo: l.nome }))} onChange={setLocal} />
          <Botao
            titulo="Registrar recebimento"
            onPress={confirmar}
            carregando={enviando}
            desabilitado={!numero.trim() || !quantidade || quantidade <= 0 || !local || (!!validade && !dataValidade)}
          />
        </View>
      )}
    </Tela>
  );
}
