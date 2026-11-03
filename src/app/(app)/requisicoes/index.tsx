// Requisições internas: lista por situação e criação de nova requisição.
import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '@/components/sds';
import { Aviso, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { fmtDataHora } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import { STATUS_REQ } from '@/domain/requisicoes';

interface Req { id: string; numero: number; status: string; finalidade: string; criada_em: string; solicitante_id: string; projetos: { codigo: string } | null; requisicao_linhas: { id: string }[] }

export default function Requisicoes() {
  const { lab, sessao } = useSessao();
  const [lista, setLista] = useState<Req[] | null>(null);
  const [filtro, setFiltro] = useState<'abertas' | 'minhas' | 'todas'>('abertas');
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!lab) return;
    const { data, error } = await supabase.from('requisicoes').select('id, numero, status, finalidade, criada_em, solicitante_id, projetos ( codigo ), requisicao_linhas ( id )')
      .eq('lab_id', lab.id).order('criada_em', { ascending: false }).limit(100);
    if (error) setErro(error.message);
    else setLista(data as unknown as Req[]);
  }, [lab]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  if (!lista) return erro ? <Tela titulo="Requisições" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const visiveis = lista.filter((r) =>
    filtro === 'todas' ? true : filtro === 'minhas' ? r.solicitante_id === sessao?.user.id : ['pendente_aprovacao', 'aprovada'].includes(r.status));

  return (
    <Tela titulo="Requisições" voltar acao={<IconButton icon={Plus} variant="primary" label="Nova requisição" onPress={() => router.push('/requisicoes/nova')} />}>
      <T v="caption">Pedido interno de material para um projeto. Pode exigir aprovação do coordenador; o técnico atende pela dispensação, que sugere o lote por FEFO.</T>
      <Opcoes rotulo="Mostrar" valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'abertas', rotulo: 'Em aberto' }, { valor: 'minhas', rotulo: 'Minhas' }, { valor: 'todas', rotulo: 'Todas' }]} />
      {visiveis.length === 0 ? <T v="caption">Nenhuma requisição.</T> : null}
      {visiveis.map((r) => (
        <Card key={r.id} onPress={() => router.push(`/requisicoes/${r.id}`)} className="gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <T v="subtitle">Nº {r.numero}{r.projetos ? ` · ${r.projetos.codigo}` : ''}</T>
            <Selo tom={STATUS_REQ[r.status]?.tom ?? 'neutro'} texto={STATUS_REQ[r.status]?.rotulo ?? r.status} />
          </View>
          <T v="caption">{r.finalidade} · {r.requisicao_linhas.length} ite{r.requisicao_linhas.length === 1 ? 'm' : 'ns'} · {fmtDataHora(r.criada_em)}</T>
        </Card>
      ))}
    </Tela>
  );
}
