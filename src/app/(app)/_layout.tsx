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
        tabBarActiveTintColor: c['text-default'],
        tabBarInactiveTintColor: c['text-secondary'],
        tabBarStyle: { backgroundColor: c['bg-default'], borderTopColor: c['border-default'] },
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
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
      <Tabs.Screen name="lote/[id]" options={oculto} />
      <Tabs.Screen name="perda" options={oculto} />
      <Tabs.Screen name="transferir" options={oculto} />
      <Tabs.Screen name="devolver" options={oculto} />
      <Tabs.Screen name="devolucoes" options={oculto} />
      <Tabs.Screen name="inventario" options={oculto} />
      <Tabs.Screen name="requisicoes" options={oculto} />
      <Tabs.Screen name="membros" options={oculto} />
    </Tabs>
  );
}
