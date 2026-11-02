import { useState } from 'react';
import { Aviso, Botao, Campo, Tela, T } from './ui';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

/** Primeiro acesso: o usuário ainda não pertence a nenhum laboratório. */
export function SemLaboratorio() {
  const { recarregarLabs, sair } = useSessao();
  const [nome, setNome] = useState('Lab. de Biologia Celular');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar() {
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.rpc('fn_criar_laboratorio', { p_nome: nome.trim() });
    setEnviando(false);
    if (error) setErro(mensagemErro(error));
    else await recarregarLabs();
  }

  return (
    <Tela titulo="Bem-vindo">
      <T v="body">Você ainda não faz parte de um laboratório. Peça ao administrador para incluir seu e-mail, ou crie um laboratório e torne-se o administrador dele.</T>
      <Campo rotulo="Nome do laboratório" value={nome} onChangeText={setNome} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao titulo="Criar laboratório" onPress={criar} carregando={enviando} desabilitado={!nome.trim()} />
      <Botao tipo="secundario" titulo="Sair" onPress={sair} />
    </Tela>
  );
}
