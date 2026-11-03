// Movimentações: todo o livro-razão com filtros, e quem deu entrada e quem deu saída.
import { router, useFocusEffect, type Href } from 'expo-router';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, RotateCcw, SlidersHorizontal, type LucideIcon } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconButton, useCor } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Carregando, Opcoes, Selecionar, Selo, Tela, T } from '@/components/ui';
import { listarProjetos, type Opcao } from '@/data/cadastros';
import { listarMembrosLab } from '@/data/operacoes';
import { diaLocal, hoje, somarDias } from '@/domain/datas';
import { fmtData, fmtMoeda, fmtNumero, fmtQtd } from '@/domain/formato';
import type { MovTipo } from '@/domain/tipos';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

interface Mov {
  id: string; tipo: MovTipo; sentido: 'entrada' | 'saida' | 'interna'; item_id: string; item_nome: string; item_codigo: string; unidade_estoque: string;
  lote_id: string; lote_numero: string; quantidade: number; custo_unitario: number | null; local_origem: string | null; local_destino: string | null;
  projeto_codigo: string | null; finalidade: string | null; motivo: string | null; ocorrido_em: string; registrado_em: string;
  usuario_id: string; usuario_nome: string | null; estorno_de: string | null;
}

const TIPOS: { valor: MovTipo | 'todos'; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' }, { valor: 'ENTRADA', rotulo: 'Entrada' }, { valor: 'DISPENSACAO', rotulo: 'Dispensação' },
  { valor: 'DEVOLUCAO', rotulo: 'Devolução' }, { valor: 'TRANSFERENCIA', rotulo: 'Transferência' }, { valor: 'PERDA', rotulo: 'Perda' },
  { valor: 'AJUSTE_INVENTARIO', rotulo: 'Ajuste' }, { valor: 'ESTORNO', rotulo: 'Estorno' },
];
const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.rotulo])) as Record<MovTipo, string>;
const ICONE: Record<Mov['sentido'], LucideIcon> = { entrada: ArrowDownLeft, saida: ArrowUpRight, interna: ArrowLeftRight };
const PAGINA = 100;
const hora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function Movimentacoes() {
  const { lab } = useSessao();
  const cor = useCor();
  const [lista, setLista] = useState<Mov[] | null>(null);
  const [fim, setFim] = useState(false);
  const [pessoas, setPessoas] = useState<Opcao[]>([]);
  const [projetos, setProjetos] = useState<Opcao[]>([]);
  const [filtros, setFiltros] = useState(false);
  const [dias, setDias] = useState<'1' | '7' | '30' | '90'>('30');
  const [sentido, setSentido] = useState<'todas' | 'entrada' | 'saida' | 'interna'>('todas');
  const [tipo, setTipo] = useState<MovTipo | 'todos'>('todos');
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [projeto, setProjeto] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const consultar = useCallback(async (offset: number) => {
    if (!lab) return [];
    let q = supabase.from('v_movimentacoes').select('*').eq('lab_id', lab.id)
      .gte('ocorrido_em', `${somarDias(hoje(), -(Number(dias) - 1))}T00:00:00-03:00`)
      .order('ocorrido_em', { ascending: false }).range(offset, offset + PAGINA - 1);
    if (sentido !== 'todas') q = q.eq('sentido', sentido);
    if (tipo !== 'todos') q = q.eq('tipo', tipo);
    if (pessoa) q = q.eq('usuario_id', pessoa);
    if (projeto) q = q.eq('projeto_id', projeto);
    const termo = busca.trim().replace(/[%,()]/g, ' ');
    if (termo) q = q.or(`item_nome.ilike.%${termo}%,item_codigo.ilike.%${termo}%,lote_numero.ilike.%${termo}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Mov[];
  }, [lab, dias, sentido, tipo, pessoa, projeto, busca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await consultar(0);
      setLista(dados);
      setFim(dados.length < PAGINA);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [consultar]);

  useFocusEffect(useCallback(() => {
    carregar();
    if (lab) {
      listarMembrosLab(lab.id).then((ms) => setPessoas(ms.map((m) => ({ id: m.user_id, nome: m.nome || m.email })))).catch(() => {});
      listarProjetos(lab.id).then(setProjetos).catch(() => {});
    }
  }, [carregar, lab]));

  async function maisItens() {
    if (!lista) return;
    try {
      const dados = await consultar(lista.length);
      setLista([...lista, ...dados]);
      setFim(dados.length < PAGINA);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  // Quem deu entrada e quem deu saída no período filtrado.
  const porPessoa = useMemo(() => {
    const m = new Map<string, { nome: string; entradas: number; saidas: number; internas: number }>();
    for (const x of lista ?? []) {
      const r = m.get(x.usuario_id) ?? { nome: x.usuario_nome ?? 'Sem nome', entradas: 0, saidas: 0, internas: 0 };
      if (x.sentido === 'entrada') r.entradas++;
      else if (x.sentido === 'saida') r.saidas++;
      else r.internas++;
      m.set(x.usuario_id, r);
    }
    return [...m.values()].sort((a, b) => b.entradas + b.saidas - (a.entradas + a.saidas));
  }, [lista]);

  const porDia = useMemo(() => {
    const g = new Map<string, Mov[]>();
    for (const x of lista ?? []) {
      const d = diaLocal(x.ocorrido_em);
      g.set(d, [...(g.get(d) ?? []), x]);
    }
    return [...g];
  }, [lista]);

  const ativos = [sentido !== 'todas', tipo !== 'todos', !!pessoa, !!projeto].filter(Boolean).length;

  return (
    <Tela titulo="Movimentações" acao={<IconButton icon={SlidersHorizontal} label="Filtros" onPress={() => setFiltros((f) => !f)} />}>
      <T v="caption">Cada entrada, saída, transferência, perda, ajuste e estorno, com quem registrou. Registros não podem ser editados: correções aparecem como estorno.</T>
      <Campo rotulo="Buscar" placeholder="Item, código ou lote" value={busca} onChangeText={setBusca} returnKeyType="search" onSubmitEditing={carregar} />
      <Opcoes rotulo="Período" valor={dias} onChange={setDias} opcoes={[{ valor: '1', rotulo: 'Hoje' }, { valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }]} />
      <Opcoes rotulo="Sentido" valor={sentido} onChange={setSentido}
        opcoes={[{ valor: 'todas', rotulo: 'Todas' }, { valor: 'entrada', rotulo: 'Entradas' }, { valor: 'saida', rotulo: 'Saídas' }, { valor: 'interna', rotulo: 'Internas' }]} />
      {filtros ? (
        <Card className="gap-4">
          <Opcoes rotulo="Tipo" valor={tipo} onChange={setTipo} opcoes={TIPOS} />
          <Selecionar rotulo="Pessoa" valor={pessoa} onChange={setPessoa} opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
          <Selecionar rotulo="Projeto" valor={projeto} onChange={setProjeto} opcoes={projetos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
          <Botao tipo="sutil" titulo="Limpar filtros" onPress={() => { setTipo('todos'); setPessoa(null); setProjeto(null); setSentido('todas'); }} />
        </Card>
      ) : ativos ? <Selo tom="primary" texto={`${ativos} filtro${ativos > 1 ? 's' : ''} ativo${ativos > 1 ? 's' : ''}`} /> : null}
      <Botao titulo="Aplicar" onPress={carregar} carregando={carregando} />
      {erro ? <Aviso>{erro}</Aviso> : null}

      {!lista ? <Carregando /> : (
        <>
          {porPessoa.length ? (
            <Card className="gap-2">
              <T v="label">Quem registrou ({lista.length}{fim ? '' : '+'} movimentações)</T>
              {porPessoa.map((p) => (
                <View key={p.nome} className="flex-row items-center justify-between gap-2 border-t border-default pt-2">
                  <T v="body" className="flex-1">{p.nome}</T>
                  <T v="caption">↓ {p.entradas} entrada{p.entradas === 1 ? '' : 's'} · ↑ {p.saidas} saída{p.saidas === 1 ? '' : 's'}{p.internas ? ` · ${p.internas} interna${p.internas === 1 ? '' : 's'}` : ''}</T>
                </View>
              ))}
            </Card>
          ) : null}

          {lista.length === 0 ? <T v="caption">Nenhuma movimentação com esses filtros.</T> : null}
          {porDia.map(([dia, movs]) => (
            <View key={dia} className="gap-2">
              <T v="label">{dia === hoje() ? 'Hoje' : dia === somarDias(hoje(), -1) ? 'Ontem' : fmtData(dia)}</T>
              {movs.map((m) => {
                const Icone = m.tipo === 'ESTORNO' ? RotateCcw : ICONE[m.sentido];
                const sinal = m.sentido === 'entrada' ? '+' : m.sentido === 'saida' ? '−' : '';
                const valor = m.custo_unitario != null ? Number(m.quantidade) * Number(m.custo_unitario) : null;
                return (
                  <Pressable key={m.id} onPress={() => router.push(`/lote/${m.lote_id}` as Href)} accessibilityRole="button">
                    <Card className="flex-row gap-3">
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
                        <Icone size={18} color={cor(m.sentido === 'entrada' ? 'icon-positive' : m.tipo === 'PERDA' ? 'icon-danger' : 'icon-default')} />
                      </View>
                      <View className="flex-1 gap-1">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Selo tom={m.sentido === 'entrada' ? 'ok' : m.tipo === 'PERDA' ? 'crit' : m.sentido === 'saida' ? 'warn' : 'neutro'} texto={ROTULO_TIPO[m.tipo]} />
                          <T v="code">{sinal}{fmtQtd(Number(m.quantidade), m.unidade_estoque)}</T>
                        </View>
                        <T v="subtitle" numberOfLines={1}>{m.item_nome}</T>
                        <T v="caption">Lote {m.lote_numero} · {m.local_origem ?? '—'} → {m.local_destino ?? '—'}</T>
                        <T v="caption">
                          {m.sentido === 'entrada' ? 'Entrada' : m.sentido === 'saida' ? 'Saída' : 'Registro'} por <T v="caption" className="text-default">{m.usuario_nome ?? '—'}</T> às {hora(m.ocorrido_em)}
                          {m.projeto_codigo ? ` · ${m.projeto_codigo}` : ''}{valor != null ? ` · ${fmtMoeda(valor)}` : ''}
                        </T>
                        {m.motivo ? <T v="caption">Motivo: {m.motivo.replace(/_/g, ' ')}</T> : null}
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {!fim ? <Botao tipo="secundario" titulo={`Carregar mais ${fmtNumero(PAGINA)}`} onPress={maisItens} /> : null}
        </>
      )}
    </Tela>
  );
}
