// Fotos da bancada (24 h): faixa de fotos da equipe; cada foto some sozinha um dia depois de postada.
import * as ImagePicker from 'expo-image-picker';
import { Camera, Heart, ImagePlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import {
  comentarFoto, comentariosDaFoto, curtirFoto, horasRestantes, listarFotos, postarFoto, removerFoto, type Comentario, type FotoBancada,
} from '@/data/mural';
import { fmtDataHora } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';
import { IconButton, Skeleton, useCor } from './sds';
import { Aviso, Botao, Campo, Card, Selo, Tela, T } from './ui';

function Visualizar({ foto, onFechar, aoMudar }: { foto: FotoBancada; onFechar: () => void; aoMudar: () => void }) {
  const { lab, sessao, pode } = useSessao();
  const cor = useCor();
  const [coms, setComs] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { comentariosDaFoto(foto.id).then(setComs).catch(() => {}); }, [foto.id]);
  const agir = async (fn: () => Promise<unknown>) => {
    setErro(null);
    try { await fn(); aoMudar(); } catch (e) { setErro(mensagemErro(e)); }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar}>
      <Tela titulo={foto.titulo} acao={<IconButton icon={X} label="Fechar" onPress={onFechar} />}>
        <View className="flex-row flex-wrap items-center gap-2">
          <Selo tom="warn" texto={`Some em ${horasRestantes(foto.expira_em)} h`} />
          {foto.tag ? <Selo tom="neutro" texto={foto.tag} /> : null}
        </View>
        <T v="caption">{foto.autor_nome} · {fmtDataHora(foto.postada_em)}</T>
        {foto.url ? <Image source={{ uri: foto.url }} accessibilityLabel={foto.titulo} style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }} resizeMode="cover" /> : <Skeleton altura={300} />}
        {foto.descricao ? <T v="body">{foto.descricao}</T> : null}
        {erro ? <Aviso>{erro}</Aviso> : null}
        <Pressable onPress={() => lab && agir(() => curtirFoto(lab.id, foto))} accessibilityRole="button" accessibilityState={{ selected: foto.curtida_por_mim }}
          className="min-h-12 flex-row items-center gap-2 self-start rounded-md px-2 active:bg-default-hover">
          <Heart size={20} color={cor(foto.curtida_por_mim ? 'icon-danger' : 'icon-secondary')} fill={foto.curtida_por_mim ? cor('icon-danger') : 'none'} />
          <T v="body">{foto.curtidas} curtida{foto.curtidas === 1 ? '' : 's'}</T>
        </Pressable>
        <Card className="gap-2">
          <T v="label">Comentários</T>
          {coms.map((c) => <View key={c.id} className="gap-1"><T v="caption">{c.autor_nome} · {fmtDataHora(c.criado_em)}</T><T v="body">{c.texto}</T></View>)}
          {!coms.length ? <T v="caption">Nenhum comentário.</T> : null}
          <Campo rotulo="Comentário" value={texto} onChangeText={setTexto} multiline />
          <Botao tipo="secundario" titulo="Comentar" desabilitado={!texto.trim()} onPress={() => lab && agir(async () => {
            await comentarFoto(lab.id, foto.id, texto.trim());
            setTexto('');
            setComs(await comentariosDaFoto(foto.id));
          })} />
        </Card>
        {foto.autor_id === sessao?.user.id || pode('gestor') ? <Botao tipo="perigo" titulo="Remover foto" onPress={() => agir(async () => { await removerFoto(foto); onFechar(); })} /> : null}
      </Tela>
    </Modal>
  );
}

function Postar({ onFechar, aoPostar }: { onFechar: () => void; aoPostar: () => void }) {
  const { lab, sessao } = useSessao();
  const [img, setImg] = useState<{ uri: string; mime: string | null } | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tag, setTag] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const escolher = async (camera: boolean) => {
    setErro(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setErro(camera ? 'Permita a câmera para tirar a foto.' : 'Permita o acesso às fotos para escolher uma imagem.');
    const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [1, 1] };
    const r = camera ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
    if (!r.canceled && r.assets[0]) setImg({ uri: r.assets[0].uri, mime: r.assets[0].mimeType ?? null });
  };

  async function enviar() {
    if (!lab || !sessao || !img) return;
    setEnviando(true);
    setErro(null);
    try {
      await postarFoto(lab.id, sessao.user.id, img.uri, img.mime, titulo.trim(), descricao.trim() || null, tag.trim() || null);
      aoPostar();
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar}>
      <Tela titulo="Postar na bancada" acao={<IconButton icon={X} label="Fechar" onPress={onFechar} />}>
        <T v="caption">A foto fica visível só para o seu laboratório e some sozinha em 24 horas. Não poste dados pessoais nem rótulos com informação de pacientes.</T>
        {erro ? <Aviso>{erro}</Aviso> : null}
        {img ? <Image source={{ uri: img.uri }} accessibilityLabel="Prévia da foto" style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }} /> : null}
        <View className="flex-row gap-2">
          <View className="flex-1"><Botao tipo="secundario" titulo="Tirar foto" icone={Camera} onPress={() => escolher(true)} /></View>
          <View className="flex-1"><Botao tipo="secundario" titulo="Galeria" icone={ImagePlus} onPress={() => escolher(false)} /></View>
        </View>
        <Campo rotulo="Título" placeholder="Ex.: confluência das HeLa no dia 3" value={titulo} onChangeText={setTitulo} />
        <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} multiline />
        <Campo rotulo="Tag" placeholder="Ex.: Cultura, Microscopia, Assepsia" value={tag} onChangeText={setTag} />
        <Botao titulo="Postar por 24 horas" onPress={enviar} carregando={enviando} desabilitado={!img || !titulo.trim()} />
      </Tela>
    </Modal>
  );
}

export function BancadaFotos() {
  const { lab, pode } = useSessao();
  const cor = useCor();
  const [fotos, setFotos] = useState<FotoBancada[] | null>(null);
  const [aberta, setAberta] = useState<FotoBancada | null>(null);
  const [postando, setPostando] = useState(false);
  const podePostar = pode('solicitante', 'tecnico', 'gestor', 'coordenador');

  const carregar = useCallback(async () => {
    if (!lab) return;
    const fs = await listarFotos(lab.id).catch(() => []);
    setFotos(fs);
    setAberta((a) => (a ? fs.find((f) => f.id === a.id) ?? null : null));
  }, [lab]);
  useEffect(() => {
    if (!lab) return;
    let vivo = true;
    listarFotos(lab.id).then((fs) => vivo && setFotos(fs)).catch(() => vivo && setFotos([]));
    return () => { vivo = false; };
  }, [lab]);

  return (
    <View className="gap-2">
      <T v="label">Bancada 24h</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {podePostar ? (
          <Pressable onPress={() => setPostando(true)} accessibilityRole="button" accessibilityLabel="Postar foto da bancada" className="w-16 items-center gap-1">
            <View className="h-14 w-14 items-center justify-center rounded-full border border-dashed border-default-secondary bg-secondary">
              <Camera size={20} color={cor('icon-default')} />
            </View>
            <T v="caption" numberOfLines={1}>Postar</T>
          </Pressable>
        ) : null}
        {!fotos ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} altura={56} largura={56} raio={28} />) : null}
        {fotos?.map((f) => (
          <Pressable key={f.id} onPress={() => setAberta(f)} accessibilityRole="button" accessibilityLabel={`${f.titulo}, de ${f.autor_nome}, some em ${horasRestantes(f.expira_em)} horas`} className="w-16 items-center gap-1">
            <View className="h-14 w-14 items-center justify-center rounded-full border-2 border-brand p-0.5">
              {f.url ? <Image source={{ uri: f.url }} style={{ width: 48, height: 48, borderRadius: 24 }} /> : <Skeleton altura={48} largura={48} raio={24} />}
            </View>
            <T v="caption" numberOfLines={1}>{f.autor_nome.split(' ')[0]} · {horasRestantes(f.expira_em)}h</T>
          </Pressable>
        ))}
        {fotos && !fotos.length && !podePostar ? <T v="caption">Nenhuma foto nas últimas 24 horas.</T> : null}
      </ScrollView>
      {aberta ? <Visualizar foto={aberta} onFechar={() => setAberta(null)} aoMudar={carregar} /> : null}
      {postando ? <Postar onFechar={() => setPostando(false)} aoPostar={carregar} /> : null}
    </View>
  );
}
