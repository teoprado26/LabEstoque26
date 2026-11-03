// Novo pedido de compra: a partir das sugestões, de um item ou manual. Quantidade na unidade de compra.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Carregando, Selecionar, Tela, T } from '@/components/ui';
import { criarPedido, sugestoesDeCompra } from '@/data/compras';
import { listarReferencias, type OpcaoRef } from '@/data/repositorioCadastros';
import { useEstoque } from '@/data/useEstoque';
import { lerNumero } from '@/domain/entrada';
import { fmtMoeda, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

interface Linha { item: string | null; qtd: string; custo: string }

export default function NovoPedido() {
  const params = useLocalSearchParams<{ item?: string; sugestoes?: string }>();
  const { lab } = useSessao();
  const { estoque, projetos, erro: erroCarga } = useEstoque();
  const [fornecedores, setFornecedores] = useState<OpcaoRef[]>([]);
  const [fornecedor, setFornecedor] = useState<string | null>(null);
  const [projeto, setProjeto] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([{ item: params.item ?? null, qtd: '', custo: '' }]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const preenchido = useRef(false);

  useEffect(() => {
    if (lab) listarReferencias(lab.id, 'fornecedores').then((f) => setFornecedores(f.filter((x) => x.ativo !== false))).catch((e) => setErro(mensagemErro(e)));
  }, [lab]);

  // Preenche com as sugestões (todas, ou a do item escolhido) quando o estoque carrega.
  useEffect(() => {
    if (!estoque || preenchido.current) return;
    preenchido.current = true;
    const sug = sugestoesDeCompra(estoque).filter((s) => params.sugestoes || s.item.itemId === params.item);
    if (sug.length) setLinhas(sug.map((s) => ({ item: s.item.itemId, qtd: String(s.quantidadeCompra), custo: '' })));
  }, [estoque, params.item, params.sugestoes]);

  if (!estoque) return erroCarga ? <Tela titulo="Novo pedido" voltar><Aviso>{erroCarga}</Aviso></Tela> : <Carregando />;
  const ativos = estoque.filter((i) => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  const validas = linhas.filter((l) => l.item && (lerNumero(l.qtd) ?? 0) > 0);
  const total = validas.reduce((s, l) => s + (lerNumero(l.qtd) ?? 0) * (lerNumero(l.custo) ?? 0), 0);
  const repetido = new Set(validas.map((l) => l.item)).size !== validas.length;
  const pendencia = validas.length === 0 ? 'Inclua ao menos um item com quantidade.' : repetido ? 'Cada item só pode aparecer uma vez no pedido.' : null;
  const mudar = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function enviar() {
    if (!lab) return;
    setEnviando(true);
    setErro(null);
    try {
      const id = await criarPedido(lab.id, fornecedor, projeto,
        validas.map((l) => ({ item_id: l.item!, qtd: lerNumero(l.qtd)!, custo: lerNumero(l.custo) })), obs.trim() || null);
      router.replace(`/compras/${id}` as Href);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Novo pedido" voltar>
      <T v="caption">O pedido nasce como solicitação. O gestor aprova, alguém registra o envio ao fornecedor com a previsão de entrega, e o recebimento é feito pela tela Receber.</T>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Selecionar rotulo="Fornecedor" valor={fornecedor} onChange={setFornecedor} opcoes={fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome }))} />
      <Selecionar rotulo="Projeto / fonte de recurso" valor={projeto} onChange={setProjeto} opcoes={projetos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
      <T v="title">Itens</T>
      {linhas.map((l, i) => {
        const it = ativos.find((x) => x.itemId === l.item);
        const q = lerNumero(l.qtd);
        return (
          <Card key={i} className="gap-3">
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <Selecionar rotulo={`Item ${i + 1}`} valor={l.item} permitirVazio={false} onChange={(v) => mudar(i, { item: v })}
                  opcoes={ativos.map((x) => ({ valor: x.itemId, rotulo: `${x.nome} (${x.codigo})` }))} />
              </View>
              {linhas.length > 1 ? <IconButton icon={Trash2} label="Remover item" variant="danger-subtle" onPress={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} /> : null}
            </View>
            <Campo rotulo={`Quantidade${it ? ` (${it.unidadeCompra})` : ''}`} keyboardType="decimal-pad" value={l.qtd} onChangeText={(t) => mudar(i, { qtd: t })}
              ajuda={it && q ? `= ${fmtQtd(q * it.fator, it.unidade)} · posição atual ${fmtQtd(it.posicaoProjetada, it.unidade)}` : undefined} />
            <Campo rotulo={`Custo unitário previsto${it ? ` (R$ por ${it.unidadeCompra})` : ''}`} keyboardType="decimal-pad" value={l.custo} onChangeText={(t) => mudar(i, { custo: t })} />
          </Card>
        );
      })}
      <Botao tipo="secundario" titulo="Adicionar item" onPress={() => setLinhas((ls) => [...ls, { item: null, qtd: '', custo: '' }])} />
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline />
      {total > 0 ? <T v="subtitle">Total previsto: {fmtMoeda(total)}</T> : null}
      {pendencia ? <T v="caption">{pendencia}</T> : null}
      <Botao titulo="Criar solicitação de compra" onPress={enviar} carregando={enviando} desabilitado={!!pendencia} />
    </Tela>
  );
}
