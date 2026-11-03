import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Aviso, Botao, Campo, Card, Opcoes, Tela, T } from '@/components/ui';
import { useSessao, type Perfil } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

const NOMES: Record<string, string> = {
  administrador: 'Administrador', gestor: 'Gestor de estoque', tecnico: 'Técnico / almoxarife',
  solicitante: 'Solicitante', coordenador: 'Coordenador de projeto', auditor: 'Auditor',
};

const ATALHOS: { titulo: string; descricao: string; rota: Href; perfis?: Perfil[] }[] = [
  { titulo: 'Análises', descricao: 'Indicadores completos, ABC-VED, Pareto, vencimentos, fornecedores, consumo e itens parados.', rota: '/analises' },
  { titulo: 'Relatórios', descricao: 'Relatório técnico em PDF e planilhas CSV para conferência no Excel.', rota: '/relatorios' },
  { titulo: 'Cadastros', descricao: 'Itens, locais, equipamentos, projetos, fornecedores e categorias.', rota: '/cadastros' },
  { titulo: 'Membros', descricao: 'Quem tem acesso ao laboratório e com qual perfil.', rota: '/membros' },
];

export default function Mais() {
  const { sessao, lab, labs, escolherLab, pode, sair } = useSessao();
  const [msg, setMsg] = useState<{ tom: 'ok' | 'crit'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function carregarDemo() {
    if (!lab) return;
    setCarregando(true);
    let { error } = await supabase.rpc('fn_carregar_demonstracao', { p_lab: lab.id });
    if (!error) ({ error } = await supabase.rpc('fn_demo_equipamentos', { p_lab: lab.id }));
    if (!error) ({ error } = await supabase.rpc('fn_demo_compras', { p_lab: lab.id }));
    if (!error) ({ error } = await supabase.rpc('fn_demo_mural', { p_lab: lab.id }));
    setCarregando(false);
    setMsg(error ? { tom: 'crit', texto: mensagemErro(error) } : { tom: 'ok', texto: 'Dados de demonstração carregados. Abra o Painel.' });
  }

  async function trocarSenha() {
    setSalvandoSenha(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSalvandoSenha(false);
    setMsg(error ? { tom: 'crit', texto: mensagemErro(error) } : { tom: 'ok', texto: 'Senha alterada.' });
    if (!error) setNovaSenha('');
  }

  return (
    <Tela titulo="Mais">
      <Card className="gap-1">
        <T v="label">Conta</T>
        <T v="body">{sessao?.user.email}</T>
        {lab ? <T v="caption">Perfis em {lab.nome}: {lab.perfis.map((p) => NOMES[p]).join(', ')}</T> : null}
        <T v="caption">Você continua conectado neste aparelho até tocar em Sair.</T>
      </Card>
      {labs.length > 1 ? (
        <Opcoes rotulo="Laboratório" valor={lab?.id ?? null} opcoes={labs.map((l) => ({ valor: l.id, rotulo: l.nome }))} onChange={escolherLab} />
      ) : null}
      {ATALHOS.filter((a) => !a.perfis || pode(...a.perfis)).map((a) => (
        <Card key={a.titulo} onPress={() => router.push(a.rota)} className="gap-1">
          <T v="subtitle">{a.titulo}</T>
          <T v="caption">{a.descricao}</T>
        </Card>
      ))}
      {msg ? <Aviso tom={msg.tom}>{msg.texto}</Aviso> : null}
      <Card className="gap-3">
        <T v="label">Senha</T>
        <T v="caption">Defina ou troque a senha (útil se você entrou com Google ou por link e quer entrar também com senha).</T>
        <Campo rotulo="Nova senha" value={novaSenha} onChangeText={setNovaSenha} secureTextEntry autoComplete="new-password" />
        <Botao tipo="secundario" titulo="Salvar senha" onPress={trocarSenha} carregando={salvandoSenha} desabilitado={novaSenha.length < 6} />
      </Card>
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
