import { SITUACOES, situacaoValida } from '@/domain/equipamentos';
import { Selo } from './ui';

export function SeloSituacao({ situacao }: { situacao: string }) {
  const s = situacaoValida(situacao) ? SITUACOES[situacao] : null;
  return s ? <Selo tom={s.tom} texto={s.rotulo} /> : null;
}
