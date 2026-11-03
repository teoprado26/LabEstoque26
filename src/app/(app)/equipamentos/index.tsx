import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '@/components/sds';
import { SeloSituacao } from '@/components/SeloSituacao';
import { Aviso, Campo, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { listarAgenda, listarSituacao, type EquipamentoSituacao, type Servico } from '@/data/equipamentos';
import { diasEntre, hoje } from '@/domain/datas';
import { SITUACOES, TIPOS_SERVICO, ordenarPorUrgencia, situacaoValida } from '@/domain/equipamentos';
import { fmtData } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

function quando(dia: string | null) {
  if (!dia) return 'sem data';
  const d = diasEntre(hoje(), dia);
  if (d < 0) return `${fmtData(dia)} · atrasado ${-d} dia${d === -1 ? '' : 's'}`;
  if (d === 0) return `${fmtData(dia)} · hoje`;
  return `${fmtData(dia)} · em ${d} dia${d === 1 ? '' : 's'}`;
}

export default function Equipamentos() {
  const { lab, pode } = useSessao();
  const [lista, setLista] = useState<EquipamentoSituacao[] | null>(null);
  const [agenda, setAgenda] = useState<Servico[]>([]);
  const [filtro, setFiltro] = useState<'atencao' | 'todos'>('atencao');
  const [visao, setVisao] = useState<'agenda' | 'equipamentos'>('equipamentos');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!lab) return;
      Promise.all([listarSituacao(lab.id), listarAgenda(lab.id)])
        .then(([l, a]) => { setLista(l); setAgenda(a); })
        .catch((e) => setErro(mensagemErro(e)));
    }, [lab]),
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ordenarPorUrgencia(lista ?? []).filter(
      (e) => (filtro === 'todos' || (situacaoValida(e.situacao) && SITUACOES[e.situacao].atencao)) && (!q || `${e.nome} ${e.codigo}`.toLowerCase().includes(q)),
    );
  }, [lista, filtro, busca]);

  if (!lista && !erro) return <Carregando />;
  const atencao = (lista ?? []).filter((e) => situacaoValida(e.situacao) && SITUACOES[e.situacao].atencao).length;

  return (
    <Tela
      titulo="Equipamentos"
      voltar
      acao={pode('gestor') ? (
        <IconButton icon={Plus} variant="primary" label="Novo equipamento" onPress={() => router.push('/cadastros/equipamentos/novo')} />
      ) : undefined}
    >
      {erro ? <Aviso>{erro}</Aviso> : null}
      <T v="caption">{lista?.length ?? 0} equipamentos ativos · {atencao} precisam de atenção · {agenda.length} serviços abertos</T>
      <Opcoes rotulo="Ver" valor={visao} onChange={setVisao} opcoes={[{ valor: 'equipamentos', rotulo: 'Equipamentos' }, { valor: 'agenda', rotulo: 'Agenda' }]} />

      {visao === 'agenda' ? (
        <View className="gap-4">
          {agenda.length === 0 ? <T v="caption">Nenhum serviço agendado ou em andamento.</T> : null}
          {agenda.map((s) => {
            const atrasado = s.status === 'agendado' && s.agendado_para != null && s.agendado_para < hoje();
            return (
              <Card key={s.id} onPress={() => router.push(`/equipamentos/${s.equipamento_id}`)} className="gap-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Selo tom={s.tipo === 'calibracao' ? 'primary' : 'neutro'} texto={TIPOS_SERVICO[s.tipo]} />
                  {s.status === 'em_andamento' ? <Selo tom="warn" texto="! Em andamento" /> : null}
                  {atrasado ? <Selo tom="crit" texto="✕ Atrasado" /> : null}
                </View>
                <T v="subtitle">{s.equipamentos?.nome}</T>
                <T v="caption">{s.status === 'em_andamento' ? 'iniciado' : quando(s.agendado_para)}{s.executor ? ` · ${s.executor}` : ''}</T>
              </Card>
            );
          })}
        </View>
      ) : (
        <View className="gap-4">
          <Opcoes rotulo="Mostrar" valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'atencao', rotulo: 'Precisam de atenção' }, { valor: 'todos', rotulo: 'Todos' }]} />
          <Campo rotulo="Buscar" placeholder="Nome ou patrimônio" value={busca} onChangeText={setBusca} />
          {visiveis.length === 0 ? (
            <T v="caption">{filtro === 'atencao' ? 'Nenhum equipamento precisa de atenção.' : 'Nenhum equipamento cadastrado.'}</T>
          ) : null}
          {visiveis.map((e) => (
            <Card key={e.equipamento_id} onPress={() => router.push(`/equipamentos/${e.equipamento_id}`)} className="gap-1">
              <T v="subtitle">{e.nome}</T>
              <T v="code" className="text-secondary">{e.codigo}</T>
              <View className="flex-row flex-wrap items-center gap-2">
                <SeloSituacao situacao={e.situacao} />
                {e.criticidade === 'V' ? <Selo tom="primary" texto="Vital" /> : null}
              </View>
              {e.exige_calibracao ? <T v="caption">Calibração válida até {fmtData(e.calibracao_valida_ate)}{e.calibracao_agendada ? ` · agendada ${fmtData(e.calibracao_agendada)}` : ''}</T> : null}
              {e.periodicidade_manutencao_dias ? <T v="caption">Preventiva prevista {fmtData(e.manutencao_prevista)}{e.manutencao_agendada ? ` · agendada ${fmtData(e.manutencao_agendada)}` : ''}</T> : null}
            </Card>
          ))}
        </View>
      )}
    </Tela>
  );
}
