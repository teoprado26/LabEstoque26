import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Aviso, Campo, Card, Carregando, Selo, Tela, T } from '@/components/ui';
import { carregarEstoque, type ItemEstoque } from '@/data/servicoKpis';
import { fmtData, fmtNumero, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

export default function Estoque() {
  const { lab } = useSessao();
  const [itens, setItens] = useState<ItemEstoque[] | null>(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!lab) return;
      carregarEstoque(lab.id).then(setItens).catch((e) => setErro(mensagemErro(e)));
    }, [lab]),
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens ?? [])
      .filter((i) => !q || i.nome.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [itens, busca]);

  if (!itens && !erro) return <Carregando />;

  return (
    <Tela titulo="Estoque">
      <Campo rotulo="Buscar" placeholder="Nome ou código" value={busca} onChangeText={setBusca} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {filtrados.length === 0 ? <T v="caption">Nenhum item encontrado.</T> : null}
      {filtrados.map((i) => (
        <Card key={i.itemId} onPress={() => router.push(`/item/${i.itemId}`)} className="gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <T v="subtitle" className="flex-1" numberOfLines={1}>{i.nome}</T>
            {i.criticidade === 'V' ? <Selo tom="primary" texto="Vital" /> : null}
          </View>
          <T v="code" className="text-secondary">{i.codigo}</T>
          <View className="flex-row flex-wrap gap-x-4">
            <T v="caption">Disponível <T v="code">{fmtQtd(i.disponivel, i.unidade)}</T></T>
            <T v="caption">Físico <T v="code">{fmtQtd(i.fisico, i.unidade)}</T></T>
          </View>
          <View className="flex-row flex-wrap items-center gap-2">
            {i.disponivel <= 0 && i.ativo ? <Selo tom="crit" texto="✕ Sem disponível" /> : null}
            {i.reposicao.abaixoDoPR ? <Selo tom="warn" texto="! Abaixo do PR" /> : null}
            {i.cobertura.valor != null ? <T v="caption">Cobertura {fmtNumero(i.cobertura.valor)} dias</T> : null}
            {i.proximaValidade ? <T v="caption">Próx. validade {fmtData(i.proximaValidade)}</T> : null}
          </View>
        </Card>
      ))}
    </Tela>
  );
}
