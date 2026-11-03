// Mural da equipe: comunicados e tarefas coletivas, com conclusão e comentários.
import { MessageSquare } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  TAGS_MURAL, arquivarAtividade, comentarAtividade, comentariosDaAtividade, concluirAtividade, listarMural, publicarAtividade,
  type Atividade, type Comentario, type TagMural,
} from '@/data/mural';
import { fmtDataHora } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';
import { Skeleton, useCor } from './sds';
import { Aviso, Botao, Campo, Card, Opcoes, Selo, T } from './ui';

const TOM_TAG: Record<TagMural, 'warn' | 'crit' | 'primary' | 'neutro' | 'ok'> = { Rotina: 'neutro', Assepsia: 'ok', Calibração: 'primary', Amostras: 'primary', Alerta: 'crit' };

function Linha({ a, labId, podeEscrever, aoMudar }: { a: Atividade; labId: string; podeEscrever: boolean; aoMudar: () => void }) {
  const { sessao, pode } = useSessao();
  const cor = useCor();
  const [aberto, setAberto] = useState(false);
  const [coms, setComs] = useState<Comentario[] | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const abrir = async () => {
    setAberto((x) => !x);
    if (!coms) setComs(await comentariosDaAtividade(a.id).catch(() => []));
  };
  const agir = async (fn: () => Promise<unknown>) => {
    setErro(null);
    try {
      await fn();
      aoMudar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  return (
    <View className="gap-2 border-t border-default pt-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Selo tom={TOM_TAG[a.tag]} texto={a.tag} />
        <Selo tom={a.realizada_em ? 'ok' : 'warn'} texto={a.realizada_em ? '✓ Concluída' : 'Pendente'} />
      </View>
      <T v="subtitle">{a.titulo}</T>
      <T v="caption">Por {a.autor_nome} · {fmtDataHora(a.criado_em)}</T>
      {a.descricao ? <T v="body">{a.descricao}</T> : null}
      {a.realizada_em ? <T v="caption">Concluída por {a.realizada_por_nome} em {fmtDataHora(a.realizada_em)}</T> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <Pressable onPress={abrir} accessibilityRole="button" className="min-h-10 flex-row items-center gap-2 rounded-md px-2 active:bg-default-hover">
          <MessageSquare size={16} color={cor('icon-secondary')} />
          <T v="caption">{a.comentarios ? `${a.comentarios} comentário${a.comentarios === 1 ? '' : 's'}` : 'Comentar'}</T>
        </Pressable>
        {podeEscrever ? (
          <View className="flex-1">
            <Botao tipo="sutil" titulo={a.realizada_em ? 'Reabrir' : 'Marcar como concluída'} onPress={() => agir(() => concluirAtividade(a.id, !a.realizada_em))} />
          </View>
        ) : null}
      </View>
      {aberto ? (
        <View className="gap-2 rounded-md border border-default p-3">
          {coms?.map((c) => (
            <View key={c.id} className="gap-1">
              <T v="caption">{c.autor_nome} · {fmtDataHora(c.criado_em)}</T>
              <T v="body">{c.texto}</T>
            </View>
          ))}
          {coms && !coms.length ? <T v="caption">Nenhum comentário ainda.</T> : null}
          {podeEscrever ? (
            <>
              <Campo rotulo="Comentário" placeholder="Escreva um comentário" value={texto} onChangeText={setTexto} multiline />
              <Botao tipo="secundario" titulo="Comentar" desabilitado={!texto.trim()} onPress={() => agir(async () => {
                await comentarAtividade(labId, a.id, texto.trim());
                setTexto('');
                setComs(await comentariosDaAtividade(a.id));
              })} />
            </>
          ) : null}
          {a.autor_id === sessao?.user.id || pode('gestor') ? <Botao tipo="sutil" titulo="Arquivar" onPress={() => agir(() => arquivarAtividade(a.id))} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function MuralEquipe({ limite = 5 }: { limite?: number }) {
  const { lab, pode } = useSessao();
  const [lista, setLista] = useState<Atividade[] | null>(null);
  const [todos, setTodos] = useState(false);
  const [novo, setNovo] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tag, setTag] = useState<TagMural>('Rotina');
  const [erro, setErro] = useState<string | null>(null);
  const podeEscrever = pode('solicitante', 'tecnico', 'gestor', 'coordenador');

  const carregar = useCallback(async () => {
    if (!lab) return;
    try {
      setLista(await listarMural(lab.id));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [lab]);
  useEffect(() => {
    if (!lab) return;
    let vivo = true;
    listarMural(lab.id).then((l) => vivo && setLista(l)).catch((e) => vivo && setErro(mensagemErro(e)));
    return () => { vivo = false; };
  }, [lab]);

  async function publicar() {
    if (!lab) return;
    setErro(null);
    try {
      await publicarAtividade(lab.id, titulo.trim(), descricao.trim() || null, tag);
      setTitulo('');
      setDescricao('');
      setNovo(false);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const visiveis = (lista ?? []).slice(0, todos ? undefined : limite);
  return (
    <Card className="gap-3">
      <T v="subtitle">Mural da equipe</T>
      <T v="caption">Comunicados, rotinas de assepsia e tarefas coletivas do laboratório.</T>
      {erro ? <Aviso>{erro}</Aviso> : null}
      {podeEscrever ? (novo ? (
        <View className="gap-3 rounded-md border border-default p-3">
          <Campo rotulo="Título" placeholder="Ex.: troca de filtros da cabine" value={titulo} onChangeText={setTitulo} />
          <Campo rotulo="Instruções e detalhes" value={descricao} onChangeText={setDescricao} multiline />
          <Opcoes rotulo="Tag" valor={tag} onChange={setTag} opcoes={TAGS_MURAL.map((t) => ({ valor: t, rotulo: t }))} />
          <Botao titulo="Publicar no mural" desabilitado={!titulo.trim()} onPress={publicar} />
          <Botao tipo="sutil" titulo="Cancelar" onPress={() => setNovo(false)} />
        </View>
      ) : <Botao tipo="secundario" titulo="Publicar aviso ou tarefa" onPress={() => setNovo(true)} />) : null}
      {!lista ? <><Skeleton altura={14} largura="50%" /><Skeleton altura={12} /></> : null}
      {lista && !lista.length ? <T v="caption">Nada no mural ainda.</T> : null}
      {lab ? visiveis.map((a) => <Linha key={a.id} a={a} labId={lab.id} podeEscrever={podeEscrever} aoMudar={carregar} />) : null}
      {lista && lista.length > limite ? <Botao tipo="sutil" titulo={todos ? 'Mostrar menos' : `Ver todas (${lista.length})`} onPress={() => setTodos((t) => !t)} /> : null}
    </Card>
  );
}
