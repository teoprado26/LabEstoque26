// Leitor de código pela câmera: QR da etiqueta do lote e códigos de barras do produto (EAN/GTIN, Code128…).
// Também aceita digitação, que serve para leitores USB/Bluetooth (funcionam como teclado).
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Botao, Campo, T } from './ui';

const TIPOS: BarcodeType[] = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'datamatrix'];

export function LeitorCodigo({ onCodigo, rotuloManual = 'Ou digite o código' }: { onCodigo: (codigo: string) => void; rotuloManual?: string }) {
  const [permissao, pedir] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const lido = useRef<{ codigo: string; em: number } | null>(null);

  const ler = (codigo: string) => {
    const c = codigo.trim();
    if (!c) return;
    // Evita disparar várias vezes para o mesmo código enquanto a câmera continua vendo a etiqueta.
    const agora = Date.now();
    if (lido.current && lido.current.codigo === c && agora - lido.current.em < 3000) return;
    lido.current = { codigo: c, em: agora };
    onCodigo(c);
  };

  return (
    <View className="gap-4">
      {permissao?.granted ? (
        <View className="h-72 overflow-hidden rounded-md border border-default">
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: TIPOS }} onBarcodeScanned={({ data }) => ler(data)} />
        </View>
      ) : permissao ? (
        <View className="gap-2 rounded-md border border-default p-4">
          <T v="body">Permita a câmera para ler o código de barras do produto ou o QR da etiqueta do lote.</T>
          <Botao titulo="Permitir câmera" onPress={pedir} />
        </View>
      ) : null}
      {Platform.OS === 'web' ? <T v="caption">No navegador, a leitura pela câmera depende do suporte do navegador; se não funcionar, digite o código.</T> : null}
      <Campo rotulo={rotuloManual} value={manual} onChangeText={setManual} autoCapitalize="none" returnKeyType="search"
        onSubmitEditing={() => { ler(manual); setManual(''); }} placeholder="EAN, código interno ou etiqueta do lote" />
      <Botao tipo="secundario" titulo="Usar código digitado" desabilitado={!manual.trim()} onPress={() => { ler(manual); setManual(''); }} />
    </View>
  );
}
