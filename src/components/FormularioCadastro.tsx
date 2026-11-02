import { View } from 'react-native';
import type { CampoDef, CadastroDef } from '@/cadastros/config';
import type { Valor, Valores } from '@/cadastros/formulario';
import { Campo, Card, Interruptor, Opcoes, Selecionar, T } from './ui';

export interface OpcoesRef {
  [chave: string]: { valor: string; rotulo: string; recuo?: number }[];
}

/** Formulário gerado a partir da definição do cadastro. `opcoesRef` traz as opções dos campos ref/usuario já filtradas. */
export function FormularioCadastro({
  def, valores, erros, onChange, opcoesRef, somenteLeitura,
}: {
  def: CadastroDef; valores: Valores; erros: Record<string, string>; onChange: (chave: string, v: Valor) => void;
  opcoesRef: OpcoesRef; somenteLeitura: boolean;
}) {
  const render = (c: CampoDef) => {
    const comum = { key: c.chave, rotulo: c.rotulo + (c.obrigatorio ? ' *' : ''), ajuda: c.ajuda, erro: erros[c.chave] ?? null };
    switch (c.tipo) {
      case 'bool':
        return <Interruptor key={c.chave} rotulo={c.rotulo} ajuda={c.ajuda} valor={Boolean(valores[c.chave])} onChange={(v) => onChange(c.chave, v)} desabilitado={somenteLeitura} />;
      case 'opcao':
        return <Opcoes {...comum} valor={(valores[c.chave] as string) ?? null} opcoes={c.opcoes} onChange={(v) => onChange(c.chave, v)} desabilitado={somenteLeitura} />;
      case 'ref':
      case 'usuario':
        return (
          <Selecionar {...comum} valor={(valores[c.chave] as string) ?? null} opcoes={opcoesRef[c.chave] ?? []}
            onChange={(v) => onChange(c.chave, v)} permitirVazio={!c.obrigatorio} desabilitado={somenteLeitura} />
        );
      case 'numero':
        return (
          <Campo {...comum} value={String(valores[c.chave] ?? '')} onChangeText={(t) => onChange(c.chave, t)}
            keyboardType={c.inteiro && c.positivo ? 'number-pad' : 'numbers-and-punctuation'} editable={!somenteLeitura} />
        );
      default:
        return (
          <Campo {...comum} value={String(valores[c.chave] ?? '')} onChangeText={(t) => onChange(c.chave, t)} editable={!somenteLeitura}
            autoCapitalize={c.tipo === 'texto' && c.maiusculas ? 'characters' : c.tipo === 'texto' && c.teclado ? 'none' : 'sentences'}
            keyboardType={c.tipo === 'texto' && c.teclado ? c.teclado : 'default'}
            multiline={c.tipo === 'texto' && c.multilinha} />
        );
    }
  };

  return (
    <View className="gap-4">
      {def.secoes.map((s) => (
        <Card key={s.titulo} className="gap-4">
          <T v="subtitle">{s.titulo}</T>
          {s.campos.map(render)}
        </Card>
      ))}
    </View>
  );
}
