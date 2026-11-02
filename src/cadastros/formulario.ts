// Conversão entre registro do banco e valores de formulário, e validação. Sem dependência de React (testável).
import { lerNumero } from '../domain/entrada';
import type { CadastroDef, CampoDef, Registro } from './config';

export type Valor = string | boolean | null;
export type Valores = Record<string, Valor>;

export const camposDe = (def: CadastroDef): CampoDef[] => def.secoes.flatMap((s) => s.campos);

const fmtNum = (n: number) => String(n).replace('.', ',');

/** Registro (ou padrão de um novo) → valores editáveis. Números viram texto em pt-BR. */
export function paraValores(def: CadastroDef, registro: Registro | null): Valores {
  const r = registro ?? def.padrao ?? {};
  const v: Valores = {};
  for (const c of camposDe(def)) {
    const x = r[c.chave];
    if (c.tipo === 'bool') v[c.chave] = Boolean(x);
    else if (c.tipo === 'numero') v[c.chave] = x == null ? '' : fmtNum(Number(x));
    else if (c.tipo === 'lista') v[c.chave] = Array.isArray(x) ? x.join(', ') : '';
    else if (c.tipo === 'ref' || c.tipo === 'usuario' || c.tipo === 'opcao') v[c.chave] = (x as string | null) ?? null;
    else v[c.chave] = (x as string | null) ?? '';
  }
  return v;
}

export interface Conversao {
  registro: Registro;
  erros: Record<string, string>;
}

/** Valores → registro para gravar, com validação por campo e as regras entre campos do cadastro. */
export function paraRegistro(def: CadastroDef, valores: Valores): Conversao {
  const registro: Registro = {};
  const erros: Record<string, string> = {};
  for (const c of camposDe(def)) {
    const bruto = valores[c.chave];
    let valor: unknown;
    switch (c.tipo) {
      case 'bool':
        valor = Boolean(bruto);
        break;
      case 'numero': {
        const texto = String(bruto ?? '').trim();
        if (!texto) valor = null;
        else {
          const n = lerNumero(texto);
          if (n == null) erros[c.chave] = 'Número inválido.';
          else if (c.inteiro && !Number.isInteger(n)) erros[c.chave] = 'Use um número inteiro.';
          else if (c.positivo && n <= 0) erros[c.chave] = 'Deve ser maior que zero.';
          valor = n;
        }
        break;
      }
      case 'lista': {
        const itens = String(bruto ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        valor = itens.length ? itens : null;
        break;
      }
      case 'texto': {
        const t = String(bruto ?? '').trim();
        valor = t ? (c.maiusculas ? t.toUpperCase() : t) : null;
        break;
      }
      default:
        valor = bruto || null;
    }
    if (c.obrigatorio && (valor == null || valor === '') && !erros[c.chave]) erros[c.chave] = 'Obrigatório.';
    registro[c.chave] = valor;
  }
  if (Object.keys(erros).length === 0 && def.validar) Object.assign(erros, def.validar(registro));
  return { registro, erros };
}

/** Só os campos que mudaram (para o UPDATE e para mostrar o que será auditado). */
export function diferencas(original: Registro, novo: Registro): Registro {
  const d: Registro = {};
  for (const [k, v] of Object.entries(novo)) {
    if (JSON.stringify(original[k] ?? null) !== JSON.stringify(v ?? null)) d[k] = v;
  }
  return d;
}
