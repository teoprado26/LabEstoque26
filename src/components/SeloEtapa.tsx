import { ROTULO_ETAPA, type Pedido } from '@/data/compras';
import { hoje } from '@/domain/datas';
import { fmtData } from '@/domain/formato';
import { Selo } from './ui';

/** Etapa atual do pedido; pedido enviado com previsão vencida aparece como atrasado. */
export function SeloEtapa({ p }: { p: Pedido }) {
  const atrasado = p.status === 'enviado' && p.previsto_para && p.previsto_para < hoje();
  if (atrasado) return <Selo tom="crit" texto={`✕ Atrasado desde ${fmtData(p.previsto_para)}`} />;
  const tom = p.status === 'liberado' ? 'ok' : p.status === 'cancelado' ? 'neutro' : p.status === 'solicitado' ? 'warn' : 'primary';
  return <Selo tom={tom} texto={ROTULO_ETAPA[p.status]} />;
}
