import { router } from 'expo-router';
import { Boxes, FolderKanban, MapPin, Tags, Truck, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { CADASTROS, ORDEM_CADASTROS, type TabelaCadastro } from '@/cadastros/config';
import { Card, Selo, Tela, T } from '@/components/ui';
import { useSessao } from '@/lib/sessao';

const ICONES: Record<TabelaCadastro, LucideIcon> = { itens: Boxes, locais: MapPin, projetos: FolderKanban, fornecedores: Truck, categorias: Tags };

export default function Cadastros() {
  const { pode } = useSessao();
  return (
    <Tela titulo="Cadastros" voltar>
      {!pode('gestor') ? <Selo tom="neutro" texto="Somente leitura: alterações exigem perfil de gestor" /> : null}
      {ORDEM_CADASTROS.map((t) => {
        const Icone = ICONES[t];
        return (
          <Card key={t} onPress={() => router.push(`/cadastros/${t}`)} className="flex-row items-center gap-3">
            <Icone size={24} color="rgb(15 107 92)" />
            <View className="flex-1 gap-1">
              <T v="subtitle">{CADASTROS[t].titulo}</T>
              <T v="caption">{CADASTROS[t].descricao}</T>
            </View>
          </Card>
        );
      })}
    </Tela>
  );
}
