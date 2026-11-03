// Análises: entrada para as telas de informação específica.
import { router, type Href } from 'expo-router';
import { BarChart3, CalendarClock, Gauge, Layers, PackageX, PieChart, ShoppingCart, Truck, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useCor } from '@/components/sds';
import { Card, Tela, T } from '@/components/ui';

const TELAS: { titulo: string; descricao: string; Icone: LucideIcon; rota: Href }[] = [
  { titulo: 'Indicadores completos', descricao: 'Os 22 KPIs por tema: atendimento, estoque, perdas, confiabilidade e abastecimento.', Icone: Gauge, rota: '/analises/indicadores' },
  { titulo: 'Curva ABC e matriz ABC-VED', descricao: 'Quais itens concentram o valor consumido e quais merecem mais controle.', Icone: Layers, rota: '/analises/abc' },
  { titulo: 'Pareto', descricao: 'As poucas causas que explicam a maior parte das perdas, rupturas, atrasos e divergências.', Icone: BarChart3, rota: '/analises/pareto' },
  { titulo: 'Vencimentos', descricao: 'Lotes por data de validade, com quantidade e valor, em 30, 60 e 90 dias.', Icone: CalendarClock, rota: '/analises/vencimentos' },
  { titulo: 'Fornecedores e lead time', descricao: 'Prazo real de entrega, entregas no prazo e etapas do ciclo de compra.', Icone: Truck, rota: '/analises/fornecedores' },
  { titulo: 'Consumo por categoria ou projeto', descricao: 'Para onde vai o material e quanto custa cada projeto.', Icone: PieChart, rota: '/analises/consumo' },
  { titulo: 'Itens parados', descricao: 'Itens com saldo e sem saída há muito tempo, com o valor imobilizado.', Icone: PackageX, rota: '/analises/parados' },
  { titulo: 'Compras', descricao: 'Sugestões de compra e pedidos por etapa.', Icone: ShoppingCart, rota: '/compras' },
];

export default function Analises() {
  const cor = useCor();
  return (
    <Tela titulo="Análises" voltar>
      {TELAS.map(({ titulo, descricao, Icone, rota }) => (
        <Card key={titulo} onPress={() => router.push(rota)} className="flex-row items-center gap-3">
          <Icone size={24} color={cor('icon-default')} />
          <View className="flex-1 gap-1">
            <T v="subtitle">{titulo}</T>
            <T v="caption">{descricao}</T>
          </View>
        </Card>
      ))}
    </Tela>
  );
}
