// Escanear: lê o código e abre a tela certa (cadastrar novo item, receber, dispensar ou consultar).
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { LeitorCodigo } from '@/components/LeitorCodigo';
import { Aviso, Botao, Card, Opcoes, Tela, T } from '@/components/ui';
import { resolverCodigo, type Resolucao } from '@/data/codigos';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

type Modo = 'dispensar' | 'cadastrar' | 'receber' | 'consultar';

const MODOS: { valor: Modo; rotulo: string; explicacao: string }[] = [
  { valor: 'dispensar', rotulo: 'Retirar', explicacao: 'Leia o código do produto ou a etiqueta do lote para abrir a dispensação.' },
  { valor: 'receber', rotulo: 'Receber', explicacao: 'Leia o código do produto para registrar a entrada de um lote.' },
  { valor: 'cadastrar', rotulo: 'Cadastrar', explicacao: 'Leia o código de barras de um produto novo para abrir o cadastro já preenchido.' },
  { valor: 'consultar', rotulo: 'Consultar', explicacao: 'Leia qualquer código para ver a ficha do item ou a rastreabilidade do lote.' },
];

export default function Escanear() {
  const params = useLocalSearchParams<{ modo?: Modo }>();
  const { lab, pode } = useSessao();
  const [modo, setModo] = useState<Modo>(params.modo ?? 'dispensar');
  const [resultado, setResultado] = useState<Resolucao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function aoLer(codigo: string) {
    if (!lab) return;
    setErro(null);
    try {
      const r = await resolverCodigo(lab.id, codigo);
      setResultado(r);
      // Caminho direto quando não há dúvida sobre o que fazer.
      if (r.tipo === 'lote') {
        if (modo === 'dispensar') return router.push({ pathname: '/dispensar', params: { item: r.itemId, lote: r.loteId } });
        if (modo === 'consultar') return router.push(`/lote/${r.loteId}` as Href);
        if (modo === 'receber') return router.push({ pathname: '/receber', params: { item: r.itemId } });
      }
      if (r.tipo === 'item' && r.ativo) {
        if (modo === 'dispensar') return router.push({ pathname: '/dispensar', params: { item: r.itemId } });
        if (modo === 'receber') return router.push({ pathname: '/receber', params: { item: r.itemId } });
        if (modo === 'consultar') return router.push(`/item/${r.itemId}` as Href);
      }
      if (r.tipo === 'desconhecido' && modo === 'cadastrar' && pode('gestor')) {
        return router.push({ pathname: '/cadastros/[tabela]/[id]', params: { tabela: 'itens', id: 'novo', codigo_barras: r.codigo } });
      }
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const explicacao = MODOS.find((m) => m.valor === modo)!.explicacao;

  return (
    <Tela titulo="Escanear" voltar>
      <Opcoes rotulo="O que você quer fazer" valor={modo} onChange={(m) => { setModo(m); setResultado(null); }} opcoes={MODOS.map((m) => ({ valor: m.valor, rotulo: m.rotulo }))} />
      <T v="caption">{explicacao}</T>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <LeitorCodigo onCodigo={aoLer} />

      {resultado?.tipo === 'item' && modo === 'cadastrar' ? (
        <Card className="gap-2">
          <Aviso tom="warn">Este código já está cadastrado: {resultado.itemNome}.</Aviso>
          <Botao titulo="Abrir a ficha do item" onPress={() => router.push(`/item/${resultado.itemId}` as Href)} />
        </Card>
      ) : null}
      {resultado?.tipo === 'item' && !resultado.ativo && modo !== 'cadastrar' ? (
        <Aviso tom="warn">{resultado.itemNome} está inativo. Reative no cadastro para movimentá-lo.</Aviso>
      ) : null}
      {resultado?.tipo === 'lote' && modo === 'cadastrar' ? (
        <Card className="gap-2">
          <T v="body">Esta é a etiqueta do lote {resultado.loteNumero} de {resultado.itemNome}.</T>
          <Botao titulo="Ver o lote" onPress={() => router.push(`/lote/${resultado.loteId}` as Href)} />
        </Card>
      ) : null}
      {resultado?.tipo === 'desconhecido' && (modo !== 'cadastrar' || !pode('gestor')) ? (
        <Card className="gap-2">
          <Aviso tom="warn">Nenhum item com o código {resultado.codigo}.</Aviso>
          {pode('gestor') ? (
            <Botao titulo="Cadastrar novo item com este código" onPress={() => router.push({ pathname: '/cadastros/[tabela]/[id]', params: { tabela: 'itens', id: 'novo', codigo_barras: resultado.codigo } })} />
          ) : <T v="caption">Peça a um gestor para cadastrar o produto.</T>}
        </Card>
      ) : null}
    </Tela>
  );
}
