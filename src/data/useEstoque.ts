import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';
import { listarLocais, listarProjetos, type Opcao } from './cadastros';
import { carregarEstoque, type ItemEstoque } from './servicoKpis';

/** Estoque, locais e projetos do laboratório, recarregados ao voltar para a tela. */
export function useEstoque() {
  const { lab } = useSessao();
  const [estoque, setEstoque] = useState<ItemEstoque[] | null>(null);
  const [locais, setLocais] = useState<Opcao[]>([]);
  const [projetos, setProjetos] = useState<Opcao[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!lab) return;
    try {
      const [e, l, p] = await Promise.all([carregarEstoque(lab.id), listarLocais(lab.id), listarProjetos(lab.id)]);
      setEstoque(e);
      setLocais(l);
      setProjetos(p);
    } catch (x) {
      setErro(mensagemErro(x));
    }
  }, [lab]);

  useFocusEffect(useCallback(() => { recarregar(); }, [recarregar]));

  return { estoque, locais, nomesLocais: Object.fromEntries(locais.map((l) => [l.id, l.nome])) as Record<string, string>, projetos, erro, recarregar };
}
