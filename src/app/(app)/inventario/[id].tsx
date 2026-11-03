// Contagem às cegas de um inventário e decisão dos ajustes pelo gestor.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ButtonGroup } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { aprovarAjuste, encerrarInventario, registrarContagem } from '@/data/operacoes';
import { lerNumero } from '@/domain/entrada';
import { fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

interface Contagem {
  id: string; status: 'pendente' | 'contada' | 'aprovada' | 'rejeitada';
  item_nome: string; item_codigo: string; unidade_estoque: string; lote_numero: string; local_nome: string;
  quantidade_contada: number | null; saldo_sistema: number | null; divergencia: number | null; dentro_tolerancia: boolean | null; justificativa: string | null;
}

export default function Inventario() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pode } = useSessao();
  const [lista, setLista] = useState<Contagem[] | null>(null);
  const [status, setStatus] = useState<string>('aberto');
  const [filtro, setFiltro] = useState<'contar' | 'decidir' | 'todas'>('contar');
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [just, setJust] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from('v_inventario_contagens_detalhe').select('*').eq('inventario_id', id!).order('local_nome').order('item_nome'),
      supabase.from('inventarios').select('status').eq('id', id!).maybeSingle(),
    ]);
    if (c.error) return setErro(c.error.message);
    setLista(c.data as Contagem[]);
    setStatus(i.data?.status ?? 'aberto');
  }, [id]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const agir = async (fn: () => Promise<void>, msg: string) => {
    setErro(null);
    setOk(null);
    try {
      await fn();
      setOk(msg);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  if (!lista) return erro ? <Tela titulo="Contagem" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const aberto = status !== 'encerrado';
  const visiveis = lista.filter((c) => filtro === 'todas' || (filtro === 'contar' ? c.status === 'pendente' : c.status === 'contada'));
  const pendentes = lista.filter((c) => c.status === 'pendente').length;
  const aDecidir = lista.filter((c) => c.status === 'contada').length;
  const dentro = lista.filter((c) => c.dentro_tolerancia).length;
  const contadas = lista.filter((c) => c.status !== 'pendente').length;

  return (
    <Tela titulo="Contagem" voltar>
      <View className="flex-row flex-wrap gap-2">
        <Selo tom={aberto ? 'warn' : 'neutro'} texto={aberto ? 'Aberto' : 'Encerrado'} />
        <T v="caption">{lista.length} posições · {pendentes} a contar · {aDecidir} a decidir{contadas ? ` · ${dentro} de ${contadas} dentro da tolerância` : ''}</T>
      </View>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Opcoes rotulo="Mostrar" valor={filtro} onChange={setFiltro}
        opcoes={[{ valor: 'contar', rotulo: `A contar (${pendentes})` }, { valor: 'decidir', rotulo: `A decidir (${aDecidir})` }, { valor: 'todas', rotulo: 'Todas' }]} />
      {visiveis.length === 0 ? <T v="caption">Nada aqui.</T> : null}

      {visiveis.map((c) => (
        <Card key={c.id} className="gap-2">
          <T v="subtitle">{c.item_nome}</T>
          <T v="caption">{c.item_codigo} · lote {c.lote_numero} · {c.local_nome}</T>
          {c.status === 'pendente' ? (
            aberto && pode('tecnico', 'gestor') ? (
              <>
                <Campo rotulo={`Quantidade contada (${c.unidade_estoque})`} keyboardType="decimal-pad" value={qtds[c.id] ?? ''}
                  onChangeText={(t) => setQtds((q) => ({ ...q, [c.id]: t }))} ajuda="Conte o que está fisicamente no local. O saldo do sistema só aparece depois." />
                <Botao titulo="Registrar contagem" desabilitado={lerNumero(qtds[c.id] ?? '') == null}
                  onPress={() => agir(() => registrarContagem(c.id, lerNumero(qtds[c.id])!), `${c.item_nome}: contagem registrada.`)} />
              </>
            ) : <Selo tom="neutro" texto="Não contada" />
          ) : (
            <>
              <View className="flex-row flex-wrap items-center gap-2">
                <Selo tom={c.dentro_tolerancia ? 'ok' : 'crit'} texto={c.dentro_tolerancia ? '✓ Dentro da tolerância' : '✕ Fora da tolerância'} />
                {c.status === 'aprovada' ? <Selo tom="neutro" texto="Ajuste aprovado" /> : c.status === 'rejeitada' ? <Selo tom="neutro" texto="Ajuste rejeitado" /> : null}
              </View>
              <T v="caption">
                Contado {fmtQtd(Number(c.quantidade_contada), c.unidade_estoque)} · sistema {fmtQtd(Number(c.saldo_sistema), c.unidade_estoque)} · divergência {Number(c.divergencia) > 0 ? '+' : ''}{fmtQtd(Number(c.divergencia), c.unidade_estoque)}
              </T>
              {c.justificativa ? <T v="caption">Justificativa: {c.justificativa}</T> : null}
              {c.status === 'contada' && aberto && pode('gestor') ? (
                <>
                  <Campo rotulo="Justificativa" value={just[c.id] ?? ''} onChangeText={(t) => setJust((j) => ({ ...j, [c.id]: t }))}
                    ajuda={Number(c.divergencia) === 0 ? 'Sem divergência: aprovar não gera movimentação.' : 'Aprovar lança um ajuste de inventário no livro-razão.'} />
                  <ButtonGroup>
                    <Botao titulo="Aprovar" desabilitado={!just[c.id]?.trim()} onPress={() => agir(() => aprovarAjuste(c.id, true, just[c.id].trim()), 'Ajuste aprovado.')} />
                    <Botao tipo="secundario" titulo="Rejeitar" desabilitado={!just[c.id]?.trim()} onPress={() => agir(() => aprovarAjuste(c.id, false, just[c.id].trim()), 'Ajuste rejeitado.')} />
                  </ButtonGroup>
                </>
              ) : null}
            </>
          )}
        </Card>
      ))}

      {aberto && pode('gestor') ? (
        <Botao tipo="secundario" titulo="Encerrar inventário" desabilitado={pendentes + aDecidir > 0}
          onPress={() => agir(() => encerrarInventario(id!), 'Inventário encerrado.')} />
      ) : null}
    </Tela>
  );
}
