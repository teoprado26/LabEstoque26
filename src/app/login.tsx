import { Redirect } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Aviso, Botao, Campo, Opcoes, Tela, T } from '@/components/ui';
import { entrarComGoogle, enviarLinkPorEmail, redefinirSenha } from '@/lib/auth';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase, supabaseConfigurado } from '@/lib/supabase';

type Modo = 'senha' | 'link' | 'criar';

export default function Login() {
  const { sessao } = useSessao();
  const [modo, setModo] = useState<Modo>('senha');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<'google' | 'email' | 'senha' | null>(null);

  // A sessão fica salva no aparelho: quem já entrou cai direto no app ao abrir.
  if (sessao) return <Redirect href="/" />;

  const emailValido = /^\S+@\S+\.\S+$/.test(email.trim());

  async function executar(tipo: 'google' | 'email' | 'senha', acao: () => Promise<void>) {
    setErro(null);
    setInfo(null);
    setEnviando(tipo);
    try {
      await acao();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(null);
    }
  }

  const google = () => executar('google', entrarComGoogle);

  const comEmail = () =>
    executar('email', async () => {
      if (modo === 'link') {
        await enviarLinkPorEmail(email.trim());
        setInfo(`Enviamos um link de acesso para ${email.trim()}. Abra-o neste aparelho para entrar.`);
      } else if (modo === 'senha') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error.message === 'Invalid login credentials' ? new Error('E-mail ou senha incorretos.') : error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha, options: { data: { nome: nome.trim() } } });
        if (error) throw error;
        if (!data.session) setInfo('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
      }
    });

  const esqueci = () =>
    executar('senha', async () => {
      await redefinirSenha(email.trim());
      setInfo(`Enviamos as instruções para redefinir a senha para ${email.trim()}.`);
    });

  return (
    <Tela>
      <View className="gap-2 pt-12">
        <T v="display">LabEstoque</T>
        <T v="body" className="text-secondary">Estoque laboratorial rastreável, lote a lote.</T>
      </View>
      {!supabaseConfigurado ? (
        <Aviso tom="warn">Supabase não configurado. Preencha .env.local com a URL e a publishable key e reinicie o Expo.</Aviso>
      ) : null}

      <Botao tipo="secundario" titulo="Entrar com Google" onPress={google} carregando={enviando === 'google'} />

      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-tertiary" />
        <T v="caption">ou com e-mail</T>
        <View className="h-px flex-1 bg-tertiary" />
      </View>

      <Opcoes rotulo="Como entrar" valor={modo} onChange={(m) => { setModo(m); setErro(null); setInfo(null); }}
        opcoes={[{ valor: 'senha', rotulo: 'Senha' }, { valor: 'link', rotulo: 'Link por e-mail' }, { valor: 'criar', rotulo: 'Criar conta' }]} />
      {modo === 'criar' ? <Campo rotulo="Nome" value={nome} onChangeText={setNome} autoComplete="name" /> : null}
      <Campo rotulo="E-mail institucional" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"
        textContentType="emailAddress" />
      {modo !== 'link' ? (
        <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry autoComplete={modo === 'senha' ? 'current-password' : 'new-password'}
          ajuda={modo === 'criar' ? 'Mínimo de 6 caracteres. Toque no olho para conferir.' : undefined} />
      ) : (
        <T v="caption">Você recebe um link de uso único. No primeiro acesso, a conta é criada automaticamente.</T>
      )}

      {erro ? <Aviso>{erro}</Aviso> : null}
      {info ? <Aviso tom="ok">{info}</Aviso> : null}

      <Botao
        titulo={modo === 'senha' ? 'Entrar' : modo === 'link' ? 'Enviar link de acesso' : 'Criar conta'}
        icone={modo === 'link' ? Mail : undefined}
        onPress={comEmail}
        carregando={enviando === 'email'}
        desabilitado={!emailValido || (modo !== 'link' && senha.length < 6)}
      />
      {modo === 'senha' ? <Botao tipo="sutil" titulo="Esqueci a senha" onPress={esqueci} carregando={enviando === 'senha'} desabilitado={!emailValido} /> : null}
    </Tela>
  );
}
