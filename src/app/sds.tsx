// Catálogo dos componentes SDS do app (como o Storybook do SDS). Só existe em desenvolvimento: /sds
import { Redirect } from 'expo-router';
import { Plus, ScanLine } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Interruptor, Opcoes, Selecionar, Selo, SeloDado, SeloLote, SeloStatus, Tela, T } from '@/components/ui';

export default function CatalogoSds() {
  const [opcao, setOpcao] = useState<'a' | 'b' | 'c'>('a');
  const [ligado, setLigado] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Tela titulo="Componentes SDS" acao={<IconButton icon={Plus} variant="primary" label="Novo" onPress={() => {}} />}>
      <T v="caption">Simple Design System (github.com/figma/sds) em React Native.</T>
      <Card className="gap-3">
        <T v="title">Texto</T>
        <T v="display">Heading</T>
        <T v="title">Heading small</T>
        <T v="subtitle">Body strong</T>
        <T v="body">Body base — texto corrido do app.</T>
        <T v="label">Body small strong</T>
        <T v="caption">Body small — metadados</T>
        <T v="code">LT-2026-0418 · F-80/R2/C3/B7</T>
        <T v="kpi">96,4%</T>
      </Card>
      <Card className="gap-3">
        <T v="title">Button</T>
        <Botao titulo="Primary" onPress={() => {}} />
        <Botao tipo="secundario" titulo="Neutral" icone={ScanLine} onPress={() => {}} />
        <Botao tipo="sutil" titulo="Subtle" onPress={() => {}} />
        <Botao tipo="perigo" titulo="Danger primary" onPress={() => {}} />
        <Botao titulo="Desativado" desabilitado onPress={() => {}} />
        <Botao titulo="Carregando" carregando onPress={() => {}} />
      </Card>
      <Card className="gap-4">
        <T v="title">Campos</T>
        <Campo rotulo="Input" placeholder="Placeholder" ajuda="Descrição do campo." />
        <Campo rotulo="Com erro" value="abc" erro="Número inválido." />
        <Campo rotulo="Desativado" value="somente leitura" editable={false} />
        <Selecionar rotulo="Select" valor={sel} onChange={setSel} opcoes={[{ valor: '1', rotulo: 'Geladeira 4 °C' }, { valor: '2', rotulo: 'Freezer −20 °C' }]} />
        <Opcoes rotulo="Tag toggle" valor={opcao} onChange={setOpcao} opcoes={[{ valor: 'a', rotulo: '30 dias' }, { valor: 'b', rotulo: '90 dias' }, { valor: 'c', rotulo: '180 dias' }]} />
        <Interruptor rotulo="Switch" ajuda="Descrição do switch." valor={ligado} onChange={setLigado} />
        <Interruptor rotulo="Switch desativado" valor={false} onChange={() => {}} desabilitado />
      </Card>
      <Card className="gap-3">
        <T v="title">Tag</T>
        <View className="flex-row flex-wrap gap-2">
          <SeloLote status="QUARENTENA" /><SeloLote status="LIBERADO" /><SeloLote status="ABERTO" />
          <SeloLote status="BLOQUEADO" /><SeloLote status="VENCIDO" /><SeloLote status="BAIXADO" />
        </View>
        <View className="flex-row flex-wrap gap-2">
          <SeloStatus status="ok" /><SeloStatus status="alerta" /><SeloStatus status="critico" />
          <SeloDado selo="Real" /><SeloDado selo="Estimado" /><SeloDado selo="Projetado" /><SeloDado selo="Dados insuficientes" />
          <Selo tom="primary" texto="Vital" />
        </View>
      </Card>
      <T v="title">Notification</T>
      <Aviso>Disponível insuficiente neste lote e local: 900.</Aviso>
      <Aviso tom="warn">Nenhum lote disponível para este item.</Aviso>
      <Aviso tom="ok">Dispensado 100 mL do lote L-A.</Aviso>
      <Card selecionado className="gap-1">
        <T v="subtitle">Card selecionado</T>
        <T v="caption">Lote sugerido por FEFO.</T>
      </Card>
    </Tela>
  );
}
