// Kit das telas do LabEstoque, montado sobre os componentes do Simple Design System (./sds).
// Os nomes em português continuam os mesmos nas telas; o visual e as variantes são os do SDS.
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LoteStatus } from '@/domain/tipos';
import type { Selo as SeloQualidade, StatusKpi } from '@/kpis/resultado';
import {
  Button, Card as SdsCard, InputField, Notification, SelectField, SwitchField, Tag, TagToggleGroup,
  Text, TextCode, TextHeading, TextHeadingSmall, TextSmall, TextSmallStrong, TextStrong, TextValue, useCor, type TagScheme,
} from './sds';

type Variante = 'display' | 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'code' | 'kpi';

const VARIANTES = {
  display: TextHeading,
  title: TextHeadingSmall,
  subtitle: TextStrong,
  body: Text,
  label: TextSmallStrong,
  caption: TextSmall,
  code: TextCode,
  kpi: TextValue,
} satisfies Record<Variante, unknown>;

export function T({ v = 'body', className = '', children, numberOfLines }: { v?: Variante; className?: string; children: ReactNode; numberOfLines?: number }) {
  const C = VARIANTES[v];
  return <C className={className} numberOfLines={numberOfLines}>{children}</C>;
}

export function Tela({ titulo, children, rolar = true, acao, voltar }: { titulo?: string; children: ReactNode; rolar?: boolean; acao?: ReactNode; voltar?: boolean }) {
  const cor = useCor();
  const corpo = (
    <View className="gap-4 px-4 pb-6">
      {voltar ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          className="min-h-10 flex-row items-center gap-1 self-start pt-2"
        >
          <ChevronLeft size={20} color={cor('icon-secondary')} />
          <TextSmall>Voltar</TextSmall>
        </Pressable>
      ) : null}
      {titulo ? (
        <View className="flex-row items-center justify-between gap-3 pt-2">
          <TextHeading className="flex-1">{titulo}</TextHeading>
          {acao}
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView className="flex-1 bg-default" edges={['top']}>
      {rolar ? <ScrollView keyboardShouldPersistTaps="handled">{corpo}</ScrollView> : corpo}
    </SafeAreaView>
  );
}

export function Card({ children, className = '', onPress, selecionado }: { children: ReactNode; className?: string; onPress?: () => void; selecionado?: boolean }) {
  return <SdsCard padding="400" onPress={onPress} className={className} selected={selecionado}>{children}</SdsCard>;
}

export function Botao({
  titulo, onPress, tipo = 'primario', desabilitado, carregando, icone,
}: {
  titulo: string; onPress: () => void; tipo?: 'primario' | 'secundario' | 'perigo' | 'sutil';
  desabilitado?: boolean; carregando?: boolean; icone?: Parameters<typeof Button>[0]['iconStart'];
}) {
  const variant = tipo === 'primario' ? 'primary' : tipo === 'perigo' ? 'danger-primary' : tipo === 'sutil' ? 'subtle' : 'neutral';
  return <Button variant={variant} onPress={onPress} isDisabled={desabilitado} isLoading={carregando} iconStart={icone}>{titulo}</Button>;
}

export function Campo({ rotulo, ajuda, erro, editable, ...props }: TextInputProps & { rotulo: string; ajuda?: string; erro?: string | null }) {
  return <InputField label={rotulo} description={ajuda} errorMessage={erro} isDisabled={editable === false} {...props} />;
}

export function Opcoes<V extends string>({
  rotulo, valor, opcoes, onChange, ajuda, erro, desabilitado,
}: { rotulo: string; valor: V | null; opcoes: { valor: V; rotulo: string }[]; onChange: (v: V) => void; ajuda?: string; erro?: string | null; desabilitado?: boolean }) {
  return (
    <TagToggleGroup label={rotulo} value={valor} onChange={onChange} description={ajuda} errorMessage={erro} isDisabled={desabilitado}
      options={opcoes.map((o) => ({ value: o.valor, label: o.rotulo }))} />
  );
}

export function Interruptor({ rotulo, ajuda, valor, onChange, desabilitado }: { rotulo: string; ajuda?: string; valor: boolean; onChange: (v: boolean) => void; desabilitado?: boolean }) {
  return <SwitchField label={rotulo} description={ajuda} isSelected={valor} onChange={onChange} isDisabled={desabilitado} />;
}

/** Seleção numa lista longa (SelectField do SDS, com busca quando há muitas opções). */
export function Selecionar({
  rotulo, valor, opcoes, onChange, ajuda, erro, permitirVazio = true, desabilitado,
}: {
  rotulo: string; valor: string | null; opcoes: { valor: string; rotulo: string; recuo?: number }[];
  onChange: (v: string | null) => void; ajuda?: string; erro?: string | null; permitirVazio?: boolean; desabilitado?: boolean;
}) {
  return (
    <SelectField label={rotulo} value={valor} onChange={onChange} description={ajuda} errorMessage={erro} allowEmpty={permitirVazio} isDisabled={desabilitado}
      placeholder="Nenhum" options={opcoes.map((o) => ({ value: o.valor, label: o.rotulo, indent: o.recuo }))} />
  );
}

type Tom = 'ok' | 'warn' | 'crit' | 'primary' | 'neutro';
const ESQUEMA: Record<Tom, TagScheme> = { ok: 'positive', warn: 'warning', crit: 'danger', primary: 'brand', neutro: 'neutral' };

/** Tag do SDS (variante secondary). Status sempre leva palavra e, quando aplicável, ícone: cor nunca é o único sinal. */
export function Selo({ tom, texto, tracejado }: { tom: Tom; texto: string; tracejado?: boolean }) {
  const tag = <Tag scheme={ESQUEMA[tom]}>{texto}</Tag>;
  return tracejado ? <View className="self-start rounded-md border border-dashed border-default-secondary">{tag}</View> : tag;
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

/** Notification do SDS: alert (erro), warning, positive. */
export function Aviso({ tom = 'crit', children }: { tom?: 'crit' | 'warn' | 'ok'; children: ReactNode }) {
  return <Notification variant={tom === 'crit' ? 'alert' : tom === 'warn' ? 'warning' : 'positive'}>{children}</Notification>;
}

export function Carregando() {
  const cor = useCor();
  return (
    <View className="flex-1 items-center justify-center bg-default p-6">
      <ActivityIndicator color={cor('icon-default')} />
    </View>
  );
}
