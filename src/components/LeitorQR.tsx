import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { View } from 'react-native';
import { Botao, T } from './ui';

const PREFIXO = 'labestoque://lote/';

/** Conteúdo do QR impresso na etiqueta de cada lote. */
export const qrDoLote = (loteId: string) => `${PREFIXO}${loteId}`;

export function LeitorQR({ onLote, onCancelar }: { onLote: (loteId: string) => void; onCancelar: () => void }) {
  const [permissao, pedir] = useCameraPermissions();
  const lido = useRef(false);

  if (!permissao) return null;
  if (!permissao.granted) {
    return (
      <View className="gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <T v="body">Permita o uso da câmera para ler o QR code do lote.</T>
        <Botao titulo="Permitir câmera" onPress={pedir} />
        <Botao tipo="secundario" titulo="Cancelar" onPress={onCancelar} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="h-72 overflow-hidden rounded-lg border border-line">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (lido.current || !data.startsWith(PREFIXO)) return;
            lido.current = true;
            onLote(data.slice(PREFIXO.length));
          }}
        />
      </View>
      <T v="caption">Aponte para a etiqueta do lote.</T>
      <Botao tipo="secundario" titulo="Cancelar leitura" onPress={onCancelar} />
    </View>
  );
}
