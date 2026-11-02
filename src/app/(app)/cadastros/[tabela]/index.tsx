import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ordenarArvore, type NoLocal } from '@/cadastros/arvoreLocais';
import { CADASTROS, NIVEIS_LOCAL, TIPOS_ITEM, ehTabelaCadastro, type Registro, type TabelaCadastro } from '@/cadastros/config';
import { Aviso, Campo, Card, Carregando, Interruptor, Selo, Tela, T } from '@/components/ui';
import { listarRegistros } from '@/data/repositorioCadastros';
import { fmtNumero } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

const rotuloDe = (lista: { valor: string; rotulo: string }[], v: unknown) => lista.find((o) => o.valor === v)?.rotulo ?? String(v ?? '');
const CRIT: Record<string, string> = { V: 'Vital', E: 'Essencial', D: 'Desejável' };

function Linha({ tabela, r, recuo = 0 }: { tabela: TabelaCadastro; r: Registro; recuo?: number }) {
  const inativo = r.ativo === false;
  const abrir = () => router.push(`/cadastros/${tabela}/${r.id}`);
  let titulo = String(r.nome ?? '');
  let sub: string | null = null;
  const selos: { tom: 'ok' | 'warn' | 'crit' | 'primary' | 'neutro'; texto: string }[] = [];

  if (tabela === 'itens') {
    sub = `${r.codigo} · ${rotuloDe(TIPOS_ITEM, r.tipo)} · estoque em ${r.unidade_estoque}`;
    if (r.criticidade === 'V') selos.push({ tom: 'primary', texto: 'Vital' });
    else selos.push({ tom: 'neutro', texto: CRIT[String(r.criticidade)] });
    if (r.controlado) selos.push({ tom: 'warn', texto: 'Controlado' });
    if (r.pr_manual != null || r.es_manual != null) selos.push({ tom: 'neutro', texto: 'Reposição manual' });
  } else if (tabela === 'locais') {
    const faixa = r.temp_min != null ? ` · ${fmtNumero(Number(r.temp_min))} a ${fmtNumero(Number(r.temp_max))} °C` : '';
    sub = `${rotuloDe(NIVEIS_LOCAL, r.nivel)}${faixa}`;
    if (r.conforme === false) selos.push({ tom: 'crit', texto: '✕ Não conforme' });
  } else if (tabela === 'projetos') {
    titulo = `${r.codigo} · ${r.nome}`;
    sub = (r.fonte_recurso as string) ?? null;
    if (r.exige_aprovacao) selos.push({ tom: 'neutro', texto: 'Exige aprovação' });
  } else if (tabela === 'fornecedores') {
    sub = [r.cnpj, r.lead_time_padrao_dias != null ? `lead time ${fmtNumero(Number(r.lead_time_padrao_dias))} dias` : null].filter(Boolean).join(' · ') || null;
  }
  if (inativo) selos.push({ tom: 'neutro', texto: 'Inativo' });

  return (
    <View style={{ marginLeft: recuo * 16 }}>
      <Card onPress={abrir} className={`gap-1 ${inativo ? 'opacity-60' : ''}`}>
        <T v="subtitle" numberOfLines={2}>{titulo}</T>
        {sub ? <T v="caption">{sub}</T> : null}
        {selos.length ? (
          <View className="flex-row flex-wrap gap-2">{selos.map((s) => <Selo key={s.texto} tom={s.tom} texto={s.texto} />)}</View>
        ) : null}
      </Card>
    </View>
  );
}

export default function ListaCadastro() {
  const { tabela } = useLocalSearchParams<{ tabela: string }>();
  const { lab, pode } = useSessao();
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valida = ehTabelaCadastro(tabela ?? '');
  const def = valida ? CADASTROS[tabela as TabelaCadastro] : null;

  useFocusEffect(
    useCallback(() => {
      if (!lab || !def) return;
      listarRegistros(lab.id, def.tabela).then(setRegistros).catch((e) => setErro(mensagemErro(e)));
    }, [lab, def]),
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (registros ?? []).filter(
      (r) => (inativos || r.ativo !== false) && (!q || `${r.nome ?? ''} ${r.codigo ?? ''}`.toLowerCase().includes(q)),
    );
  }, [registros, busca, inativos]);

  if (!def) return <Tela titulo="Cadastro" voltar><Aviso>Cadastro desconhecido.</Aviso></Tela>;
  if (!registros && !erro) return <Carregando />;

  // Locais aparecem como árvore; com busca, a árvore vira lista simples.
  const arvore = def.tabela === 'locais' && !busca.trim() ? ordenarArvore(visiveis as unknown as (NoLocal & Registro)[]) : null;

  return (
    <Tela
      titulo={def.titulo}
      voltar
      acao={
        pode('gestor') ? (
          <Pressable onPress={() => router.push(`/cadastros/${def.tabela}/novo`)} hitSlop={12} accessibilityRole="button"
            accessibilityLabel={`Novo ${def.singular}`} className="h-12 w-12 items-center justify-center rounded-md bg-primary">
            <Plus size={24} color="#ffffff" />
          </Pressable>
        ) : undefined
      }
    >
      <T v="caption">{def.descricao}</T>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Campo rotulo="Buscar" placeholder={def.tabela === 'itens' || def.tabela === 'projetos' ? 'Nome ou código' : 'Nome'} value={busca} onChangeText={setBusca} />
      <Interruptor rotulo="Mostrar inativos" valor={inativos} onChange={setInativos} />
      <T v="caption">{visiveis.length} de {registros?.length ?? 0}</T>
      {visiveis.length === 0 ? <T v="caption">Nenhum registro.{pode('gestor') ? ' Toque em + para cadastrar.' : ''}</T> : null}
      {arvore
        ? arvore.map(({ local, profundidade }) => <Linha key={local.id} tabela="locais" r={local} recuo={Math.min(profundidade, 4)} />)
        : visiveis.map((r) => <Linha key={String(r.id)} tabela={def.tabela} r={r} />)}
    </Tela>
  );
}
