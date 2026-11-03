// Painel: primeiro o que precisa de ação (alertas), depois os indicadores explicados.
import { router, useFocusEffect, type Href } from 'expo-router';
import { CalendarClock, ClipboardList, PackageSearch, RefreshCw, ShoppingCart, Wrench, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { KpiCard } from '@/components/KpiCard';
import { SeloSituacao } from '@/components/SeloSituacao';
import { IconButton, useCor } from '@/components/sds';
import { Aviso, Botao, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { carregarAlertas, type Alertas } from '@/data/alertas';
import { carregarPainel, ultimosDias, type Painel } from '@/data/servicoKpis';
import { SITUACOES, situacaoValida } from '@/domain/equipamentos';
import { fmtData, fmtDataHora, fmtMoeda, fmtPct, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

const PERIODOS = [
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: '180', rotulo: '180 dias' },
] as const;

function Resumo({ Icone, numero, rotulo, tom }: { Icone: LucideIcon; numero: number; rotulo: string; tom: 'crit' | 'warn' | 'ok' }) {
  const cor = useCor();
  const c = numero === 0 ? cor('icon-positive') : tom === 'crit' ? cor('icon-danger') : cor('icon-warning');
  return (
    <View className="min-w-[45%] flex-1">
      <Card className="gap-1">
        <Icone size={20} color={c} />
        <T v="kpi">{numero}</T>
        <T v="caption">{rotulo}</T>
      </Card>
    </View>
  );
}

/** Grupo de alertas: título, explicação curta e as primeiras linhas; "Ver todos" expande. */
function Grupo<T>({ Icone, titulo, explicacao, itens, vazio, render, chave }: {
  Icone: LucideIcon; titulo: string; explicacao: string; itens: T[]; vazio: string; render: (x: T) => ReactNode; chave: (x: T) => string;
}) {
  const cor = useCor();
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? itens : itens.slice(0, 3);
  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icone size={20} color={cor('icon-default')} />
        <T v="subtitle" className="flex-1">{titulo}</T>
        {itens.length ? <Selo tom={itens.length ? 'warn' : 'ok'} texto={String(itens.length)} /> : <Selo tom="ok" texto="✓ Em dia" />}
      </View>
      <T v="caption">{explicacao}</T>
      {itens.length === 0 ? <T v="caption">{vazio}</T> : null}
      {visiveis.map((x) => <View key={chave(x)} className="border-t border-default pt-3">{render(x)}</View>)}
      {itens.length > 3 ? <Botao tipo="sutil" titulo={todos ? 'Mostrar menos' : `Ver todos (${itens.length})`} onPress={() => setTodos((t) => !t)} /> : null}
    </Card>
  );
}

function Linha({ rota, children }: { rota: string; children: ReactNode }) {
  return (
    <Pressable onPress={() => router.push(rota as Href)} accessibilityRole="button" className="gap-1 rounded-md active:bg-default-hover">
      {children}
    </Pressable>
  );
}

export default function PainelTela() {
  const { lab } = useSessao();
  const [dias, setDias] = useState<'30' | '90' | '180'>('30');
  const [painel, setPainel] = useState<Painel | null>(null);
  const [alertas, setAlertas] = useState<Alertas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback(async () => {
    if (!lab) return;
    setCarregando(true);
    setErro(null);
    try {
      const p = await carregarPainel(lab.id, ultimosDias(Number(dias)));
      setPainel(p);
      setAlertas(await carregarAlertas(lab.id, p.estoque));
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [lab, dias]);

  useFocusEffect(useCallback(() => { atualizar(); }, [atualizar]));

  if (!painel && !erro) return <Carregando />;
  const a = painel?.atual ?? {};
  const ant = painel?.anterior ?? {};
  const al = alertas;
  const vencendo = al ? [...al.vencidos, ...al.vencendo30] : [];
  const pendencias = al ? [...al.quarentena, ...al.devolucoes, ...al.requisicoes] : [];

  return (
    <Tela titulo="Painel" acao={<IconButton icon={RefreshCw} label="Atualizar" onPress={atualizar} />}>
      <View className="gap-1">
        <T v="caption">{lab?.nome}{painel ? ` · atualizado em ${fmtDataHora(painel.atualizadoEm)}` : ''}{carregando ? ' · atualizando…' : ''}</T>
        {a.K12?.valor != null ? <T v="subtitle">Valor em estoque: {fmtMoeda(a.K12.valor)}</T> : null}
      </View>
      {erro ? <Aviso>{erro}</Aviso> : null}

      {al ? (
        <>
          <View className="flex-row flex-wrap gap-4">
            <Resumo Icone={ShoppingCart} numero={al.compras.length} rotulo="itens para comprar" tom="warn" />
            <Resumo Icone={CalendarClock} numero={vencendo.length} rotulo="lotes vencidos ou vencendo em 30 dias" tom="crit" />
            <Resumo Icone={Wrench} numero={al.equipamentos.length} rotulo="equipamentos pedem manutenção ou calibração" tom="warn" />
            <Resumo Icone={ClipboardList} numero={pendencias.length} rotulo="pendências (quarentena, devoluções, requisições)" tom="warn" />
          </View>

          <T v="title">Precisa de atenção</T>

          <Grupo
            Icone={CalendarClock}
            titulo="Vencimentos"
            explicacao="Lotes com saldo que vencem nos próximos 30 dias (ou já venceram). Use esses primeiro: a dispensação já sugere o lote que vence antes (FEFO)."
            itens={vencendo}
            vazio="Nenhum lote vence nos próximos 30 dias."
            chave={(v) => v.loteId}
            render={(v) => (
              <Linha rota={`/lote/${v.loteId}`}>
                <View className="flex-row flex-wrap items-center gap-2">
                  <Selo tom={v.dias < 0 ? 'crit' : v.dias <= 7 ? 'crit' : 'warn'} texto={v.dias < 0 ? `✕ Venceu em ${fmtData(v.validade)}` : v.dias === 0 ? '! Vence hoje' : `! Vence em ${v.dias} dia${v.dias === 1 ? '' : 's'}`} />
                </View>
                <T v="subtitle">{v.item}</T>
                <T v="caption">Lote {v.lote} · {fmtQtd(v.quantidade, v.unidade)}{v.valor != null ? ` · ${fmtMoeda(v.valor)}` : ''}</T>
              </Linha>
            )}
          />
          {al.vencendo90.length ? (
            <T v="caption">Mais {al.vencendo90.length} lote{al.vencendo90.length === 1 ? '' : 's'} vence{al.vencendo90.length === 1 ? '' : 'm'} entre 31 e 90 dias. Valor em risco em 90 dias: {fmtMoeda(a.K15?.extra?.h90 ?? 0)}.</T>
          ) : null}

          <Grupo
            Icone={ShoppingCart}
            titulo="Próximas compras"
            explicacao="Itens cuja posição (disponível + pedidos abertos) chegou ao ponto de reposição, ou que estão sem disponível. A quantidade sugerida já considera o múltiplo de embalagem e a validade."
            itens={al.compras}
            vazio="Nenhum item abaixo do ponto de reposição."
            chave={(c) => c.itemId}
            render={(c) => (
              <Linha rota={`/item/${c.itemId}`}>
                <View className="flex-row flex-wrap items-center gap-2">
                  {c.semDisponivel ? <Selo tom="crit" texto="✕ Sem disponível" /> : <Selo tom="warn" texto="! Abaixo do ponto de reposição" />}
                  {c.criticidade === 'V' ? <Selo tom="primary" texto="Vital" /> : null}
                </View>
                <T v="subtitle">{c.item}</T>
                <T v="caption">
                  Posição {fmtQtd(c.posicao, c.unidade)}
                  {c.pontoReposicao != null ? ` · repor em ${fmtQtd(c.pontoReposicao, c.unidade)}` : ' · sem ponto de reposição definido'}
                  {c.sugerida ? ` · comprar ${fmtQtd(c.sugerida, c.unidade)}` : ''}
                </T>
              </Linha>
            )}
          />

          <Grupo
            Icone={Wrench}
            titulo="Manutenção e calibração"
            explicacao="Equipamentos com calibração vencida, reprovada ou a vencer, preventiva atrasada ou em manutenção. Só alertamos: nada é bloqueado automaticamente."
            itens={al.equipamentos}
            vazio="Todos os equipamentos estão em dia."
            chave={(e) => e.equipamento_id}
            render={(e) => (
              <Linha rota={`/equipamentos/${e.equipamento_id}`}>
                <SeloSituacao situacao={e.situacao} />
                <T v="subtitle">{e.nome}</T>
                <T v="caption">{situacaoValida(e.situacao) ? SITUACOES[e.situacao].acao : ''}</T>
              </Linha>
            )}
          />

          <Grupo
            Icone={PackageSearch}
            titulo="Pendências de liberação e atendimento"
            explicacao="Lotes em quarentena aguardando conferência, devoluções aguardando avaliação do gestor e requisições ainda não atendidas."
            itens={pendencias}
            vazio="Nada aguardando."
            chave={(p) => p.id}
            render={(p) => (
              <Linha rota={p.rota}>
                <T v="subtitle">{p.titulo}</T>
                <T v="caption">{p.detalhe}</T>
              </Linha>
            )}
          />
        </>
      ) : null}

      {painel ? (
        <View className="gap-4">
          <T v="title">Indicadores</T>
          <T v="caption">
            Cada card mostra o valor do período, a meta e se está ✓ na meta, ! em atenção ou ✕ fora da meta. "Dados insuficientes" aparece quando ainda não há registros para um cálculo confiável. Toque no ⓘ para ver a fórmula.
          </T>
          <Opcoes rotulo="Período" valor={dias} opcoes={[...PERIODOS]} onChange={setDias} />
          <T v="caption">De {fmtData(painel.periodo.de)} a {fmtData(painel.periodo.ate)}, comparado ao período anterior de mesma duração.</T>

          <T v="subtitle">Disponibilidade e atendimento</T>
          <KpiCard r={a.K01} anterior={ant.K01} detalhe={`Itens vitais: ${a.K01.extra?.vitais == null ? 'dados insuficientes' : fmtPct(a.K01.extra.vitais)} (meta ≥ 98%).`} />
          <KpiCard r={a.K02} anterior={ant.K02} />
          <KpiCard r={a.K04} anterior={ant.K04} />
          <KpiCard r={a.K03} anterior={ant.K03} />

          <T v="subtitle">Reposição</T>
          <KpiCard r={a.K09} detalhe={a.K09.extra ? `${a.K09.extra.vitais} vitais · ${a.K09.extra.semParametro} itens ainda sem ponto de reposição.` : undefined} />

          <T v="subtitle">Perdas e validade</T>
          <KpiCard r={a.K13} anterior={ant.K13} />
          <KpiCard r={a.K15} rotulo="Valor em risco de vencimento (90 dias)" detalhe={a.K15.extra ? `Em 30 dias: ${fmtMoeda(a.K15.extra.h30 ?? 0)} · em 60 dias: ${fmtMoeda(a.K15.extra.h60 ?? 0)}.` : undefined} />
          <KpiCard r={a.K14} anterior={ant.K14} />

          <T v="subtitle">Confiabilidade</T>
          <KpiCard r={a.K16} anterior={ant.K16} />

          <T v="caption">Entregas no prazo, lead time e ocupação entram com os módulos de compras (Fase 2) e de armazenamento (Fase 3).</T>
        </View>
      ) : null}
    </Tela>
  );
}
