// Membros do laboratório e seus perfis (só o administrador altera).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Aviso, Botao, Campo, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { adicionarMembro, listarMembrosLab, removerPerfil } from '@/data/operacoes';
import { useSessao, type Perfil } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

const PERFIS: { valor: Perfil; rotulo: string; descricao: string }[] = [
  { valor: 'administrador', rotulo: 'Administrador', descricao: 'Configurações, usuários, metas e parâmetros.' },
  { valor: 'gestor', rotulo: 'Gestor de estoque', descricao: 'Libera lotes, aprova ajustes e devoluções, define reposição.' },
  { valor: 'tecnico', rotulo: 'Técnico / almoxarife', descricao: 'Recebe, dispensa, transfere, registra perdas e conta inventário.' },
  { valor: 'solicitante', rotulo: 'Solicitante', descricao: 'Cria requisições e reservas, devolve material.' },
  { valor: 'coordenador', rotulo: 'Coordenador de projeto', descricao: 'Aprova requisições do projeto e vê seus custos.' },
  { valor: 'auditor', rotulo: 'Auditor', descricao: 'Somente leitura de registros, indicadores e relatórios.' },
];
const rotulo = (p: string) => PERFIS.find((x) => x.valor === p)?.rotulo ?? p;

export default function Membros() {
  const { lab, pode, sessao, recarregarLabs } = useSessao();
  const [lista, setLista] = useState<Awaited<ReturnType<typeof listarMembrosLab>> | null>(null);
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState<Perfil | null>('solicitante');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const admin = pode();

  const carregar = useCallback(async () => {
    if (!lab) return;
    try {
      setLista(await listarMembrosLab(lab.id));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [lab]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const agir = async (fn: () => Promise<unknown>, msg: string) => {
    setErro(null);
    setOk(null);
    try {
      await fn();
      setOk(msg);
      await carregar();
      await recarregarLabs();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  if (!lista || !lab) return erro ? <Tela titulo="Membros" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;

  return (
    <Tela titulo="Membros" voltar>
      <T v="caption">Cada pessoa pode ter mais de um perfil. Armazenamos só nome, e-mail e perfil (LGPD).</T>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      {admin ? (
        <Card className="gap-4">
          <T v="subtitle">Incluir pessoa</T>
          <Campo rotulo="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
            ajuda="A pessoa precisa ter entrado no LabEstoque ao menos uma vez (com Google, link ou senha)." />
          <Opcoes rotulo="Perfil" valor={perfil} onChange={setPerfil} opcoes={PERFIS.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))}
            ajuda={PERFIS.find((p) => p.valor === perfil)?.descricao} />
          <Botao titulo="Incluir" desabilitado={!/^\S+@\S+\.\S+$/.test(email.trim()) || !perfil}
            onPress={() => agir(() => adicionarMembro(lab.id, email.trim(), perfil!), `${email.trim()} incluído como ${rotulo(perfil!)}.`)} />
        </Card>
      ) : null}
      {lista.map((m) => (
        <Card key={m.user_id} className="gap-2">
          <T v="subtitle">{m.nome || m.email}{m.user_id === sessao?.user.id ? ' (você)' : ''}</T>
          <T v="caption">{m.email}</T>
          <View className="flex-row flex-wrap gap-2">
            {m.perfis.map((p) => <Selo key={p} tom={p === 'administrador' ? 'primary' : 'neutro'} texto={rotulo(p)} />)}
          </View>
          {admin ? m.perfis.map((p) => (
            <Botao key={p} tipo="sutil" titulo={`Remover perfil ${rotulo(p)}`} onPress={() => agir(() => removerPerfil(lab.id, m.user_id, p), `Perfil ${rotulo(p)} removido.`)} />
          )) : null}
        </Card>
      ))}
    </Tela>
  );
}
