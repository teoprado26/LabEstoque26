// Esqueletos de carregamento: a forma da tela aparece antes dos dados.
import { View } from 'react-native';
import { Card, Skeleton } from './sds';

export function EsqueletoCards({ quantidade = 3 }: { quantidade?: number }) {
  return (
    <View className="gap-4" accessibilityLabel="Carregando" accessibilityRole="progressbar">
      {Array.from({ length: quantidade }, (_, i) => (
        <Card key={i} padding="400">
          <Skeleton altura={14} largura="40%" />
          <Skeleton altura={28} largura="60%" />
          <Skeleton altura={12} largura="85%" />
        </Card>
      ))}
    </View>
  );
}

/** Esqueleto do Painel: fotos da bancada, quatro números de resumo e alguns cards. */
export function EsqueletoPainel() {
  return (
    <View className="gap-4" accessibilityLabel="Carregando o painel" accessibilityRole="progressbar">
      <View className="flex-row gap-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} altura={56} largura={56} raio={28} />)}</View>
      <View className="flex-row flex-wrap gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} className="min-w-[45%] flex-1"><Card padding="400"><Skeleton altura={20} largura={20} /><Skeleton altura={28} largura="40%" /><Skeleton altura={12} largura="80%" /></Card></View>
        ))}
      </View>
      <EsqueletoCards quantidade={2} />
    </View>
  );
}
