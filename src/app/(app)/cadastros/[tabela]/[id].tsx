import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { caminho, ordenarArvore, paisPossiveis } from '@/cadastros/arvoreLocais';
import { CADASTROS, ehTabelaCadastro, type Registro, type TabelaCadastro } from '@/cadastros/config';
import { camposDe, paraRegistro, paraValores, type Valor, type Valores } from '@/cadastros/formulario';
import { FormularioCadastro, type OpcoesRef } from '@/components/FormularioCadastro';
import { Aviso, Botao, Carregando, Selo, Tela, T } from '@/components/ui';
import { listarMembros, listarReferencias, obterRegistro, salvarRegistro, type OpcaoRef } from '@/data/repositorioCadastros';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

export default function EditarCadastro() {
  const { tabela, id } = useLocalSearchParams<{ tabela: string; id: string }>();
  const { lab, pode } = useSessao();
  const def = ehTabelaCadastro(tabela ?? '') ? CADASTROS[tabela as TabelaCadastro] : null;
  const novo = id === 'novo';
  const somenteLeitura = !pode('gestor');

  const [original, setOriginal] = useState<Registro | null>(null);
  const [valores, setValores] = useState<Valores | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, OpcaoRef[]>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!lab || !def) return;
    const camposRef = camposDe(def).filter((c) => c.tipo === 'ref' || c.tipo === 'usuario');
    Promise.all([
      novo ? Promise.resolve(null) : obterRegistro(def.tabela, id!),
      ...camposRef.map((c) => (c.tipo === 'ref' ? listarReferencias(lab.id, c.tabela) : listarMembros(lab.id))),
    ])
      .then(([registro, ...listas]) => {
        if (!novo && !registro) throw new Error('Registro não encontrado.');
        setOriginal(registro as Registro | null);
        setValores(paraValores(def, registro as Registro | null));
        setRefs(Object.fromEntries(camposRef.map((c, i) => [c.chave, listas[i] as OpcaoRef[]])));
      })
      .catch((e) => setErro(mensagemErro(e)));
  }, [lab, def, id, novo]);

  // Opções dos campos de referência; em locais, o "pai" depende do nível escolhido.
  const opcoesRef = useMemo<OpcoesRef>(() => {
    const saida: OpcoesRef = {};
    for (const [chave, lista] of Object.entries(refs)) {
      if (def?.tabela === 'locais' && chave === 'pai_id') {
        const nos = lista.map((l) => ({ ...l, pai_id: l.pai_id ?? null, nivel: l.nivel ?? 'posicao' }));
        const possiveis = new Set(paisPossiveis(nos, String(valores?.nivel ?? 'posicao'), novo ? null : id!).map((l) => l.id));
        saida[chave] = ordenarArvore(nos)
          .filter(({ local }) => possiveis.has(local.id))
          .map(({ local, profundidade }) => ({ valor: local.id, rotulo: local.nome, recuo: profundidade }));
      } else {
        saida[chave] = lista
          .filter((o) => o.ativo !== false || o.id === valores?.[chave])
          .map((o) => ({ valor: o.id, rotulo: o.ativo === false ? `${o.nome} (inativo)` : o.nome }));
      }
    }
    return saida;
  }, [refs, def, valores, id, novo]);

  if (!def) return <Tela titulo="Cadastro" voltar><Aviso>Cadastro desconhecido.</Aviso></Tela>;
  if (!valores) return erro ? <Tela titulo={def.titulo} voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;

  const mudar = (chave: string, v: Valor) => {
    setSalvo(false);
    setValores((atual) => {
      const prox = { ...atual!, [chave]: v };
      // Ao mudar o nível de um local, o pai escolhido pode deixar de ser válido.
      if (def.tabela === 'locais' && chave === 'nivel' && prox.pai_id) {
        const nos = (refs.pai_id ?? []).map((l) => ({ ...l, pai_id: l.pai_id ?? null, nivel: l.nivel ?? 'posicao' }));
        if (!paisPossiveis(nos, String(v), novo ? null : id!).some((l) => l.id === prox.pai_id)) prox.pai_id = null;
      }
      return prox;
    });
    setErros((e) => {
      const { [chave]: _, ...resto } = e;
      return resto;
    });
  };

  async function salvar() {
    if (!lab || !def || !valores) return;
    const { registro, erros: novosErros } = paraRegistro(def, valores);
    setErros(novosErros);
    if (Object.keys(novosErros).length) {
      setErro('Corrija os campos destacados.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const novoId = await salvarRegistro(lab.id, def.tabela, novo ? null : id!, original, registro);
      setSalvo(true);
      if (novo) router.replace(`/cadastros/${def.tabela}/${novoId}`);
      else setOriginal({ ...original, ...registro });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const titulo = novo ? `Novo ${def.singular}` : String(original?.nome ?? def.singular);
  const pai = def.tabela === 'locais' && !novo && original ? caminho((refs.pai_id ?? []).map((l) => ({ ...l, pai_id: l.pai_id ?? null, nivel: l.nivel ?? '' })), String(original.id)) : null;

  return (
    <Tela titulo={titulo} voltar>
      {pai ? <T v="caption">{pai}</T> : null}
      {somenteLeitura ? <Selo tom="neutro" texto="Somente leitura" /> : null}
      {!novo && original?.ativo === false ? <Aviso tom="warn">Este cadastro está inativo e não aparece nas operações.</Aviso> : null}
      <FormularioCadastro def={def} valores={valores} erros={erros} onChange={mudar} opcoesRef={opcoesRef} somenteLeitura={somenteLeitura} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {salvo ? <Aviso tom="ok">Salvo. A alteração foi registrada na trilha de auditoria.</Aviso> : null}
      {!somenteLeitura ? <Botao titulo={novo ? `Cadastrar ${def.singular}` : 'Salvar alterações'} onPress={salvar} carregando={salvando} /> : null}
    </Tela>
  );
}
