// Transferência entre locais. O banco recusa destino incompatível (temperatura ou classe).
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { EscolherItem, EscolherPosicao, chavePosicao } from '@/components/Escolher';
import { Aviso, Botao, Campo, Card, Carregando, Selecionar, Tela, T } from '@/components/ui';
import { transferir } from '@/data/operacoes';
import { useEstoque } from '@/data/useEstoque';
import { lerNumero } from '@/domain/entrada';
import { fmtQtd } from '@/domain/formato';
import { mensagemErro } from '@/lib/supabase';

export default function Transferir() {
  const params = useLocalSearchParams<{ item?: string }>();
  const { estoque, locais, nomesLocais, erro: erroCarga, recarregar } = useEstoque();
  const [itemId, setItemId] = useState<string | null>(params.item ?? null);
  const [posicao, setPosicao] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [qtd, setQtd] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!estoque) return erroCarga ? <Tela titulo="Transferir" voltar><Aviso>{erroCarga}</Aviso></Tela> : <Carregando />;
  const item = estoque.find((i) => i.itemId === itemId) ?? null;
  const p = item?.posicoes.find((x) => chavePosicao(x) === posicao) ?? null;
  const quantidade = lerNumero(qtd);
  const pendencia = !p ? 'Escolha o lote e o local de origem.' : !destino ? 'Escolha o destino.' : !quantidade || quantidade <= 0 ? 'Informe a quantidade.'
    : quantidade > p.saldoFisico ? 'Maior que o saldo no local de origem.' : null;

  async function enviar() {
    if (!p || !destino || !quantidade) return;
    setEnviando(true);
    setErro(null);
    try {
      await transferir({ lote: p.loteId, origem: p.localId, destino, qtd: quantidade });
      setOk(`${fmtQtd(quantidade, item!.unidade)} do lote ${p.numero} transferidos para ${nomesLocais[destino]}.`);
      setQtd(''); setPosicao(null); setDestino(null);
      await recarregar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Transferir" voltar>
      <T v="caption">Muda o material de local sem alterar o saldo total. O destino precisa aceitar a faixa de temperatura e a classe de compatibilidade do item.</T>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      {!item ? (
        <EscolherItem itens={estoque} onEscolher={setItemId} />
      ) : (
        <View className="gap-4">
          <Card className="gap-1">
            <T v="subtitle">{item.nome}</T>
            <Botao tipo="sutil" titulo="Trocar item" onPress={() => { setItemId(null); setPosicao(null); }} />
          </Card>
          <EscolherPosicao item={item} locais={nomesLocais} valor={posicao} onEscolher={setPosicao} />
          <Selecionar rotulo="Destino" valor={destino} onChange={setDestino} permitirVazio={false}
            opcoes={locais.filter((l) => l.id !== p?.localId).map((l) => ({ valor: l.id, rotulo: l.nome }))} />
          <Campo rotulo={`Quantidade (${item.unidade})`} keyboardType="decimal-pad" value={qtd} onChangeText={setQtd}
            ajuda={p ? `Saldo no local de origem: ${fmtQtd(p.saldoFisico, item.unidade)}` : undefined} />
          {pendencia ? <T v="caption">{pendencia}</T> : null}
          <Botao titulo="Transferir" onPress={enviar} carregando={enviando} desabilitado={!!pendencia} />
        </View>
      )}
    </Tela>
  );
}
