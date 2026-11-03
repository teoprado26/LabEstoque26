import { router, type Href } from 'expo-router';
import {
  ArrowLeftRight, ClipboardCheck, ClipboardList, PackageCheck, PackageMinus, PackagePlus, ScanLine, ShoppingCart, TriangleAlert, Undo2, Wrench, type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';
import { useCor } from '@/components/sds';
import { Card, Tela, T } from '@/components/ui';
import { useSessao, type Perfil } from '@/lib/sessao';

const TODOS: Perfil[] = ['solicitante', 'tecnico', 'gestor', 'coordenador', 'auditor'];

const OPERACOES: { titulo: string; descricao: string; Icone: LucideIcon; rota: Href; perfis: Perfil[] }[] = [
  { titulo: 'Escanear código', descricao: 'Câmera ou leitor: cadastrar item novo, receber, retirar ou consultar.', Icone: ScanLine, rota: '/escanear', perfis: TODOS },
  { titulo: 'Compras', descricao: 'Sugestões de compra e pedidos por etapa.', Icone: ShoppingCart, rota: '/compras', perfis: ['tecnico', 'gestor', 'auditor'] },
  { titulo: 'Receber', descricao: 'Entrada de lote em quarentena, com etiqueta QR.', Icone: PackagePlus, rota: '/receber', perfis: ['tecnico', 'gestor'] },
  { titulo: 'Dispensar', descricao: 'Saída para consumo, com lote sugerido por FEFO.', Icone: PackageMinus, rota: '/dispensar', perfis: ['tecnico', 'gestor'] },
  { titulo: 'Requisições', descricao: 'Pedir material para um projeto, aprovar e atender.', Icone: ClipboardList, rota: '/requisicoes', perfis: TODOS },
  { titulo: 'Devolver', descricao: 'Material não usado volta bloqueado até a avaliação.', Icone: Undo2, rota: '/devolver', perfis: ['solicitante', 'tecnico', 'gestor', 'coordenador'] },
  { titulo: 'Avaliar devoluções', descricao: 'Reintegrar ao estoque ou descartar.', Icone: PackageCheck, rota: '/devolucoes', perfis: ['gestor'] },
  { titulo: 'Transferir', descricao: 'Mudança de local, com checagem de compatibilidade.', Icone: ArrowLeftRight, rota: '/transferir', perfis: ['tecnico', 'gestor'] },
  { titulo: 'Registrar perda', descricao: 'Baixa com motivo padronizado.', Icone: TriangleAlert, rota: '/perda', perfis: ['tecnico', 'gestor'] },
  { titulo: 'Inventário', descricao: 'Contagem às cegas e aprovação de ajustes.', Icone: ClipboardCheck, rota: '/inventario', perfis: ['tecnico', 'gestor', 'auditor'] },
  { titulo: 'Equipamentos', descricao: 'Agenda de manutenção e calibração, registro de serviços e situação.', Icone: Wrench, rota: '/equipamentos', perfis: TODOS },
];

export default function Operar() {
  const { pode } = useSessao();
  const cor = useCor();
  return (
    <Tela titulo="Operar">
      {OPERACOES.filter((o) => pode(...o.perfis)).map(({ titulo, descricao, Icone, rota }) => (
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
