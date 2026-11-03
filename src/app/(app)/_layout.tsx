import { Redirect, Tabs } from 'expo-router';
import { Boxes, ClipboardList, Gauge, Menu } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Carregando } from '@/components/ui';
import { useSessao } from '@/lib/sessao';
import { HEX } from '@/theme/tokens';
import { SemLaboratorio } from '@/components/SemLaboratorio';

export default function AppLayout() {
  const { carregando, sessao, lab, labs } = useSessao();
  const { colorScheme } = useColorScheme();
  const c = HEX[colorScheme === 'dark' ? 'dark' : 'light'];

  if (carregando) return <Carregando />;
  if (!sessao) return <Redirect href="/login" />;
  if (!lab && labs.length === 0) return <SemLaboratorio />;

  const oculto = { href: null } as const;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c['ink-muted'],
        tabBarStyle: { backgroundColor: c['surface-raised'], borderTopColor: c.line },
        tabBarLabelStyle: { fontFamily: 'IBMPlexSans_500Medium', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Painel', tabBarIcon: ({ color }) => <Gauge size={24} color={color} /> }} />
      <Tabs.Screen name="estoque" options={{ title: 'Estoque', tabBarIcon: ({ color }) => <Boxes size={24} color={color} /> }} />
      <Tabs.Screen name="operar" options={{ title: 'Operar', tabBarIcon: ({ color }) => <ClipboardList size={24} color={color} /> }} />
      <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: ({ color }) => <Menu size={24} color={color} /> }} />
      <Tabs.Screen name="item/[id]" options={oculto} />
      <Tabs.Screen name="dispensar" options={oculto} />
      <Tabs.Screen name="receber" options={oculto} />
      <Tabs.Screen name="cadastros" options={oculto} />
      <Tabs.Screen name="equipamentos" options={oculto} />
    </Tabs>
  );
}
