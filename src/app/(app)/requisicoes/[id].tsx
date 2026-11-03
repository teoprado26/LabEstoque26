// Requisição: linhas solicitadas/aprovadas/atendidas, aprovação, atendimento pela dispensação e encerramento.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Aviso, Botao, Campo, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { aprovarRequisicao, cancelarRequisicao, encerrarRequisicao } from '@/data/operacoes';
import { fmtDataHora, fmtQtd } from '@/domain/formato';
import { CAUSAS_RUPTURA, type CausaRuptura } from '@/domain/tipos';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';
import { STATUS_REQ } from '@/domain/requisicoes';

const ROTULO_CAUSA: Record<CausaRuptura, string> = {
  consumo_acima_previsto: 'Consumo acima do previsto', atraso_fornecedor: 'Atraso do fornecedor', compra_nao_realizada: 'Compra não realizada',
  lote_bloqueado: 'Lote bloqueado', perda: 'Perda', erro_saldo: 'Erro de saldo',
};

const VAZIO = { motivo: '', falta: null, causa: null } as { motivo: string; falta: 'sim' | 'nao' | null; causa: CausaRuptura | null };

interface Linha {
  id: string; item_id: string; qtd_solicitada: number; qtd_aprovada: number | null; qtd_atendida: number; motivo_nao_atendimento: string | null; causa_ruptura: string | null;
  itens: { nome: string; unidade_estoque: string } | null;
}
interface Req {
  id: string; numero: number; status: string; finalidade: string; criada_em: string; aprovada_em: string | null; atendida_em: string | null; solicitante_id: string;
  projeto_id: string; projetos: { codigo: string; nome: string; coordenador_id: string | null } | null; requisicao_linhas: Linha[];
}

export default function Requisicao() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessao, pode } = useSessao();
  const [req, setReq] = useState<Req | null>(null);
  const [solicitante, setSolicitante] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<string, { motivo: string; falta: 'sim' | 'nao' | null; causa: CausaRuptura | null }>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('requisicoes')
      .select('*, projetos ( codigo, nome, coordenador_id ), requisicao_linhas ( *, itens ( nome, unidade_estoque ) )').eq('id', id!).maybeSingle();
    if (error) return setErro(error.message);
    setReq(data as unknown as Req);
    if (data) {
      const { data: p } = await supabase.from('perfis_usuario').select('nome, email').eq('id', data.solicitante_id).maybeSingle();
      setSolicitante(p ? p.nome || p.email : null);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const agir = async (fn: () => Promise<unknown>, msg: string) => {
    setErro(null);
    try {
      await fn();
      setOk(msg);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  if (!req) return erro ? <Tela titulo="Requisição" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const st = STATUS_REQ[req.status];
  const podeAprovar = req.status === 'pendente_aprovacao' && (req.projetos?.coordenador_id === sessao?.user.id || pode('gestor'));
  const podeAtender = req.status === 'aprovada' && pode('tecnico', 'gestor');
  const podeCancelar = ['rascunho', 'pendente_aprovacao', 'aprovada'].includes(req.status) && (req.solicitante_id === sessao?.user.id || pode('gestor'));
  const alvo = (l: Linha) => Number(l.qtd_aprovada ?? l.qtd_solicitada);
  const incompletas = req.requisicao_linhas.filter((l) => Number(l.qtd_atendida) < alvo(l));
  const faltaMotivo = incompletas.some((l) => !motivos[l.id]?.motivo?.trim() || !motivos[l.id]?.falta || (motivos[l.id]?.falta === 'sim' && !motivos[l.id]?.causa));

  return (
    <Tela titulo={`Requisição nº ${req.numero}`} voltar>
      <Selo tom={st?.tom ?? 'neutro'} texto={st?.rotulo ?? req.status} />
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Card className="gap-1">
        <T v="caption">Projeto: {req.projetos ? `${req.projetos.codigo} · ${req.projetos.nome}` : '—'}</T>
        <T v="caption">Finalidade: {req.finalidade}</T>
        <T v="caption">Solicitante: {solicitante ?? '—'} · criada em {fmtDataHora(req.criada_em)}</T>
        {req.aprovada_em ? <T v="caption">Aprovada em {fmtDataHora(req.aprovada_em)}</T> : null}
        {req.atendida_em ? <T v="caption">Encerrada em {fmtDataHora(req.atendida_em)}</T> : null}
      </Card>

      <T v="title">Itens</T>
      {req.requisicao_linhas.map((l) => {
        const u = l.itens?.unidade_estoque ?? '';
        const completa = Number(l.qtd_atendida) >= alvo(l);
        return (
          <Card key={l.id} className="gap-2">
            <T v="subtitle">{l.itens?.nome ?? 'Item fora do catálogo'}</T>
            <T v="caption">
              Pedido {fmtQtd(Number(l.qtd_solicitada), u)}{l.qtd_aprovada != null ? ` · aprovado ${fmtQtd(Number(l.qtd_aprovada), u)}` : ''} · atendido {fmtQtd(Number(l.qtd_atendida), u)}
            </T>
            {completa ? <Selo tom="ok" texto="✓ Atendido" /> : null}
            {l.motivo_nao_atendimento ? <T v="caption">Motivo: {l.motivo_nao_atendimento}{l.causa_ruptura ? ` (ruptura: ${ROTULO_CAUSA[l.causa_ruptura as CausaRuptura]})` : ''}</T> : null}
            {podeAtender && !completa ? (
              <Botao titulo="Atender pela dispensação" onPress={() => router.push({
                pathname: '/dispensar',
                params: { item: l.item_id, linha: l.id, projeto: req.projeto_id, finalidade: req.finalidade, qtd: String(alvo(l) - Number(l.qtd_atendida)) },
              })} />
            ) : null}
            {podeAtender && !completa ? (
              <View className="gap-3 rounded-md border border-default p-3">
                <T v="label">Se não for atender por completo</T>
                <Campo rotulo="Motivo" value={motivos[l.id]?.motivo ?? ''} onChangeText={(t) => setMotivos((m) => ({ ...m, [l.id]: { ...(m[l.id] ?? VAZIO), motivo: t } }))} />
                <Opcoes rotulo="Foi por falta de estoque?" valor={motivos[l.id]?.falta ?? null}
                  onChange={(v) => setMotivos((m) => ({ ...m, [l.id]: { ...(m[l.id] ?? VAZIO), falta: v } }))}
                  opcoes={[{ valor: 'sim', rotulo: 'Sim (conta como ruptura)' }, { valor: 'nao', rotulo: 'Não' }]}
                  ajuda="Reserva planejada para outro projeto ou cancelamento não contam como ruptura." />
                {motivos[l.id]?.falta === 'sim' ? (
                  <Opcoes rotulo="Causa da falta" valor={motivos[l.id]?.causa ?? null}
                    onChange={(v) => setMotivos((m) => ({ ...m, [l.id]: { ...(m[l.id] ?? VAZIO), causa: v } }))}
                    opcoes={CAUSAS_RUPTURA.map((c) => ({ valor: c, rotulo: ROTULO_CAUSA[c] }))} />
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}

      {podeAprovar ? <Botao titulo="Aprovar requisição" onPress={() => agir(() => aprovarRequisicao(req.id), 'Requisição aprovada.')} /> : null}
      {podeAtender ? (
        <Botao titulo="Encerrar atendimento" desabilitado={faltaMotivo}
          onPress={() => agir(() => encerrarRequisicao(req.id, Object.fromEntries(incompletas.map((l) => [l.id, {
            motivo: motivos[l.id].motivo.trim(), causa_ruptura: motivos[l.id].falta === 'sim' ? motivos[l.id].causa : null,
          }]))), 'Atendimento encerrado.')} />
      ) : null}
      {podeAtender && faltaMotivo && incompletas.length ? <T v="caption">Para encerrar, informe o motivo de cada item não atendido por completo.</T> : null}
      {podeCancelar ? <Botao tipo="perigo" titulo="Cancelar requisição" onPress={() => agir(() => cancelarRequisicao(req.id), 'Requisição cancelada.')} /> : null}
    </Tela>
  );
}
