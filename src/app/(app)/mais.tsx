import { router } from 'expo-router';
import { useState } from 'react';
import { Aviso, Botao, Card, Opcoes, Tela, T } from '@/components/ui';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

const NOMES: Record<string, string> = {
  administrador: 'Administrador', gestor: 'Gestor de estoque', tecnico: 'Técnico / almoxarife',
  solicitante: 'Solicitante', coordenador: 'Coordenador de projeto', auditor: 'Auditor',
};

export default function Mais() {
  const { sessao, lab, labs, escolherLab, pode, sair } = useSessao();
  const [msg, setMsg] = useState<{ tom: 'ok' | 'crit'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregarDemo() {
    if (!lab) return;
    setCarregando(true);
    let { error } = await supabase.rpc('fn_carregar_demonstracao', { p_lab: lab.id });
    if (!error) ({ error } = await supabase.rpc('fn_demo_equipamentos', { p_lab: lab.id }));
    setCarregando(false);
    setMsg(error ? { tom: 'crit', texto: mensagemErro(error) } : { tom: 'ok', texto: 'Dados de demonstração carregados. Abra o Painel.' });
  }

  return (
    <Tela titulo="Mais">
      <Card className="gap-1">
        <T v="label">Conta</T>
        <T v="body">{sessao?.user.email}</T>
        {lab ? <T v="caption">Perfis em {lab.nome}: {lab.perfis.map((p) => NOMES[p]).join(', ')}</T> : null}
      </Card>
      {labs.length > 1 ? (
        <Opcoes rotulo="Laboratório" valor={lab?.id ?? null} opcoes={labs.map((l) => ({ valor: l.id, rotulo: l.nome }))} onChange={escolherLab} />
      ) : null}
      <Card onPress={() => router.push('/cadastros')} className="gap-1">
        <T v="subtitle">Cadastros</T>
        <T v="caption">Itens, locais, projetos, fornecedores e categorias.</T>
      </Card>
      {msg ? <Aviso tom={msg.tom}>{msg.texto}</Aviso> : null}
      {pode() ? (
        <Card className="gap-2">
          <T v="label">Demonstração</T>
          <T v="caption">Cria itens, locais, projetos, lotes, equipamentos com agenda de manutenção e calibração, e 120 dias de movimentações fictícias neste laboratório, para testar o painel.</T>
          <Botao tipo="secundario" titulo="Carregar dados de demonstração" onPress={carregarDemo} carregando={carregando} />
        </Card>
      ) : null}
      <Botao tipo="perigo" titulo="Sair" onPress={sair} />
    </Tela>
  );
}
