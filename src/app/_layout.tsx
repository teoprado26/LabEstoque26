import '../../global.css';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, useFonts } from '@expo-google-fonts/ibm-plex-sans';
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
  const [fontes] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexMono_400Regular, IBMPlexMono_500Medium });
  const { colorScheme } = useColorScheme();
  const tema = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <SafeAreaProvider>
      <View style={[{ flex: 1 }, TEMAS[tema]]} className="bg-surface">
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
