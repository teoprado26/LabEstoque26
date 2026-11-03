// Pedido de compra: linha do tempo das etapas, itens, recebimento por linha e ações por etapa.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SeloEtapa } from '@/components/SeloEtapa';
import { useCor } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Carregando, Tela, T } from '@/components/ui';
import { ETAPAS, avancarPedido, obterPedido, type Pedido } from '@/data/compras';
import { lerData } from '@/domain/entrada';
import { diasEntreInstantes } from '@/domain/estatistica';
import { fmtData, fmtDataHora, fmtMoeda, fmtNumero, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

export default function PedidoTela() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pode } = useSessao();
  const cor = useCor();
  const [p, setP] = useState<Pedido | null>(null);
  const [previsto, setPrevisto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [cancelar, setCancelar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setP(await obterPedido(id!));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [id]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const agir = async (fn: () => Promise<void>, msg: string) => {
    setErro(null);
    try {
      await fn();
      setOk(msg);
      setCancelar(false);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  if (!p) return erro ? <Tela titulo="Pedido" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const total = p.pedido_linhas.reduce((s, l) => s + Number(l.qtd_pedida) * Number(l.custo_unitario_previsto ?? 0), 0);
  const aguardandoEntrega = p.status === 'aprovado' || p.status === 'enviado';
  const previstoIso = previsto ? lerData(previsto) : null;
  const datas = p as unknown as Record<string, string | null>;
  const idxAtual = ETAPAS.findIndex((e) => e.valor === p.status);

  return (
    <Tela titulo={`Pedido nº ${p.numero}`} voltar>
      <SeloEtapa p={p} />
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Card className="gap-1">
        <T v="caption">Fornecedor: {p.fornecedores?.nome ?? '—'}{p.projetos ? ` · projeto ${p.projetos.codigo}` : ''}</T>
        {p.previsto_para ? <T v="caption">Entrega prevista: {fmtData(p.previsto_para)}</T> : null}
        {total > 0 ? <T v="caption">Total previsto: {fmtMoeda(total)}</T> : null}
        {p.observacao ? <T v="caption">{p.observacao}</T> : null}
        {p.motivo_cancelamento ? <Aviso tom="warn">Cancelado: {p.motivo_cancelamento}</Aviso> : null}
      </Card>

      <Card className="gap-2">
        <T v="label">Etapas</T>
        {ETAPAS.map((e, i) => {
          const em = datas[e.campo];
          const anterior = i > 0 ? datas[ETAPAS[i - 1].campo] : null;
          return (
            <View key={e.valor} className="flex-row items-center gap-3">
              <View className={`h-6 w-6 items-center justify-center rounded-full ${em ? 'bg-brand' : 'border border-default-secondary'}`}>
                {em ? <Check size={14} color={cor('icon-on-brand')} /> : null}
              </View>
              <View className="flex-1">
                <T v={i === idxAtual ? 'subtitle' : 'body'}>{e.rotulo}</T>
                <T v="caption">{em ? `${fmtDataHora(em)}${anterior ? ` · ${fmtNumero(diasEntreInstantes(anterior, em), 1)} dias desde a etapa anterior` : ''}` : 'Pendente'}</T>
              </View>
            </View>
          );
        })}
      </Card>

      <T v="title">Itens</T>
      {p.pedido_linhas.map((l) => {
        const it = l.itens;
        const falta = Number(l.qtd_pedida) - Number(l.qtd_recebida);
        return (
          <Card key={l.id} className="gap-2">
            <T v="subtitle">{it?.nome}</T>
            <T v="caption">
              Pedido {fmtNumero(Number(l.qtd_pedida))} {it?.unidade_compra} ({fmtQtd(Number(l.qtd_pedida) * Number(it?.fator_conversao ?? 1), it?.unidade_estoque ?? '')})
              {' · '}recebido {fmtNumero(Number(l.qtd_recebida))}{l.custo_unitario_previsto != null ? ` · ${fmtMoeda(Number(l.custo_unitario_previsto))}/${it?.unidade_compra}` : ''}
            </T>
            {aguardandoEntrega && falta > 0 && pode('tecnico', 'gestor') ? (
              <Botao titulo={`Receber (faltam ${fmtNumero(falta)} ${it?.unidade_compra})`}
                onPress={() => router.push({ pathname: '/receber', params: { item: l.item_id, pedidoLinha: l.id, qtd: String(falta) } })} />
            ) : null}
          </Card>
        );
      })}

      {p.status === 'solicitado' && pode('gestor') ? <Botao titulo="Aprovar pedido" onPress={() => agir(() => avancarPedido(p.id, 'aprovado'), 'Pedido aprovado.')} /> : null}
      {p.status === 'aprovado' && pode('tecnico', 'gestor') ? (
        <Card className="gap-3">
          <T v="subtitle">Registrar envio ao fornecedor</T>
          <Campo rotulo="Previsão de entrega" placeholder="dd/mm/aaaa" value={previsto} onChangeText={setPrevisto} keyboardType="numbers-and-punctuation"
            erro={previsto && !previstoIso ? 'Use dd/mm/aaaa.' : null} ajuda="A data prevista mede as entregas no prazo (K22) e os atrasos por fornecedor." />
          <Botao titulo="Pedido enviado" desabilitado={!previstoIso} onPress={() => agir(() => avancarPedido(p.id, 'enviado', previstoIso), 'Envio registrado.')} />
        </Card>
      ) : null}
      {p.status === 'recebido' && pode('tecnico', 'gestor') ? (
        <Botao titulo="Conferência concluída" onPress={() => agir(() => avancarPedido(p.id, 'conferido'), 'Conferência registrada. O pedido fecha quando os lotes forem liberados.')} />
      ) : null}
      {p.status === 'conferido' ? <Aviso tom="warn">Aguardando a liberação dos lotes deste pedido (ficha do item → Lotes → Liberar).</Aviso> : null}
      {['solicitado', 'aprovado', 'enviado'].includes(p.status) && pode('gestor') ? (
        cancelar ? (
          <Card className="gap-3">
            <Campo rotulo="Motivo do cancelamento" value={motivo} onChangeText={setMotivo} multiline />
            <Botao tipo="perigo" titulo="Confirmar cancelamento" desabilitado={!motivo.trim()} onPress={() => agir(() => avancarPedido(p.id, 'cancelado', null, motivo.trim()), 'Pedido cancelado.')} />
          </Card>
        ) : <Botao tipo="sutil" titulo="Cancelar pedido" onPress={() => setCancelar(true)} />
      ) : null}
    </Tela>
  );
}
