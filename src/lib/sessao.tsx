import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type Perfil = 'administrador' | 'gestor' | 'tecnico' | 'solicitante' | 'coordenador' | 'auditor';

export interface Laboratorio {
  id: string;
  nome: string;
  perfis: Perfil[];
}

interface Sessao {
  carregando: boolean;
  sessao: Session | null;
  labs: Laboratorio[];
  lab: Laboratorio | null;
  escolherLab: (id: string) => void;
  recarregarLabs: () => Promise<void>;
  pode: (...perfis: Perfil[]) => boolean;
  sair: () => Promise<void>;
}

const Ctx = createContext<Sessao | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [labs, setLabs] = useState<Laboratorio[]>([]);
  const [labId, setLabId] = useState<string | null>(null);

  const recarregarLabs = useCallback(async () => {
    const { data, error } = await supabase
      .from('lab_membros')
      .select('perfil, laboratorios ( id, nome )')
      .eq('ativo', true);
    if (error || !data) {
      setLabs([]);
      return;
    }
    const porLab = new Map<string, Laboratorio>();
    for (const row of data as unknown as { perfil: Perfil; laboratorios: { id: string; nome: string } }[]) {
      const l = porLab.get(row.laboratorios.id) ?? { ...row.laboratorios, perfis: [] };
      l.perfis.push(row.perfil);
      porLab.set(l.id, l);
    }
    const lista = [...porLab.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    setLabs(lista);
    setLabId((atual) => (atual && porLab.has(atual) ? atual : (lista[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
      if (data.session) recarregarLabs();
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s);
      // O Supabase pede para não chamar a API dentro deste callback: adia para depois dele.
      if (s) setTimeout(() => recarregarLabs(), 0);
      else setLabs([]);
    });
    return () => data.subscription.unsubscribe();
  }, [recarregarLabs]);

  const lab = labs.find((l) => l.id === labId) ?? null;

  const valor = useMemo<Sessao>(
    () => ({
      carregando,
      sessao,
      labs,
      lab,
      escolherLab: setLabId,
      recarregarLabs,
      pode: (...perfis) => !!lab && (lab.perfis.includes('administrador') || perfis.some((p) => lab.perfis.includes(p))),
      sair: async () => {
        await supabase.auth.signOut();
      },
    }),
    [carregando, sessao, labs, lab, recarregarLabs],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): Sessao {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSessao fora do SessaoProvider');
  return v;
}
