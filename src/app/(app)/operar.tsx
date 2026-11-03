import { router, type Href } from 'expo-router';
import { ArrowLeftRight, ClipboardCheck, PackageMinus, PackagePlus, TriangleAlert, Undo2, Wrench, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useCor } from '@/components/sds';
import { Card, Selo, Tela, T } from '@/components/ui';
import { useSessao, type Perfil } from '@/lib/sessao';

const OPERACOES: { titulo: string; descricao: string; Icone: LucideIcon; rota?: Href; perfis: Perfil[] }[] = [
  { titulo: 'Receber', descricao: 'Entrada de lote em quarentena, com etiqueta QR.', Icone: PackagePlus, rota: '/receber', perfis: ['tecnico', 'gestor'] },
  { titulo: 'Dispensar', descricao: 'Saída para consumo, com lote sugerido por FEFO.', Icone: PackageMinus, rota: '/dispensar', perfis: ['tecnico', 'gestor'] },
  { titulo: 'Devolver', descricao: 'Material volta BLOQUEADO até avaliação do gestor.', Icone: Undo2, perfis: ['solicitante', 'tecnico', 'gestor', 'coordenador'] },
  { titulo: 'Transferir', descricao: 'Mudança de local, com checagem de compatibilidade.', Icone: ArrowLeftRight, perfis: ['tecnico', 'gestor'] },
  { titulo: 'Registrar perda', descricao: 'Baixa com motivo padronizado.', Icone: TriangleAlert, perfis: ['tecnico', 'gestor'] },
  { titulo: 'Inventário', descricao: 'Contagem às cegas e aprovação de ajustes.', Icone: ClipboardCheck, perfis: ['tecnico', 'gestor'] },
  { titulo: 'Equipamentos', descricao: 'Agenda de manutenção e calibração, registro de serviços e situação.', Icone: Wrench, rota: '/equipamentos', perfis: ['solicitante', 'tecnico', 'gestor', 'coordenador', 'auditor'] },
];

export default function Operar() {
  const { pode } = useSessao();
  const cor = useCor();
  return (
    <Tela titulo="Operar">
      {OPERACOES.filter((o) => pode(...o.perfis)).map(({ titulo, descricao, Icone, rota }) => (
        <Card key={titulo} onPress={rota ? () => router.push(rota) : undefined} className="flex-row items-center gap-3">
          <Icone size={24} color={cor('icon-default')} />
          <View className="flex-1 gap-1">
            <T v="subtitle">{titulo}</T>
            <T v="caption">{descricao}</T>
            {!rota ? <Selo tom="neutro" texto="Tela na próxima etapa (regras já no banco)" /> : null}
          </View>
        </Card>
      ))}
    </Tela>
  );
}
