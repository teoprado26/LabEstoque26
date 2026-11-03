import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Aviso, Botao, Campo, Tela, T } from '@/components/ui';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase, supabaseConfigurado } from '@/lib/supabase';

export default function Login() {
  const { sessao } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sessao) return <Redirect href="/" />;

  async function enviar() {
    setErro(null);
    setInfo(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha, options: { data: { nome } } });
        if (error) throw error;
        if (!data.session) setInfo('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
      }
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela>
      <View className="gap-2 pt-12">
        <T v="display">LabEstoque</T>
        <T v="body" className="text-secondary">Estoque laboratorial rastreável, lote a lote.</T>
      </View>
      {!supabaseConfigurado ? (
        <Aviso tom="warn">Supabase não configurado. Copie .env.example para .env.local, preencha a URL e a chave e reinicie o Expo.</Aviso>
      ) : null}
      {modo === 'criar' ? <Campo rotulo="Nome" value={nome} onChangeText={setNome} autoComplete="name" /> : null}
      <Campo rotulo="E-mail institucional" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {info ? <Aviso tom="ok">{info}</Aviso> : null}
      <Botao titulo={modo === 'entrar' ? 'Entrar' : 'Criar conta'} onPress={enviar} carregando={enviando} desabilitado={!email || senha.length < 6} />
      <Botao
        tipo="secundario"
        titulo={modo === 'entrar' ? 'Criar uma conta' : 'Já tenho conta'}
        onPress={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}
      />
    </Tela>
  );
}
