// Compras: sugestões calculadas pela reposição e pedidos por etapa.
import { router, useFocusEffect, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '@/components/sds';
import { SeloEtapa } from '@/components/SeloEtapa';
import { Aviso, Botao, Campo, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { listarPedidos, sugestoesDeCompra, type Pedido } from '@/data/compras';
import { carregarEstoque, type ItemEstoque } from '@/data/servicoKpis';
import { diasEntre, hoje } from '@/domain/datas';
import { fmtData, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

type Aba = 'sugestoes' | 'abertos' | 'concluidos';
const ABERTOS = ['solicitado', 'aprovado', 'enviado', 'recebido', 'conferido'];

export default function Compras() {
  const { lab, pode } = useSessao();
  const [estoque, setEstoque] = useState<ItemEstoque[] | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [aba, setAba] = useState<Aba>('sugestoes');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lab) return;
    Promise.all([carregarEstoque(lab.id), listarPedidos(lab.id)])
      .then(([e, p]) => { setEstoque(e); setPedidos(p); })
      .catch((x) => setErro(mensagemErro(x)));
  }, [lab]));

  const sugestoes = useMemo(() => (estoque ? sugestoesDeCompra(estoque) : []), [estoque]);
  const filtrar = (p: Pedido) => !busca.trim() || `${p.numero} ${p.fornecedores?.nome ?? ''} ${p.pedido_linhas.map((l) => l.itens?.nome).join(' ')}`.toLowerCase().includes(busca.toLowerCase());
  const abertos = pedidos.filter((p) => ABERTOS.includes(p.status)).filter(filtrar);
  const concluidos = pedidos.filter((p) => !ABERTOS.includes(p.status)).filter(filtrar);

  if (!estoque) return erro ? <Tela titulo="Compras" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;

  return (
    <Tela titulo="Compras" voltar acao={pode('tecnico', 'gestor') ? <IconButton icon={Plus} variant="primary" label="Novo pedido" onPress={() => router.push('/compras/novo' as Href)} /> : undefined}>
      <T v="caption">O sistema sugere o que comprar pelo ponto de reposição; você transforma a sugestão em pedido e acompanha cada etapa até a liberação do lote.</T>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Opcoes rotulo="Ver" valor={aba} onChange={setAba} opcoes={[
        { valor: 'sugestoes', rotulo: `Sugestões (${sugestoes.length})` }, { valor: 'abertos', rotulo: `Em andamento (${abertos.length})` }, { valor: 'concluidos', rotulo: 'Concluídos' },
      ]} />

      {aba === 'sugestoes' ? (
        <View className="gap-4">
          {sugestoes.length === 0 ? <Aviso tom="ok">Nenhum item precisa de compra agora.</Aviso> : (
            <Botao titulo={`Criar pedido com as ${sugestoes.length} sugestões`} onPress={() => router.push({ pathname: '/compras/novo', params: { sugestoes: '1' } })} />
          )}
          {sugestoes.map((s) => (
            <Card key={s.item.itemId} onPress={() => router.push({ pathname: '/compras/novo', params: { item: s.item.itemId } })} className="gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Selo tom={s.item.disponivel <= 0 ? 'crit' : 'warn'} texto={s.motivo} />
                {s.item.criticidade === 'V' ? <Selo tom="primary" texto="Vital" /> : null}
              </View>
              <T v="subtitle">{s.item.nome}</T>
              <T v="caption">
                Comprar {s.quantidadeCompra} {s.item.unidadeCompra} ({fmtQtd(s.quantidadeCompra * s.item.fator, s.item.unidade)}) · posição {fmtQtd(s.item.posicaoProjetada, s.item.unidade)}
                {s.item.reposicao.prEmUso != null ? ` · ponto de reposição ${fmtQtd(s.item.reposicao.prEmUso, s.item.unidade)}` : ''}
              </T>
              {s.item.leadTime ? <T v="caption">Lead time {Math.round(s.item.leadTime.media)} dias ({s.item.leadTime.origem === 'item' ? 'histórico de pedidos' : 'informado no cadastro'})</T> : null}
            </Card>
          ))}
        </View>
      ) : (
        <View className="gap-4">
          <Campo rotulo="Buscar" placeholder="Número, fornecedor ou item" value={busca} onChangeText={setBusca} />
          {(aba === 'abertos' ? abertos : concluidos).map((p) => (
            <Card key={p.id} onPress={() => router.push(`/compras/${p.id}` as Href)} className="gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <T v="subtitle">Pedido nº {p.numero}</T>
                <SeloEtapa p={p} />
              </View>
              <T v="caption">{p.fornecedores?.nome ?? 'Sem fornecedor'} · {p.pedido_linhas.length} ite{p.pedido_linhas.length === 1 ? 'm' : 'ns'}{p.projetos ? ` · ${p.projetos.codigo}` : ''}</T>
              <T v="caption">Solicitado em {fmtData(p.solicitado_em.slice(0, 10))}{p.previsto_para ? ` · previsto ${fmtData(p.previsto_para)}${p.status === 'enviado' ? ` (${diasEntre(hoje(), p.previsto_para)} dias)` : ''}` : ''}</T>
            </Card>
          ))}
          {(aba === 'abertos' ? abertos : concluidos).length === 0 ? <T v="caption">Nenhum pedido.</T> : null}
        </View>
      )}
    </Tela>
  );
}
