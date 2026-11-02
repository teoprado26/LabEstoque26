// Componentes base do design system LabEstoque (tokens em tailwind.config.js).
import { router } from 'expo-router';
import { Check, ChevronDown, ChevronLeft } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LoteStatus } from '@/domain/tipos';
import type { Selo as SeloQualidade, StatusKpi } from '@/kpis/resultado';

type Variante = 'display' | 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'code' | 'kpi';

const VARIANTES: Record<Variante, string> = {
  display: 'font-sans-semibold text-display text-ink',
  title: 'font-sans-semibold text-title text-ink',
  subtitle: 'font-sans-semibold text-subtitle text-ink',
  body: 'font-sans text-body text-ink',
  label: 'font-sans-medium text-label text-ink',
  caption: 'font-sans text-caption text-ink-muted',
  code: 'font-mono text-code text-ink',
  kpi: 'font-mono-medium text-kpi text-ink',
};

export function T({ v = 'body', className = '', children, numberOfLines }: { v?: Variante; className?: string; children: ReactNode; numberOfLines?: number }) {
  return (
    <Text className={`${VARIANTES[v]} ${className}`} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Tela({ titulo, children, rolar = true, acao, voltar }: { titulo?: string; children: ReactNode; rolar?: boolean; acao?: ReactNode; voltar?: boolean }) {
  const corpo = (
    <View className="gap-4 px-4 pb-6">
      {voltar ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          className="min-h-10 flex-row items-center gap-1 self-start pt-2"
        >
          <ChevronLeft size={20} color="rgb(138 149 143)" />
          <T v="label" className="text-ink-muted">Voltar</T>
        </Pressable>
      ) : null}
      {titulo ? (
        <View className="flex-row items-center justify-between pt-2">
          <T v="display">{titulo}</T>
          {acao}
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {rolar ? <ScrollView keyboardShouldPersistTaps="handled">{corpo}</ScrollView> : corpo}
    </SafeAreaView>
  );
}

export function Card({ children, className = '', onPress }: { children: ReactNode; className?: string; onPress?: () => void }) {
  const cls = `rounded-lg border border-line bg-surface-raised p-4 ${className}`;
  return onPress ? (
    <Pressable onPress={onPress} className={`${cls} active:bg-surface-sunken`} accessibilityRole="button">
      {children}
    </Pressable>
  ) : (
    <View className={cls}>{children}</View>
  );
}

export function Botao({
  titulo, onPress, tipo = 'primario', desabilitado, carregando, icone,
}: {
  titulo: string; onPress: () => void; tipo?: 'primario' | 'secundario' | 'perigo';
  desabilitado?: boolean; carregando?: boolean; icone?: ReactNode;
}) {
  const fundo = tipo === 'primario' ? 'bg-primary border-primary' : 'bg-surface-raised border-line-strong';
  const texto = tipo === 'primario' ? 'text-on-primary' : tipo === 'perigo' ? 'text-status-crit' : 'text-ink';
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado || carregando}
      accessibilityRole="button"
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-md border px-4 ${fundo} ${desabilitado ? 'opacity-50' : 'active:opacity-80'}`}
    >
      {carregando ? <ActivityIndicator /> : icone}
      <Text className={`font-sans-medium text-label ${texto}`}>{titulo}</Text>
    </Pressable>
  );
}

export function Campo({ rotulo, ajuda, erro, ...props }: TextInputProps & { rotulo: string; ajuda?: string; erro?: string | null }) {
  return (
    <View className="gap-1">
      <T v="label">{rotulo}</T>
      <TextInput
        placeholderTextColor="rgb(138 149 143)"
        className={`min-h-12 rounded-md border bg-surface-raised px-3 font-sans text-body text-ink ${erro ? 'border-status-crit' : 'border-line-strong'}`}
        {...props}
      />
      {erro ? <T v="caption" className="text-status-crit">{erro}</T> : ajuda ? <T v="caption">{ajuda}</T> : null}
    </View>
  );
}

export function Opcoes<V extends string>({
  rotulo, valor, opcoes, onChange, ajuda, erro, desabilitado,
}: { rotulo: string; valor: V | null; opcoes: { valor: V; rotulo: string }[]; onChange: (v: V) => void; ajuda?: string; erro?: string | null; desabilitado?: boolean }) {
  return (
    <View className={`gap-1 ${desabilitado ? 'opacity-60' : ''}`} pointerEvents={desabilitado ? 'none' : 'auto'}>
      <T v="label">{rotulo}</T>
      <View className="flex-row flex-wrap gap-2">
        {opcoes.map((o) => {
          const ativo = o.valor === valor;
          return (
            <Pressable
              key={o.valor}
              onPress={() => onChange(o.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativo }}
              className={`min-h-10 justify-center rounded-sm border px-3 ${ativo ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface-raised'}`}
            >
              <Text className={`font-sans-medium text-label ${ativo ? 'text-primary' : 'text-ink'}`}>{o.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
      {erro ? <T v="caption" className="text-status-crit">{erro}</T> : ajuda ? <T v="caption">{ajuda}</T> : null}
    </View>
  );
}

export function Interruptor({ rotulo, ajuda, valor, onChange, desabilitado }: { rotulo: string; ajuda?: string; valor: boolean; onChange: (v: boolean) => void; desabilitado?: boolean }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 gap-1">
        <T v="label">{rotulo}</T>
        {ajuda ? <T v="caption">{ajuda}</T> : null}
      </View>
      <Switch value={valor} onValueChange={onChange} disabled={desabilitado} accessibilityLabel={rotulo}
        trackColor={{ true: 'rgb(15 107 92)', false: 'rgb(138 149 143)' }} thumbColor="#ffffff" />
    </View>
  );
}

/** Seleção numa lista longa: mostra o escolhido; ao tocar, abre busca e opções. */
export function Selecionar({
  rotulo, valor, opcoes, onChange, ajuda, erro, permitirVazio = true, desabilitado,
}: {
  rotulo: string; valor: string | null; opcoes: { valor: string; rotulo: string; recuo?: number }[];
  onChange: (v: string | null) => void; ajuda?: string; erro?: string | null; permitirVazio?: boolean; desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const atual = opcoes.find((o) => o.valor === valor);
  const filtradas = opcoes.filter((o) => !busca || o.rotulo.toLowerCase().includes(busca.toLowerCase()));
  const escolher = (v: string | null) => {
    onChange(v);
    setAberto(false);
    setBusca('');
  };
  return (
    <View className="gap-1">
      <T v="label">{rotulo}</T>
      <Pressable
        onPress={() => !desabilitado && setAberto((a) => !a)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto, disabled: desabilitado }}
        className={`min-h-12 flex-row items-center justify-between rounded-md border bg-surface-raised px-3 ${erro ? 'border-status-crit' : 'border-line-strong'} ${desabilitado ? 'opacity-60' : ''}`}
      >
        <Text className={`flex-1 font-sans text-body ${atual ? 'text-ink' : 'text-ink-muted'}`} numberOfLines={1}>{atual?.rotulo ?? 'Nenhum'}</Text>
        <ChevronDown size={20} color="rgb(138 149 143)" />
      </Pressable>
      {aberto ? (
        <View className="overflow-hidden rounded-md border border-line bg-surface-raised">
          {opcoes.length > 8 ? (
            <TextInput placeholder="Buscar" placeholderTextColor="rgb(138 149 143)" value={busca} onChangeText={setBusca} autoFocus
              className="min-h-12 border-b border-line px-3 font-sans text-body text-ink" />
          ) : null}
          {permitirVazio ? (
            <Pressable onPress={() => escolher(null)} className="min-h-12 justify-center px-3 active:bg-surface-sunken">
              <Text className="font-sans text-body text-ink-muted">Nenhum</Text>
            </Pressable>
          ) : null}
          {filtradas.slice(0, 50).map((o) => (
            <Pressable key={o.valor} onPress={() => escolher(o.valor)} accessibilityRole="radio" accessibilityState={{ selected: o.valor === valor }}
              className={`min-h-12 flex-row items-center gap-2 border-t border-line px-3 active:bg-surface-sunken ${o.valor === valor ? 'bg-primary-soft' : ''}`}
              style={{ paddingLeft: 12 + (o.recuo ?? 0) * 16 }}>
              <Text className={`flex-1 font-sans text-body ${o.valor === valor ? 'text-primary' : 'text-ink'}`}>{o.rotulo}</Text>
              {o.valor === valor ? <Check size={18} color="rgb(15 107 92)" /> : null}
            </Pressable>
          ))}
          {filtradas.length === 0 ? <View className="p-3"><T v="caption">Nada encontrado.</T></View> : null}
        </View>
      ) : null}
      {erro ? <T v="caption" className="text-status-crit">{erro}</T> : ajuda ? <T v="caption">{ajuda}</T> : null}
    </View>
  );
}

type Tom = 'ok' | 'warn' | 'crit' | 'primary' | 'neutro';
const TONS: Record<Tom, string> = {
  ok: 'bg-status-ok-soft text-status-ok',
  warn: 'bg-status-warn-soft text-status-warn',
  crit: 'bg-status-crit-soft text-status-crit',
  primary: 'bg-primary-soft text-primary',
  neutro: 'bg-surface-sunken text-ink-muted',
};

export function Selo({ tom, texto, tracejado }: { tom: Tom; texto: string; tracejado?: boolean }) {
  const [bg, fg] = TONS[tom].split(' ');
  return (
    <View className={`self-start rounded-sm px-2 py-0.5 ${bg} ${tracejado ? 'border border-dashed border-line-strong' : ''}`}>
      <Text className={`font-sans-medium text-caption ${fg}`}>{texto}</Text>
    </View>
  );
}

const TOM_LOTE: Record<LoteStatus, Tom> = {
  QUARENTENA: 'warn', LIBERADO: 'ok', ABERTO: 'primary', BLOQUEADO: 'crit', VENCIDO: 'crit', BAIXADO: 'neutro',
};
export const SeloLote = ({ status }: { status: LoteStatus }) => <Selo tom={TOM_LOTE[status]} texto={status} />;

export function SeloDado({ selo }: { selo: SeloQualidade }) {
  if (selo === 'Real') return <Selo tom="neutro" texto="Real" />;
  if (selo === 'Estimado') return <Selo tom="warn" texto="Estimado" tracejado />;
  if (selo === 'Projetado') return <Selo tom="primary" texto="Projetado" tracejado />;
  return <Selo tom="neutro" texto="Dados insuficientes" />;
}

export function SeloStatus({ status }: { status: StatusKpi }) {
  if (status === 'ok') return <Selo tom="ok" texto="✓ Na meta" />;
  if (status === 'alerta') return <Selo tom="warn" texto="! Atenção" />;
  if (status === 'critico') return <Selo tom="crit" texto="✕ Fora da meta" />;
  return null;
}

export function Aviso({ tom = 'crit', children }: { tom?: 'crit' | 'warn' | 'ok'; children: ReactNode }) {
  return (
    <View className={`rounded-md px-3 py-2 ${TONS[tom].split(' ')[0]}`}>
      <Text className={`font-sans text-label ${TONS[tom].split(' ')[1]}`}>{children}</Text>
    </View>
  );
}

export const Carregando = () => (
  <View className="flex-1 items-center justify-center bg-surface p-6">
    <ActivityIndicator />
  </View>
);
