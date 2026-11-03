// Nova requisição: projeto, finalidade e linhas (item + quantidade). Ao enviar, vai para aprovação ou já fica aprovada.
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Carregando, Selecionar, Tela, T } from '@/components/ui';
import { enviarRequisicao } from '@/data/operacoes';
import { useEstoque } from '@/data/useEstoque';
import { lerNumero } from '@/domain/entrada';
import { fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

export default function NovaRequisicao() {
  const { lab, sessao } = useSessao();
  const { estoque, projetos, erro: erroCarga } = useEstoque();
  const [projeto, setProjeto] = useState<string | null>(null);
  const [finalidade, setFinalidade] = useState('');
  const [linhas, setLinhas] = useState<{ item: string | null; qtd: string }[]>([{ item: null, qtd: '' }]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!estoque) return erroCarga ? <Tela titulo="Nova requisição" voltar><Aviso>{erroCarga}</Aviso></Tela> : <Carregando />;
  const ativos = estoque.filter((i) => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  const validas = linhas.filter((l) => l.item && (lerNumero(l.qtd) ?? 0) > 0);
  const pendencia = !projeto ? 'Escolha o projeto.' : !finalidade.trim() ? 'Informe a finalidade.' : validas.length === 0 ? 'Inclua ao menos um item com quantidade.' : null;

  async function enviar() {
    if (!lab || !sessao || !projeto) return;
    setEnviando(true);
    setErro(null);
    try {
      const { data: req, error } = await supabase.from('requisicoes')
        .insert({ lab_id: lab.id, solicitante_id: sessao.user.id, projeto_id: projeto, finalidade: finalidade.trim(), status: 'rascunho' })
        .select('id').single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('requisicao_linhas')
        .insert(validas.map((l) => ({ lab_id: lab.id, requisicao_id: req.id, item_id: l.item, qtd_solicitada: lerNumero(l.qtd) })));
      if (e2) throw e2;
      await enviarRequisicao(req.id);
      router.replace(`/requisicoes/${req.id}`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Nova requisição" voltar>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Selecionar rotulo="Projeto" valor={projeto} onChange={setProjeto} permitirVazio={false} opcoes={projetos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
      <Campo rotulo="Finalidade" placeholder="Ex.: cultivo de linhagem HeLa, aula prática" value={finalidade} onChangeText={setFinalidade} />
      <T v="title">Itens</T>
      {linhas.map((l, i) => {
        const it = ativos.find((x) => x.itemId === l.item);
        return (
          <Card key={i} className="gap-3">
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <Selecionar rotulo={`Item ${i + 1}`} valor={l.item} permitirVazio={false}
                  onChange={(v) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, item: v } : x)))}
                  opcoes={ativos.map((x) => ({ valor: x.itemId, rotulo: `${x.nome} (${x.codigo})` }))} />
              </View>
              {linhas.length > 1 ? <IconButton icon={Trash2} label="Remover item" variant="danger-subtle" onPress={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} /> : null}
            </View>
            <Campo rotulo={`Quantidade${it ? ` (${it.unidade})` : ''}`} keyboardType="decimal-pad" value={l.qtd}
              onChangeText={(t) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, qtd: t } : x)))}
              ajuda={it ? `Disponível agora: ${fmtQtd(it.disponivel, it.unidade)}` : undefined} />
          </Card>
        );
      })}
      <Botao tipo="secundario" titulo="Adicionar item" onPress={() => setLinhas((ls) => [...ls, { item: null, qtd: '' }])} />
      {pendencia ? <T v="caption">{pendencia}</T> : null}
      <Botao titulo="Enviar requisição" onPress={enviar} carregando={enviando} desabilitado={!!pendencia} />
    </Tela>
  );
}
