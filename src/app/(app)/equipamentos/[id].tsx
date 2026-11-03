import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Aviso, Botao, Card, Carregando, Selo, Tela, T } from '@/components/ui';
import { listarServicos, obterSituacao, type EquipamentoSituacao, type Servico } from '@/data/equipamentos';
import { RESULTADOS, SITUACOES, TIPOS_SERVICO, situacaoValida } from '@/domain/equipamentos';
import { fmtData, fmtDataHora, fmtMoeda } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';
import { SeloSituacao } from '@/components/SeloSituacao';

const abrir = (params: Record<string, string>) => router.push({ pathname: '/equipamentos/servico', params });

function LinhaServico({ s, podeOperar }: { s: Servico; podeOperar: boolean }) {
  const aberto = s.status === 'agendado' || s.status === 'em_andamento';
  const resultado = RESULTADOS.find((r) => r.valor === s.resultado);
  return (
    <Card className="gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <T v="label">{TIPOS_SERVICO[s.tipo]}</T>
        {s.status === 'agendado' ? <Selo tom="primary" texto={`Agendado ${fmtData(s.agendado_para)}`} /> : null}
        {s.status === 'em_andamento' ? <Selo tom="warn" texto="! Em andamento" /> : null}
        {s.status === 'concluido' ? <Selo tom="neutro" texto={`Realizado ${fmtData(s.realizado_em)}`} /> : null}
        {s.status === 'cancelado' ? <Selo tom="neutro" texto="Cancelado" /> : null}
        {resultado ? <Selo tom={s.resultado === 'reprovado' ? 'crit' : s.resultado === 'aprovado' ? 'ok' : 'warn'} texto={resultado.rotulo} /> : null}
      </View>
      {s.valida_ate ? <T v="caption">Válida até {fmtData(s.valida_ate)}{s.numero_certificado ? ` · certificado ${s.numero_certificado}` : ''}</T> : null}
      {s.iniciado_em && s.status === 'em_andamento' ? <T v="caption">Iniciado em {fmtDataHora(s.iniciado_em)}</T> : null}
      {s.executor ? <T v="caption">Executor: {s.executor}</T> : null}
      {s.custo != null ? <T v="caption">Custo {fmtMoeda(Number(s.custo))}</T> : null}
      {s.descricao ? <T v="caption">{s.descricao}</T> : null}
      {s.motivo_cancelamento ? <T v="caption">Motivo: {s.motivo_cancelamento}</T> : null}
      {aberto && podeOperar ? (
        <View className="gap-2 pt-1">
          <Botao titulo={s.tipo === 'calibracao' ? 'Registrar resultado' : 'Concluir'} onPress={() => abrir({ modo: 'concluir', servico: s.id })} />
          <View className="flex-row gap-2">
            {s.status === 'agendado' ? (
              <>
                {s.tipo !== 'calibracao' ? <View className="flex-1"><Botao tipo="secundario" titulo="Iniciar" onPress={() => abrir({ modo: 'iniciar', servico: s.id, equipamento: s.equipamento_id })} /></View> : null}
                <View className="flex-1"><Botao tipo="secundario" titulo="Reagendar" onPress={() => abrir({ modo: 'reagendar', servico: s.id })} /></View>
              </>
            ) : null}
            <View className="flex-1"><Botao tipo="perigo" titulo="Cancelar" onPress={() => abrir({ modo: 'cancelar', servico: s.id })} /></View>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export default function Equipamento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pode } = useSessao();
  const [eq, setEq] = useState<EquipamentoSituacao | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const podeOperar = pode('tecnico', 'gestor');

  useFocusEffect(
    useCallback(() => {
      Promise.all([obterSituacao(id!), listarServicos(id!)])
        .then(([e, s]) => { setEq(e); setServicos(s); })
        .catch((e) => setErro(mensagemErro(e)));
    }, [id]),
  );

  if (!eq) return erro ? <Tela titulo="Equipamento" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const sit = situacaoValida(eq.situacao) ? SITUACOES[eq.situacao] : null;
  const abertos = servicos.filter((s) => s.status === 'agendado' || s.status === 'em_andamento');
  const historico = servicos.filter((s) => s.status === 'concluido' || s.status === 'cancelado');

  return (
    <Tela titulo={eq.nome} voltar>
      <T v="code" className="text-ink-muted">{eq.codigo}</T>
      <SeloSituacao situacao={eq.situacao} />
      {sit?.acao ? <Aviso tom={sit.tom === 'crit' ? 'crit' : sit.tom === 'ok' ? 'ok' : 'warn'}>{sit.acao}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}

      <Card className="gap-1">
        <T v="label">Calibração</T>
        {eq.exige_calibracao ? (
          <>
            <T v="caption">A cada {eq.periodicidade_calibracao_dias} dias · última {fmtData(eq.ultima_calibracao)}</T>
            <T v="caption">Válida até {fmtData(eq.calibracao_valida_ate)}{eq.calibracao_agendada ? ` · próxima agendada ${fmtData(eq.calibracao_agendada)}` : ''}</T>
          </>
        ) : <T v="caption">Não exige calibração.</T>}
        <T v="label" className="pt-2">Manutenção preventiva</T>
        {eq.periodicidade_manutencao_dias ? (
          <T v="caption">A cada {eq.periodicidade_manutencao_dias} dias · última {fmtData(eq.ultima_manutencao_preventiva)} · prevista {fmtData(eq.manutencao_prevista)}{eq.manutencao_agendada ? ` · agendada ${fmtData(eq.manutencao_agendada)}` : ''}</T>
        ) : <T v="caption">Sem plano de preventiva.</T>}
      </Card>

      {podeOperar ? (
        <View className="gap-2">
          {eq.exige_calibracao ? <Botao titulo="Agendar calibração" onPress={() => abrir({ modo: 'agendar', equipamento: eq.equipamento_id, tipo: 'calibracao' })} /> : null}
          <Botao tipo={eq.exige_calibracao ? 'secundario' : 'primario'} titulo="Agendar manutenção" onPress={() => abrir({ modo: 'agendar', equipamento: eq.equipamento_id, tipo: 'manutencao_preventiva' })} />
          <Botao tipo="secundario" titulo="Abrir manutenção corretiva" onPress={() => abrir({ modo: 'iniciar', equipamento: eq.equipamento_id })} />
          <Botao tipo="secundario" titulo="Registrar serviço já realizado" onPress={() => abrir({ modo: 'registrar', equipamento: eq.equipamento_id, tipo: eq.exige_calibracao ? 'calibracao' : 'manutencao_preventiva' })} />
        </View>
      ) : null}
      <Botao tipo="secundario" titulo={pode('gestor') ? 'Editar cadastro' : 'Ver cadastro'} onPress={() => router.push(`/cadastros/equipamentos/${eq.equipamento_id}`)} />

      <T v="title">Abertos</T>
      {abertos.length === 0 ? <T v="caption">Nenhum serviço agendado ou em andamento.</T> : null}
      {abertos.map((s) => <LinhaServico key={s.id} s={s} podeOperar={podeOperar} />)}
      <T v="title">Histórico</T>
      {historico.length === 0 ? <T v="caption">Nenhum serviço registrado.</T> : null}
      {historico.map((s) => <LinhaServico key={s.id} s={s} podeOperar={false} />)}
    </Tela>
  );
}
