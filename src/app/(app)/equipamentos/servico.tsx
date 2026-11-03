// Uma tela para todas as ações de serviço: agendar, reagendar, iniciar corretiva, concluir, registrar realizado e cancelar.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Aviso, Botao, Campo, Card, Opcoes, Selecionar, Tela, T } from '@/components/ui';
import {
  agendarServico, cancelarServico, concluirServico, iniciarManutencao, obterServico, obterSituacao, reagendarServico,
  type EquipamentoSituacao, type Servico,
} from '@/data/equipamentos';
import { listarReferencias, type OpcaoRef } from '@/data/repositorioCadastros';
import { hoje, somarDias } from '@/domain/datas';
import { lerData, lerNumero } from '@/domain/entrada';
import { RESULTADOS, TIPOS_SERVICO, type ResultadoCalibracao, type TipoServico } from '@/domain/equipamentos';
import { fmtData } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

type Modo = 'agendar' | 'reagendar' | 'iniciar' | 'concluir' | 'registrar' | 'cancelar';

const TITULOS: Record<Modo, string> = {
  agendar: 'Agendar', reagendar: 'Reagendar', iniciar: 'Manutenção corretiva', concluir: 'Concluir serviço',
  registrar: 'Registrar serviço realizado', cancelar: 'Cancelar serviço',
};

const TIPOS_AGENDAVEIS = (exige: boolean) =>
  (Object.keys(TIPOS_SERVICO) as TipoServico[])
    .filter((t) => exige || t !== 'calibracao')
    .map((t) => ({ valor: t, rotulo: TIPOS_SERVICO[t] }));

export default function ServicoTela() {
  const p = useLocalSearchParams<{ modo: Modo; equipamento?: string; servico?: string; tipo?: TipoServico }>();
  const modo = p.modo;
  const { lab } = useSessao();
  const [servico, setServico] = useState<Servico | null>(null);
  const [eq, setEq] = useState<EquipamentoSituacao | null>(null);
  const [fornecedores, setFornecedores] = useState<OpcaoRef[]>([]);
  const [tipo, setTipo] = useState<TipoServico>(p.tipo ?? 'manutencao_preventiva');
  const [data, setData] = useState('');
  const [executor, setExecutor] = useState('');
  const [fornecedor, setFornecedor] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [custo, setCusto] = useState('');
  const [resultado, setResultado] = useState<ResultadoCalibracao | null>(null);
  const [certificado, setCertificado] = useState('');
  const [url, setUrl] = useState('');
  const [validaAte, setValidaAte] = useState('');
  const [incerteza, setIncerteza] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!lab) return;
    (async () => {
      const s = p.servico ? await obterServico(p.servico) : null;
      const e = await obterSituacao(p.equipamento ?? s?.equipamento_id ?? '');
      setServico(s);
      setEq(e);
      if (s) {
        setTipo(s.tipo);
        setExecutor(s.executor ?? '');
        setFornecedor(s.fornecedor_id);
      }
      setFornecedores(await listarReferencias(lab.id, 'fornecedores'));
    })().catch((x) => setErro(mensagemErro(x)));
  }, [lab, p.servico, p.equipamento]);

  if (!modo || !(modo in TITULOS)) return <Tela titulo="Serviço" voltar><Aviso>Ação desconhecida.</Aviso></Tela>;

  const calibracao = tipo === 'calibracao';
  const pedeData = modo === 'agendar' || modo === 'reagendar' || modo === 'concluir' || modo === 'registrar';
  const conclui = modo === 'concluir' || modo === 'registrar';
  const dataIso = data ? lerData(data) : null;
  const validaIso = validaAte ? lerData(validaAte) : null;
  const validaPadrao = conclui && calibracao && dataIso && eq?.periodicidade_calibracao_dias ? somarDias(dataIso, eq.periodicidade_calibracao_dias) : null;

  let pendencia: string | null = null;
  if (pedeData && !dataIso) pendencia = 'Informe a data (dd/mm/aaaa).';
  else if ((modo === 'agendar' || modo === 'reagendar') && dataIso! < hoje()) pendencia = 'A data não pode estar no passado.';
  else if (conclui && dataIso! > hoje()) pendencia = 'A data de realização não pode estar no futuro.';
  else if (conclui && calibracao && !resultado) pendencia = 'Informe o resultado da calibração.';
  else if (validaAte && !validaIso) pendencia = 'Validade inválida (dd/mm/aaaa).';
  else if ((modo === 'reagendar' || modo === 'cancelar') && !motivo.trim()) pendencia = 'Informe o motivo.';
  else if (modo === 'iniciar' && !descricao.trim()) pendencia = 'Descreva o problema.';

  async function confirmar() {
    if (pendencia || !eq) return;
    setEnviando(true);
    setErro(null);
    try {
      const opt = (s: string) => s.trim() || null;
      if (modo === 'agendar') {
        await agendarServico({ equipamento: eq.equipamento_id, tipo, data: dataIso!, executor: opt(executor), fornecedor, descricao: opt(descricao) });
      } else if (modo === 'reagendar') {
        await reagendarServico(servico!.id, dataIso!, motivo.trim());
      } else if (modo === 'iniciar') {
        await iniciarManutencao(eq.equipamento_id, descricao.trim(), servico?.id);
      } else if (modo === 'cancelar') {
        await cancelarServico(servico!.id, motivo.trim());
      } else {
        await concluirServico({
          servico: modo === 'concluir' ? servico!.id : null,
          equipamento: modo === 'registrar' ? eq.equipamento_id : null,
          tipo: modo === 'registrar' ? tipo : null,
          realizadoEm: dataIso!, descricao: opt(descricao), executor: opt(executor), fornecedor, custo: lerNumero(custo),
          resultado: calibracao ? resultado : null, numeroCertificado: calibracao ? opt(certificado) : null,
          certificadoUrl: calibracao ? opt(url) : null, validaAte: calibracao ? validaIso : null, incerteza: calibracao ? opt(incerteza) : null,
        });
      }
      router.back();
    } catch (x) {
      setErro(mensagemErro(x));
    } finally {
      setEnviando(false);
    }
  }

  const rotuloData = modo === 'agendar' ? 'Data agendada' : modo === 'reagendar' ? 'Nova data' : 'Data de realização';

  return (
    <Tela titulo={TITULOS[modo]} voltar>
      {eq ? (
        <Card className="gap-1">
          <T v="subtitle">{eq.nome}</T>
          <T v="code" className="text-ink-muted">{eq.codigo}</T>
          {servico ? <T v="caption">{TIPOS_SERVICO[servico.tipo]}{servico.agendado_para ? ` agendado para ${fmtData(servico.agendado_para)}` : ''}</T> : null}
        </Card>
      ) : null}
      {erro ? <Aviso>{erro}</Aviso> : null}

      {(modo === 'agendar' || modo === 'registrar') && eq ? (
        <Opcoes rotulo="Tipo de serviço" valor={tipo} onChange={setTipo} opcoes={TIPOS_AGENDAVEIS(eq.exige_calibracao)} />
      ) : null}

      {pedeData ? (
        <View className="gap-2">
          <Campo rotulo={rotuloData} placeholder="dd/mm/aaaa" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" />
          <View className="flex-row flex-wrap gap-2">
            {(conclui ? [['Hoje', 0], ['Ontem', -1]] : [['Em 7 dias', 7], ['Em 30 dias', 30]]).map(([r, n]) => (
              <View key={r} className="flex-1"><Botao tipo="secundario" titulo={String(r)} onPress={() => setData(fmtData(somarDias(hoje(), Number(n))))} /></View>
            ))}
          </View>
        </View>
      ) : null}

      {modo === 'agendar' || conclui ? (
        <>
          <Campo rotulo="Executor" placeholder="Técnico interno ou empresa" value={executor} onChangeText={setExecutor} />
          <Selecionar rotulo="Fornecedor" valor={fornecedor} onChange={setFornecedor}
            opcoes={fornecedores.filter((f) => f.ativo !== false).map((f) => ({ valor: f.id, rotulo: f.nome }))} />
        </>
      ) : null}

      {conclui && calibracao ? (
        <Card className="gap-4">
          <T v="subtitle">Resultado da calibração</T>
          <Opcoes rotulo="Resultado *" valor={resultado} onChange={setResultado} opcoes={RESULTADOS} />
          <Campo rotulo="Número do certificado" value={certificado} onChangeText={setCertificado} autoCapitalize="characters" />
          <Campo rotulo="Link do certificado" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
          <Campo rotulo="Válida até" placeholder="dd/mm/aaaa" value={validaAte} onChangeText={setValidaAte} keyboardType="numbers-and-punctuation"
            ajuda={validaPadrao ? `Vazio = ${fmtData(validaPadrao)} (realização + ${eq?.periodicidade_calibracao_dias} dias).` : 'Vazio = realização + periodicidade do cadastro.'} />
          <Campo rotulo="Incerteza / erro encontrado" value={incerteza} onChangeText={setIncerteza} />
        </Card>
      ) : null}

      {conclui ? <Campo rotulo="Custo (R$)" keyboardType="decimal-pad" value={custo} onChangeText={setCusto} /> : null}
      {modo !== 'cancelar' && modo !== 'reagendar' ? (
        <Campo rotulo={modo === 'iniciar' ? 'Problema / serviço *' : 'Descrição'} value={descricao} onChangeText={setDescricao} multiline
          ajuda={modo === 'iniciar' ? 'O equipamento fica "em manutenção" até a conclusão.' : undefined} />
      ) : null}
      {modo === 'reagendar' || modo === 'cancelar' ? <Campo rotulo="Motivo *" value={motivo} onChangeText={setMotivo} multiline /> : null}

      {pendencia ? <T v="caption">{pendencia}</T> : null}
      <Botao titulo={modo === 'cancelar' ? 'Cancelar serviço' : 'Confirmar'} tipo={modo === 'cancelar' ? 'perigo' : 'primario'}
        onPress={confirmar} carregando={enviando} desabilitado={!!pendencia || !eq} />
    </Tela>
  );
}
