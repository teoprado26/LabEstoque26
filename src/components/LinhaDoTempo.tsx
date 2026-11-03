import { router } from 'expo-router';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, RotateCcw, Tag as TagIcon, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import type { Evento } from '@/data/rastreabilidade';
import { fmtDataHora, fmtQtd } from '@/domain/formato';
import { useCor } from './sds';
import { Selo, T } from './ui';

const ICONE: Record<Evento['tipo'], LucideIcon> = {
  ENTRADA: ArrowDownLeft, DEVOLUCAO: ArrowDownLeft, DISPENSACAO: ArrowUpRight, PERDA: ArrowUpRight,
  TRANSFERENCIA: ArrowLeftRight, AJUSTE_INVENTARIO: ArrowLeftRight, ESTORNO: RotateCcw, STATUS: TagIcon,
};

/** Linha do tempo de rastreabilidade: cada movimentação do livro-razão e cada mudança de status do lote. */
export function LinhaDoTempo({ eventos, unidade, mostrarLote = true }: { eventos: Evento[]; unidade: string; mostrarLote?: boolean }) {
  const cor = useCor();
  if (eventos.length === 0) return <T v="caption">Nenhum registro ainda.</T>;
  return (
    <View>
      {eventos.map((e, i) => {
        const Icone = ICONE[e.tipo];
        const sinal = e.sinal === 1 ? '+' : e.sinal === -1 ? '−' : '';
        const retroativo = e.registradoEm && new Date(e.registradoEm).getTime() - new Date(e.em).getTime() > 24 * 3600e3;
        return (
          <View key={e.id} className="flex-row gap-3">
            <View className="items-center">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary">
                <Icone size={16} color={cor(e.tipo === 'PERDA' ? 'icon-danger' : 'icon-default')} />
              </View>
              {i < eventos.length - 1 ? <View className="w-px flex-1 bg-tertiary" /> : null}
            </View>
            <View className="flex-1 gap-1 pb-4">
              <View className="flex-row flex-wrap items-center gap-2">
                <T v="subtitle">{e.titulo}</T>
                {e.quantidade != null ? <T v="code">{sinal}{fmtQtd(e.quantidade, unidade)}</T> : null}
                {e.estornada ? <Selo tom="neutro" texto="Estornada" /> : null}
                {retroativo ? <Selo tom="warn" texto="Registro retroativo" /> : null}
              </View>
              <T v="caption">{fmtDataHora(e.em)}{e.usuario ? ` · ${e.usuario}` : ''}</T>
              {mostrarLote && e.lote ? (
                <Pressable onPress={() => router.push(`/lote/${e.loteId}`)} accessibilityRole="link">
                  <T v="caption" className="text-default underline">Lote {e.lote}</T>
                </Pressable>
              ) : null}
              {e.origem || e.destino ? <T v="caption">{e.origem ?? '—'} → {e.destino ?? '—'}</T> : null}
              {e.projeto || e.finalidade ? <T v="caption">{[e.projeto, e.finalidade].filter(Boolean).join(' · ')}</T> : null}
              {e.motivo ? <T v="caption">Motivo: {e.motivo}</T> : null}
              {e.justificativa ? <T v="caption">Fora do FEFO: {e.justificativa}</T> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
