// Componentes do Simple Design System (github.com/figma/sds) recriados em React Native.
// Nomes, variantes e medidas seguem os primitivos do SDS (src/ui/primitives); as cores vêm dos tokens em src/theme.
import { useColorScheme } from 'nativewind';
import { Check, ChevronDown, Eye, EyeOff, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, Text as RNText, TextInput, View, type TextInputProps } from 'react-native';
import { HEX, type Cor } from '@/theme/tokens';

/** Cor de um token em hex, no tema atual (para ícones e componentes nativos que não aceitam className). */
export function useCor() {
  const { colorScheme } = useColorScheme();
  const tema = colorScheme === 'dark' ? 'dark' : 'light';
  return (c: Cor) => HEX[tema][c];
}

// ---------------------------------------------------------------- Text
type TextBase = { children: ReactNode; className?: string; numberOfLines?: number };
const texto = (cls: string) =>
  function SdsText({ children, className = '', numberOfLines }: TextBase) {
    return <RNText className={`${cls} ${className}`} numberOfLines={numberOfLines}>{children}</RNText>;
  };

export const Text = texto('font-sans text-body text-default');
export const TextStrong = texto('font-sans-semibold text-body text-default');
export const TextSmall = texto('font-sans text-body-small text-secondary');
export const TextSmallStrong = texto('font-sans-semibold text-body-small text-default');
export const TextCode = texto('font-mono text-code text-default');
export const TextHeading = texto('font-sans-semibold text-heading text-default');
export const TextHeadingSmall = texto('font-sans-semibold text-heading-small text-default');
export const TextSubheading = texto('font-sans text-subheading text-secondary');
/** Valor numérico de destaque (KPIs): Heading large com algarismos tabulares. */
export function TextValue({ children, className = '' }: TextBase) {
  return <RNText className={`font-sans-semibold text-heading-large text-default ${className}`} style={{ fontVariant: ['tabular-nums'] }}>{children}</RNText>;
}

// ---------------------------------------------------------------- Button
export type ButtonVariant = 'primary' | 'neutral' | 'subtle' | 'danger-primary' | 'danger-subtle';

const BOTAO: Record<ButtonVariant, { caixa: string; texto: string; icone: Cor; pressionado: string }> = {
  primary: { caixa: 'bg-brand border-brand', texto: 'text-on-brand', icone: 'icon-on-brand', pressionado: 'active:bg-brand-hover' },
  neutral: { caixa: 'bg-secondary border-default', texto: 'text-default', icone: 'icon-default', pressionado: 'active:bg-secondary-hover' },
  subtle: { caixa: 'bg-transparent border-transparent', texto: 'text-brand', icone: 'icon-brand', pressionado: 'active:bg-default-hover' },
  'danger-primary': { caixa: 'bg-danger border-danger-secondary', texto: 'text-on-danger', icone: 'icon-on-brand', pressionado: 'active:bg-danger-hover' },
  'danger-subtle': { caixa: 'bg-transparent border-transparent', texto: 'text-danger', icone: 'icon-danger', pressionado: 'active:bg-danger-tertiary' },
};

export function Button({
  children, onPress, variant = 'primary', size = 'medium', isDisabled, isLoading, iconStart: Icone, accessibilityLabel,
}: {
  children: ReactNode; onPress: () => void; variant?: ButtonVariant; size?: 'small' | 'medium';
  isDisabled?: boolean; isLoading?: boolean; iconStart?: LucideIcon; accessibilityLabel?: string;
}) {
  const cor = useCor();
  const v = BOTAO[variant];
  const desab = isDisabled || isLoading;
  // SDS: padding space-300 (medium) / space-200 (small), radius-200, borda 1px, gap space-200. Mínimo de 48px de toque no medium.
  const tamanho = size === 'small' ? 'min-h-9 px-2 py-2' : 'min-h-12 px-3 py-3';
  return (
    <Pressable
      onPress={onPress}
      disabled={desab}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!desab, busy: !!isLoading }}
      className={`flex-row items-center justify-center gap-2 rounded-md border ${tamanho} ${desab ? (variant.endsWith('subtle') ? 'bg-transparent border-transparent' : 'bg-disabled border-disabled') : `${v.caixa} ${v.pressionado}`}`}
    >
      {isLoading ? <ActivityIndicator color={cor(desab ? 'text-disabled' : v.icone)} /> : Icone ? <Icone size={size === 'small' ? 14 : 16} color={cor(desab ? 'text-disabled' : v.icone)} /> : null}
      <RNText className={`font-sans ${size === 'small' ? 'text-body-small' : 'text-body'} ${desab ? 'text-disabled' : v.texto}`}>{children}</RNText>
    </Pressable>
  );
}

/** ButtonGroup do SDS: botões lado a lado com gap space-400; cada filho ocupa a mesma largura. */
export function ButtonGroup({ children }: { children: ReactNode[] | ReactNode }) {
  const itens = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return <View className="flex-row gap-4">{itens.map((c, i) => <View key={i} className="flex-1">{c}</View>)}</View>;
}

export function IconButton({ icon: Icone, onPress, label, variant = 'neutral' }: { icon: LucideIcon; onPress: () => void; label: string; variant?: ButtonVariant }) {
  const cor = useCor();
  const v = BOTAO[variant];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      className={`h-12 w-12 items-center justify-center rounded-md border ${v.caixa} ${v.pressionado}`}>
      <Icone size={20} color={cor(v.icone)} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- Field (label, description, error)
function Field({ label, description, errorMessage, isDisabled, children }: { label: string; description?: string; errorMessage?: string | null; isDisabled?: boolean; children: ReactNode }) {
  return (
    <View className="w-full">
      <RNText className={`mb-2 font-sans text-body ${isDisabled ? 'text-disabled' : 'text-default'}`}>{label}</RNText>
      {children}
      {description && !errorMessage ? <RNText className={`mt-2 font-sans text-body-small ${isDisabled ? 'text-disabled' : 'text-secondary'}`}>{description}</RNText> : null}
      {errorMessage ? <RNText className="mt-2 font-sans text-body-small text-danger">{errorMessage}</RNText> : null}
    </View>
  );
}

export type InputFieldProps = Omit<TextInputProps, 'editable'> & {
  label: string; description?: string; errorMessage?: string | null; isDisabled?: boolean;
};

export function InputField({ label, description, errorMessage, isDisabled, multiline, secureTextEntry, ...props }: InputFieldProps) {
  const cor = useCor();
  const [foco, setFoco] = useState(false);
  // Campos de senha ganham o botão de mostrar/ocultar (como o Input com ícone final do SDS).
  const [visivel, setVisivel] = useState(false);
  // Desvio do SDS: borda de repouso em border-default-secondary (4,6:1); a border-default do SDS (1,4:1) não atinge 3:1 para controles.
  const borda = isDisabled ? 'border-disabled' : errorMessage ? 'border-danger' : foco ? 'border-brand-secondary' : 'border-default-secondary';
  return (
    <Field label={label} description={description} errorMessage={errorMessage} isDisabled={isDisabled}>
      <View className="justify-center">
        <TextInput
          {...props}
          multiline={multiline}
          secureTextEntry={secureTextEntry && !visivel}
          editable={!isDisabled}
          onFocus={(e) => { setFoco(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFoco(false); props.onBlur?.(e); }}
          placeholderTextColor={cor('text-tertiary')}
          aria-invalid={!!errorMessage}
          className={`w-full rounded-md border px-4 py-[10px] font-sans text-body ${secureTextEntry ? 'pr-12' : ''} ${multiline ? 'min-h-20' : 'min-h-12'} ${isDisabled ? 'bg-disabled text-disabled' : 'bg-default text-default'} ${borda}`}
          style={multiline ? { textAlignVertical: 'top' } : undefined}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setVisivel((v) => !v)} accessibilityRole="button" accessibilityLabel={visivel ? 'Ocultar senha' : 'Mostrar senha'}
            hitSlop={8} className="absolute right-1 h-10 w-10 items-center justify-center rounded-md active:bg-default-hover">
            {visivel ? <EyeOff size={20} color={cor('icon-secondary')} /> : <Eye size={20} color={cor('icon-secondary')} />}
          </Pressable>
        ) : null}
      </View>
    </Field>
  );
}

export const TextareaField = (p: InputFieldProps) => <InputField {...p} multiline />;

export function SelectField({
  label, description, errorMessage, isDisabled, value, onChange, options, placeholder = 'Selecione', allowEmpty = true,
}: {
  label: string; description?: string; errorMessage?: string | null; isDisabled?: boolean;
  value: string | null; onChange: (v: string | null) => void; options: { value: string; label: string; indent?: number }[];
  placeholder?: string; allowEmpty?: boolean;
}) {
  const cor = useCor();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const atual = options.find((o) => o.value === value);
  const filtradas = options.filter((o) => !busca || o.label.toLowerCase().includes(busca.toLowerCase()));
  const escolher = (v: string | null) => { onChange(v); setAberto(false); setBusca(''); };
  return (
    <Field label={label} description={description} errorMessage={errorMessage} isDisabled={isDisabled}>
      <Pressable
        onPress={() => !isDisabled && setAberto((a) => !a)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto, disabled: isDisabled }}
        className={`min-h-12 w-full flex-row items-center justify-between gap-2 rounded-md border py-[10px] pl-4 pr-3 ${isDisabled ? 'bg-disabled border-disabled' : `bg-default ${errorMessage ? 'border-danger' : aberto ? 'border-brand-secondary' : 'border-default-secondary'}`}`}
      >
        <RNText className={`flex-1 font-sans text-body ${isDisabled ? 'text-disabled' : atual ? 'text-default' : 'text-tertiary'}`} numberOfLines={1}>{atual?.label ?? placeholder}</RNText>
        <ChevronDown size={16} color={cor(isDisabled ? 'text-disabled' : 'icon-default')} />
      </Pressable>
      {aberto ? (
        <View className="mt-2 overflow-hidden rounded-md border border-default bg-default">
          {options.length > 8 ? (
            <TextInput placeholder="Buscar" placeholderTextColor={cor('text-tertiary')} value={busca} onChangeText={setBusca} autoFocus
              className="min-h-12 border-b border-default px-4 font-sans text-body text-default" />
          ) : null}
          {allowEmpty ? (
            <Pressable onPress={() => escolher(null)} className="min-h-12 justify-center px-4 active:bg-default-hover">
              <RNText className="font-sans text-body text-tertiary">Nenhum</RNText>
            </Pressable>
          ) : null}
          {filtradas.slice(0, 50).map((o) => (
            <Pressable key={o.value} onPress={() => escolher(o.value)} accessibilityRole="radio" accessibilityState={{ selected: o.value === value }}
              className={`min-h-12 flex-row items-center gap-2 border-t border-default pr-4 active:bg-default-hover ${o.value === value ? 'bg-secondary' : ''}`}
              style={{ paddingLeft: 16 + (o.indent ?? 0) * 16 }}>
              <RNText className="flex-1 font-sans text-body text-default">{o.label}</RNText>
              {o.value === value ? <Check size={16} color={cor('icon-default')} /> : null}
            </Pressable>
          ))}
          {filtradas.length === 0 ? <RNText className="p-4 font-sans text-body-small text-secondary">Nada encontrado.</RNText> : null}
        </View>
      ) : null}
    </Field>
  );
}

// ---------------------------------------------------------------- Switch
export function SwitchField({ label, description, isSelected, onChange, isDisabled }: { label: string; description?: string; isSelected: boolean; onChange: (v: boolean) => void; isDisabled?: boolean }) {
  // SDS: trilho 40×24 (space-400 + space-600), botão 16px, padding 4, raio total.
  const trilho = isDisabled ? 'bg-disabled border-disabled' : isSelected ? 'bg-brand border-brand' : 'bg-secondary border-default-secondary';
  const cor = useCor();
  return (
    <Pressable onPress={() => !isDisabled && onChange(!isSelected)} accessibilityRole="switch" accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      accessibilityLabel={label} className="min-h-12 flex-row items-center gap-3">
      <View className="flex-1 gap-1">
        <RNText className={`font-sans text-body ${isDisabled ? 'text-disabled' : 'text-default'}`}>{label}</RNText>
        {description ? <RNText className={`font-sans text-body-small ${isDisabled ? 'text-disabled' : 'text-secondary'}`}>{description}</RNText> : null}
      </View>
      <View className={`h-6 w-10 justify-center rounded-full border p-1 ${trilho}`}>
        <View className="h-4 w-4 rounded-full"
          style={{ alignSelf: isSelected ? 'flex-end' : 'flex-start', backgroundColor: cor(isDisabled ? 'text-disabled' : isSelected ? 'icon-on-brand' : 'icon-secondary') }} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Tag
export type TagScheme = 'brand' | 'danger' | 'positive' | 'warning' | 'neutral';
const TAG: Record<TagScheme, Record<'primary' | 'secondary', [string, string]>> = {
  brand: { primary: ['bg-brand', 'text-on-brand'], secondary: ['bg-brand-secondary', 'text-on-brand-secondary'] },
  danger: { primary: ['bg-danger', 'text-on-danger'], secondary: ['bg-danger-secondary', 'text-on-danger-secondary'] },
  positive: { primary: ['bg-positive', 'text-on-brand'], secondary: ['bg-positive-secondary', 'text-on-positive-secondary'] },
  warning: { primary: ['bg-warning', 'text-default'], secondary: ['bg-warning-secondary', 'text-on-warning-secondary'] },
  neutral: { primary: ['bg-tertiary', 'text-default'], secondary: ['bg-secondary', 'text-default'] },
};

export function Tag({ children, scheme = 'brand', variant = 'secondary' }: { children: ReactNode; scheme?: TagScheme; variant?: 'primary' | 'secondary' }) {
  const [bg, fg] = TAG[scheme][variant];
  // SDS: padding space-200, radius-200, Body base. No app usamos Body small para caber em listas densas.
  return (
    <View className={`self-start rounded-md px-2 py-1 ${bg}`}>
      <RNText className={`font-sans text-body-small ${fg}`}>{children}</RNText>
    </View>
  );
}

/** TagToggleGroup do SDS: escolha única entre opções curtas. */
export function TagToggleGroup<V extends string>({
  label, value, options, onChange, description, errorMessage, isDisabled,
}: {
  label: string; value: V | null; options: { value: V; label: string }[]; onChange: (v: V) => void;
  description?: string; errorMessage?: string | null; isDisabled?: boolean;
}) {
  return (
    <Field label={label} description={description} errorMessage={errorMessage} isDisabled={isDisabled}>
      <View className="flex-row flex-wrap gap-2" pointerEvents={isDisabled ? 'none' : 'auto'}>
        {options.map((o) => {
          const sel = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: sel, disabled: isDisabled }}
              // Desvio do SDS: texto não selecionado em text-on-brand-tertiary; o text-brand-tertiary do SDS fica em 4,2:1.
              className={`min-h-10 justify-center rounded-md px-3 ${isDisabled ? 'bg-disabled' : sel ? 'bg-brand' : 'bg-brand-tertiary active:bg-brand-secondary'}`}>
              <RNText className={`font-sans text-body-small ${isDisabled ? 'text-disabled' : sel ? 'text-on-brand' : 'text-on-brand-tertiary'}`}>{o.label}</RNText>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

// ---------------------------------------------------------------- Notification
export type NotificationTone = 'message' | 'alert' | 'warning' | 'positive';
const NOTIF: Record<NotificationTone, { caixa: string; texto: string; icone: Cor; Icone: LucideIcon }> = {
  message: { caixa: 'bg-default border-default', texto: 'text-default', icone: 'icon-default', Icone: Info },
  alert: { caixa: 'bg-danger-tertiary border-danger', texto: 'text-on-danger-tertiary', icone: 'icon-on-danger-tertiary', Icone: TriangleAlert },
  // Variantes do app: mesma estrutura do Notification do SDS com as cores semânticas warning e positive.
  warning: { caixa: 'bg-warning-tertiary border-warning', texto: 'text-warning', icone: 'icon-warning', Icone: TriangleAlert },
  positive: { caixa: 'bg-positive-tertiary border-positive', texto: 'text-positive', icone: 'icon-positive', Icone: Check },
};

export function Notification({ variant = 'message', title, children }: { variant?: NotificationTone; title?: string; children?: ReactNode }) {
  const cor = useCor();
  const n = NOTIF[variant];
  return (
    <View accessibilityRole="alert" className={`w-full flex-row rounded-md border py-4 pl-4 pr-3 ${n.caixa}`}>
      <n.Icone size={20} color={cor(n.icone)} />
      <View className="ml-3 flex-1 gap-1">
        {title ? <RNText className={`font-sans-semibold text-body ${n.texto}`}>{title}</RNText> : null}
        {children ? <RNText className={`font-sans text-body ${n.texto}`}>{children}</RNText> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Card
export function Card({
  children, variant = 'stroke', padding = '600', onPress, className = '', selected,
}: {
  children: ReactNode; variant?: 'default' | 'stroke' | 'brand'; padding?: '400' | '600'; onPress?: () => void; className?: string; selected?: boolean;
}) {
  // SDS: radius-200; stroke = borda border-default + sombra drop-shadow-300; padding space-600 (o app usa 400 em listas).
  const base = `gap-2 rounded-md ${padding === '600' ? 'p-6' : 'p-4'} ${variant === 'brand' ? 'bg-brand' : 'bg-default'} ${variant === 'stroke' ? `border ${selected ? 'border-brand' : 'border-default'}` : ''} ${selected ? 'border-2' : ''} ${className}`;
  const sombra = variant === 'default' ? undefined : { shadowColor: '#0c0c0d', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 4 }, elevation: 1 };
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" className={`${base} active:bg-default-hover`} style={sombra}>{children}</Pressable>
  ) : (
    <View className={base} style={sombra}>{children}</View>
  );
}

// ---------------------------------------------------------------- Tabs
/** Tabs do SDS (tab-list + tab). Desvio: aba ativa com traço de 2px em border-brand, mais visível que o 1px cinza do SDS. */
export function Tabs<V extends string>({ value, onChange, tabs }: { value: V; onChange: (v: V) => void; tabs: { value: V; label: string; count?: number }[] }) {
  return (
    <View className="flex-row border-b border-default" accessibilityRole="tablist">
      {tabs.map((t) => {
        const sel = t.value === value;
        return (
          <Pressable key={t.value} onPress={() => onChange(t.value)} accessibilityRole="tab" accessibilityState={{ selected: sel }}
            className={`-mb-px min-h-12 flex-1 items-center justify-center rounded-t-sm px-3 ${sel ? 'border-b-2 border-brand' : 'active:bg-default-hover'}`}>
            <RNText className={`font-sans text-body ${sel ? 'font-sans-semibold text-default' : 'text-secondary'}`} numberOfLines={1}>
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- Meter
/** Barra de progresso com marca de meta (uso didático no painel). `valor` e `meta` em 0–100. */
export function Meter({ valor, meta, tom = 'brand', label }: { valor: number; meta?: number | null; tom?: 'brand' | 'positive' | 'warning' | 'danger'; label: string }) {
  const fundo = { brand: 'bg-brand', positive: 'bg-positive', warning: 'bg-warning', danger: 'bg-danger' }[tom];
  const v = Math.max(0, Math.min(100, valor));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }} className="h-2 w-full justify-center rounded-full bg-tertiary">
      <View className={`h-2 rounded-full ${fundo}`} style={{ width: `${v}%` }} />
      {meta != null ? <View className="absolute h-4 w-0.5 bg-brand" style={{ left: `${Math.max(0, Math.min(100, meta))}%` }} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- Skeleton
/** Bloco de carregamento em esqueleto (pulsa suavemente; sem animação se o sistema pedir menos movimento). */
export function Skeleton({ altura = 16, largura = '100%', raio = 8 }: { altura?: number; largura?: number | `${number}%`; raio?: number }) {
  const [opacidade] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    let ativo = true;
    let laco: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
      if (!ativo || reduzir) return;
      laco = Animated.loop(Animated.sequence([
        Animated.timing(opacidade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacidade, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]));
      laco.start();
    });
    return () => { ativo = false; laco?.stop(); };
  }, [opacidade]);
  return <Animated.View className="bg-tertiary" style={{ height: altura, width: largura, borderRadius: raio, opacity: opacidade }} />;
}
