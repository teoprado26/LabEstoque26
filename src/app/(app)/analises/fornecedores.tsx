// Fornecedores: lead time real (mediana e P90), entregas no prazo e etapas do ciclo de abastecimento.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { BarrasHorizontais, fmtDias } from '@/components/graficos';
import { Aviso, Card, Carregando, Opcoes, Selo, Tela, T } from '@/components/ui';
import { carregarFornecedores } from '@/data/servicoAnalises';
import { ultimosDias } from '@/data/servicoKpis';
import { ETAPAS_CICLO, k21CicloAbastecimento, type PedidoRecebido, type ResumoFornecedor } from '@/kpis/calculosFase2';
import { fmtNumero, fmtPct } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

const ROTULO: Record<string, string> = { aprovacao: 'Aprovação', compra: 'Processamento da compra', entrega: 'Entrega', conferencia: 'Conferência', liberacao: 'Liberação' };

export default function Fornecedores() {
  const { lab } = useSessao();
  const [dias, setDias] = useState<'90' | '180' | '365'>('365');
  const [d, setD] = useState<{ resumo: ResumoFornecedor[]; pedidos: PedidoRecebido[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lab) return;
    setD(null);
    carregarFornecedores(lab.id, ultimosDias(Number(dias))).then(setD).catch((e) => setErro(mensagemErro(e)));
  }, [lab, dias]));

  const ciclo = d ? k21CicloAbastecimento(d.pedidos) : null;
  const gargalo = ciclo?.valor != null ? ETAPAS_CICLO[Number(ciclo.extra?.gargalo ?? 0)] : null;

  return (
    <Tela titulo="Fornecedores" voltar>
      <T v="caption">Lead time = do envio do pedido ao recebimento. "No prazo" = recebido completo até a data prevista. Pelo menos 3 pedidos por fornecedor para um número confiável.</T>
      <Opcoes rotulo="Período" valor={dias} onChange={setDias} opcoes={[{ valor: '90', rotulo: '90 dias' }, { valor: '180', rotulo: '180 dias' }, { valor: '365', rotulo: '12 meses' }]} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {!d ? <Carregando /> : d.pedidos.length === 0 ? <T v="caption">Nenhum pedido recebido no período.</T> : (
        <>
          <Card className="gap-2">
            <T v="label">Lead time mediano por fornecedor</T>
            <BarrasHorizontais formatar={fmtDias} linhas={d.resumo.filter((f) => f.leadTimeMediano != null).map((f) => ({ rotulo: f.fornecedor, valor: f.leadTimeMediano! }))} />
            {d.resumo.some((f) => f.leadTimeMediano == null) ? <T v="caption">Fornecedores com menos de 3 pedidos ficam fora do gráfico.</T> : null}
          </Card>
          {d.resumo.map((f) => (
            <Card key={f.fornecedor} className="gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <T v="subtitle" className="flex-1">{f.fornecedor}</T>
                {f.noPrazo != null ? <Selo tom={f.noPrazo >= 90 ? 'ok' : f.noPrazo >= 80 ? 'warn' : 'crit'} texto={`${f.noPrazo >= 90 ? '✓' : f.noPrazo >= 80 ? '!' : '✕'} ${fmtPct(f.noPrazo, 0)} no prazo`} /> : <Selo tom="neutro" texto="Dados insuficientes" />}
              </View>
              <T v="caption">{f.pedidos} pedido{f.pedidos === 1 ? '' : 's'} · lead time mediano {f.leadTimeMediano == null ? '—' : fmtDias(f.leadTimeMediano)} · P90 {f.p90 == null ? '—' : fmtDias(f.p90)}</T>
            </Card>
          ))}
          <Card className="gap-2">
            <T v="label">Ciclo de abastecimento (mediana)</T>
            {ciclo?.valor == null ? <T v="caption">Dados insuficientes: são necessários 3 pedidos com todas as etapas registradas.</T> : (
              <>
                <T v="subtitle">Total: {fmtDias(ciclo.valor)} da solicitação à liberação do lote</T>
                <BarrasHorizontais formatar={fmtDias} linhas={ETAPAS_CICLO.map((e) => ({ rotulo: ROTULO[e], valor: Number(ciclo.extra?.[e] ?? 0), destaque: e === gargalo }))} />
                {gargalo ? <Aviso tom="warn">Gargalo: {ROTULO[gargalo].toLowerCase()} ({fmtNumero(Number(ciclo.extra?.[gargalo] ?? 0), 1)} dias). É a etapa onde reduzir tempo mais encurta o ciclo.</Aviso> : null}
              </>
            )}
          </Card>
        </>
      )}
    </Tela>
  );
}
