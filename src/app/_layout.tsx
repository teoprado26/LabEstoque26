import '../../global.css';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { RobotoMono_400Regular } from '@expo-google-fonts/roboto-mono';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, vars } from 'nativewind';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Carregando } from '@/components/ui';
import { SessaoProvider } from '@/lib/sessao';
import { VARS } from '@/theme/tokens';

const TEMAS = { light: vars(VARS.light), dark: vars(VARS.dark) };

export default function RootLayout() {
  const [fontes] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, RobotoMono_400Regular });
  const { colorScheme } = useColorScheme();
  const tema = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <SafeAreaProvider>
      <View style={[{ flex: 1 }, TEMAS[tema]]} className="bg-default">
        <StatusBar style={tema === 'dark' ? 'light' : 'dark'} />
        {fontes ? (
          <SessaoProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </SessaoProvider>
        ) : (
          <Carregando />
        )}
      </View>
    </SafeAreaProvider>
  );
}
