// Retorno do login com Google e do link por e-mail.
import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Carregando, Tela } from '@/components/ui';
import { concluirRetorno } from '@/lib/auth';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

export default function RetornoLogin() {
  const url = Linking.useURL();
  const { sessao } = useSessao();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (url) concluirRetorno(url).catch((e) => setErro(mensagemErro(e)));
  }, [url]);

  if (sessao) return <Redirect href="/" />;
  if (erro) {
    return (
      <Tela titulo="Não foi possível entrar">
        <Aviso>{erro}</Aviso>
        <Botao titulo="Voltar para o login" onPress={() => router.replace('/login')} />
      </Tela>
    );
  }
  return <Carregando />;
}
