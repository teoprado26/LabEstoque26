// Seletores compartilhados pelas operações: item (com busca ou QR) e posição (lote × local com saldo).
import { ScanLine } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { ItemEstoque } from '@/data/servicoKpis';
import { validadeEfetiva } from '@/domain/disponibilidade';
import { fmtData, fmtQtd } from '@/domain/formato';
import type { PosicaoLote } from '@/domain/tipos';
import { LeitorQR } from './LeitorQR';
import { Aviso, Botao, Campo, Card, SeloLote, T } from './ui';

export function EscolherItem({ itens, onEscolher, filtro, vazio = 'Nenhum item com saldo.', onLote }: {
  itens: ItemEstoque[]; onEscolher: (itemId: string) => void; filtro?: (i: ItemEstoque) => boolean; vazio?: string;
  /** Leitura de QR: recebe o lote lido. */
  onLote?: (loteId: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [lendo, setLendo] = useState(false);
  const lista = itens
    .filter((i) => (filtro ? filtro(i) : i.fisico > 0))
    .filter((i) => !busca || `${i.nome} ${i.codigo}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .slice(0, 30);
  return (
    <View className="gap-4">
      {onLote ? (lendo ? <LeitorQR onLote={(l) => { setLendo(false); onLote(l); }} onCancelar={() => setLendo(false)} /> : (
        <Botao tipo="secundario" titulo="Ler QR do lote" icone={ScanLine} onPress={() => setLendo(true)} />
      )) : null}
      <Campo rotulo="Item" placeholder="Busque por nome ou código" value={busca} onChangeText={setBusca} />
      {lista.length === 0 ? <T v="caption">{vazio}</T> : null}
      {lista.map((i) => (
        <Card key={i.itemId} onPress={() => onEscolher(i.itemId)} className="gap-1">
          <T v="subtitle">{i.nome}</T>
          <T v="caption">{i.codigo} · saldo {fmtQtd(i.fisico, i.unidade)}</T>
        </Card>
      ))}
    </View>
  );
}

export const chavePosicao = (p: { loteId: string; localId: string }) => `${p.loteId}|${p.localId}`;

/** Posições (lote × local) com saldo físico. Mostra status e validade; não filtra por disponibilidade. */
export function EscolherPosicao({ item, locais, valor, onEscolher }: {
  item: ItemEstoque; locais: Record<string, string>; valor: string | null; onEscolher: (chave: string) => void;
}) {
  const posicoes = [...item.posicoes].filter((p) => p.saldoFisico > 0)
    .sort((a, b) => (validadeEfetiva(a) ?? '9999') < (validadeEfetiva(b) ?? '9999') ? -1 : 1);
  if (posicoes.length === 0) return <Aviso tom="warn">Este item não tem saldo em nenhum local.</Aviso>;
  return (
    <View className="gap-2">
      <T v="label">Lote e local</T>
      {posicoes.map((p: PosicaoLote) => (
        <Card key={chavePosicao(p)} selecionado={valor === chavePosicao(p)} onPress={() => onEscolher(chavePosicao(p))} className="gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <T v="code">Lote {p.numero}</T>
            <SeloLote status={p.status} />
          </View>
          <T v="caption">{locais[p.localId] ?? 'Local'} · validade {fmtData(validadeEfetiva(p))} · saldo {fmtQtd(p.saldoFisico, item.unidade)}</T>
        </Card>
      ))}
    </View>
  );
}
