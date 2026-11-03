// Registrar perda: baixa com motivo padronizado. Irreversível (correção só por estorno do gestor).
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { EscolherItem, EscolherPosicao, chavePosicao } from '@/components/Escolher';
import { Aviso, Botao, Campo, Card, Carregando, Opcoes, Selecionar, Tela, T } from '@/components/ui';
import { ROTULO_MOTIVO_PERDA, registrarPerda } from '@/data/operacoes';
import { useEstoque } from '@/data/useEstoque';
import { lerNumero } from '@/domain/entrada';
import { fmtMoeda, fmtQtd } from '@/domain/formato';
import { MOTIVOS_PERDA, type MotivoPerda } from '@/domain/tipos';
import { mensagemErro } from '@/lib/supabase';

export default function Perda() {
  const params = useLocalSearchParams<{ item?: string }>();
  const { estoque, nomesLocais, projetos, erro: erroCarga, recarregar } = useEstoque();
  const [itemId, setItemId] = useState<string | null>(params.item ?? null);
  const [posicao, setPosicao] = useState<string | null>(null);
  const [qtd, setQtd] = useState('');
  const [motivo, setMotivo] = useState<MotivoPerda | null>(null);
  const [descricao, setDescricao] = useState('');
  const [projeto, setProjeto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!estoque) return erroCarga ? <Tela titulo="Registrar perda" voltar><Aviso>{erroCarga}</Aviso></Tela> : <Carregando />;
  const item = estoque.find((i) => i.itemId === itemId) ?? null;
  const p = item?.posicoes.find((x) => chavePosicao(x) === posicao) ?? null;
  const quantidade = lerNumero(qtd);
  const valor = p && quantidade ? quantidade * (p.custoUnitario ?? item?.custoMedio ?? 0) : null;
  const pendencia = !p ? 'Escolha o lote e o local.' : !quantidade || quantidade <= 0 ? 'Informe a quantidade.' : quantidade > p.saldoFisico ? 'Maior que o saldo do lote neste local.'
    : !motivo ? 'Escolha o motivo.' : motivo === 'outro' && !descricao.trim() ? 'Descreva o motivo.' : null;

  async function enviar() {
    if (!p || !quantidade || !motivo) return;
    setEnviando(true);
    setErro(null);
    try {
      await registrarPerda({ lote: p.loteId, local: p.localId, qtd: quantidade, motivo, descricao: descricao.trim() || null, projeto });
      setOk(`Perda de ${fmtQtd(quantidade, item!.unidade)} do lote ${p.numero} registrada.`);
      setQtd(''); setMotivo(null); setDescricao(''); setPosicao(null); setConfirmar(false);
      await recarregar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Registrar perda" voltar>
      <T v="caption">Use para vencimento, contaminação, quebra, extravio e outros descartes. A perda entra no índice de perdas; se for registrada por engano, o gestor pode estornar.</T>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      {!item ? (
        <EscolherItem itens={estoque} onEscolher={setItemId}
          onLote={(l) => { const i = estoque.find((x) => x.posicoes.some((y) => y.loteId === l)); if (i) { setItemId(i.itemId); const y = i.posicoes.find((z) => z.loteId === l && z.saldoFisico > 0); setPosicao(y ? chavePosicao(y) : null); } else setErro('Lote lido não tem saldo neste laboratório.'); }} />
      ) : (
        <View className="gap-4">
          <Card className="gap-1">
            <T v="subtitle">{item.nome}</T>
            <Botao tipo="sutil" titulo="Trocar item" onPress={() => { setItemId(null); setPosicao(null); }} />
          </Card>
          <EscolherPosicao item={item} locais={nomesLocais} valor={posicao} onEscolher={setPosicao} />
          <Campo rotulo={`Quantidade perdida (${item.unidade})`} keyboardType="decimal-pad" value={qtd} onChangeText={setQtd} />
          <Opcoes rotulo="Motivo" valor={motivo} onChange={setMotivo} opcoes={MOTIVOS_PERDA.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO_PERDA[m] }))} />
          <Campo rotulo={motivo === 'outro' ? 'Descrição do motivo (obrigatória)' : 'Descrição (opcional)'} value={descricao} onChangeText={setDescricao} multiline />
          <Selecionar rotulo="Projeto (opcional)" valor={projeto} onChange={setProjeto} opcoes={projetos.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
          {pendencia ? <T v="caption">{pendencia}</T> : null}
          {!confirmar ? (
            <Botao tipo="perigo" titulo="Registrar perda" onPress={() => setConfirmar(true)} desabilitado={!!pendencia} />
          ) : (
            <Card className="gap-3">
              <T v="subtitle">Confirmar a perda?</T>
              <T v="body">{fmtQtd(quantidade!, item.unidade)} do lote {p!.numero} em {nomesLocais[p!.localId]} · {ROTULO_MOTIVO_PERDA[motivo!]}{valor ? ` · ${fmtMoeda(valor)}` : ''}</T>
              <Botao tipo="perigo" titulo="Confirmar perda" onPress={enviar} carregando={enviando} />
              <Botao tipo="secundario" titulo="Voltar e corrigir" onPress={() => setConfirmar(false)} />
            </Card>
          )}
        </View>
      )}
    </Tela>
  );
}
