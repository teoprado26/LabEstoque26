// Inventários: lista e abertura de nova contagem (cíclica por local/categoria, ou geral).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Aviso, Botao, Card, Carregando, Opcoes, Selecionar, Selo, Tela, T } from '@/components/ui';
import { listarReferencias, type OpcaoRef } from '@/data/repositorioCadastros';
import { iniciarInventario } from '@/data/operacoes';
import { fmtDataHora } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

interface Inv { id: string; tipo: 'ciclico' | 'geral'; status: 'aberto' | 'em_aprovacao' | 'encerrado'; aberto_em: string; encerrado_em: string | null; escopo: { local_id?: string | null; categoria_id?: string | null } }

export default function Inventarios() {
  const { lab, pode } = useSessao();
  const [lista, setLista] = useState<Inv[] | null>(null);
  const [contagens, setContagens] = useState<Record<string, { total: number; pendentes: number }>>({});
  const [locais, setLocais] = useState<OpcaoRef[]>([]);
  const [categorias, setCategorias] = useState<OpcaoRef[]>([]);
  const [tipo, setTipo] = useState<'ciclico' | 'geral'>('ciclico');
  const [local, setLocal] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!lab) return;
    const [inv, cont, l, c] = await Promise.all([
      supabase.from('inventarios').select('*').eq('lab_id', lab.id).order('aberto_em', { ascending: false }).limit(30),
      supabase.from('v_inventario_contagens').select('inventario_id, status').eq('lab_id', lab.id),
      listarReferencias(lab.id, 'locais'),
      listarReferencias(lab.id, 'categorias'),
    ]);
    if (inv.error) return setErro(inv.error.message);
    const resumo: Record<string, { total: number; pendentes: number }> = {};
    for (const x of cont.data ?? []) {
      const r = (resumo[x.inventario_id] ??= { total: 0, pendentes: 0 });
      r.total++;
      if (x.status === 'pendente' || x.status === 'contada') r.pendentes++;
    }
    setLista(inv.data as Inv[]);
    setContagens(resumo);
    setLocais(l);
    setCategorias(c);
  }, [lab]);

  useFocusEffect(useCallback(() => { carregar().catch((e) => setErro(mensagemErro(e))); }, [carregar]));

  async function abrir() {
    if (!lab) return;
    setEnviando(true);
    setErro(null);
    try {
      const id = await iniciarInventario(lab.id, tipo, tipo === 'ciclico' ? local : null, tipo === 'ciclico' ? categoria : null);
      router.push(`/inventario/${id}`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (!lista) return erro ? <Tela titulo="Inventário" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;
  const nome = (xs: OpcaoRef[], id?: string | null) => (id ? xs.find((x) => x.id === id)?.nome ?? '—' : null);

  return (
    <Tela titulo="Inventário" voltar>
      <T v="caption">Contagem às cegas: quem conta não vê o saldo do sistema. A divergência é calculada depois, e o ajuste só entra no estoque com aprovação do gestor.</T>
      {erro ? <Aviso>{erro}</Aviso> : null}
      {pode('gestor') ? (
        <Card className="gap-4">
          <T v="subtitle">Nova contagem</T>
          <Opcoes rotulo="Tipo" valor={tipo} onChange={setTipo} opcoes={[{ valor: 'ciclico', rotulo: 'Cíclica (por local ou categoria)' }, { valor: 'geral', rotulo: 'Geral (tudo)' }]} />
          {tipo === 'ciclico' ? (
            <>
              <Selecionar rotulo="Local (inclui os locais dentro dele)" valor={local} onChange={setLocal} opcoes={locais.filter((l) => l.ativo !== false).map((l) => ({ valor: l.id, rotulo: l.nome }))} />
              <Selecionar rotulo="Categoria" valor={categoria} onChange={setCategoria} opcoes={categorias.filter((c) => c.ativo !== false).map((c) => ({ valor: c.id, rotulo: c.nome }))} />
            </>
          ) : null}
          <Botao titulo="Abrir contagem" onPress={abrir} carregando={enviando} desabilitado={tipo === 'ciclico' && !local && !categoria} />
        </Card>
      ) : null}
      <T v="title">Contagens</T>
      {lista.length === 0 ? <T v="caption">Nenhum inventário ainda.</T> : null}
      {lista.map((i) => {
        const r = contagens[i.id] ?? { total: 0, pendentes: 0 };
        const escopo = [nome(locais, i.escopo?.local_id), nome(categorias, i.escopo?.categoria_id)].filter(Boolean).join(' · ');
        return (
          <Card key={i.id} onPress={() => router.push(`/inventario/${i.id}`)} className="gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <T v="subtitle">{i.tipo === 'geral' ? 'Inventário geral' : 'Contagem cíclica'}</T>
              <Selo tom={i.status === 'encerrado' ? 'neutro' : 'warn'} texto={i.status === 'encerrado' ? 'Encerrado' : 'Aberto'} />
            </View>
            {escopo ? <T v="caption">{escopo}</T> : null}
            <T v="caption">Aberto em {fmtDataHora(i.aberto_em)} · {r.total} posições · {r.pendentes} a contar ou decidir</T>
          </Card>
        );
      })}
    </Tela>
  );
}
