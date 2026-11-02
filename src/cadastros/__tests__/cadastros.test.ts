import { describe, expect, it } from 'vitest';
import { lerData, lerNumero } from '../../domain/entrada';
import { caminho, ordenarArvore, paisPossiveis } from '../arvoreLocais';
import { CADASTROS } from '../config';
import { diferencas, paraRegistro, paraValores } from '../formulario';

describe('leitura pt-BR', () => {
  it('números', () => {
    expect(lerNumero('1.234,5')).toBe(1234.5);
    expect(lerNumero('0,25')).toBe(0.25);
    expect(lerNumero('1.000')).toBe(1000);
    expect(lerNumero('1.5')).toBe(1.5);
    expect(lerNumero('−20')).toBe(-20);
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('')).toBeNull();
  });
  it('datas', () => {
    expect(lerData('31/01/2027')).toBe('2027-01-31');
    expect(lerData('31/02/2027')).toBeNull();
    expect(lerData('2027-01-31')).toBeNull();
  });
});

describe('formulário de item', () => {
  const def = CADASTROS.itens;
  const base = {
    ...paraValores(def, null),
    codigo: 'mc-dmem', nome: 'Meio DMEM', tipo: 'meio_cultura', unidade_compra: 'frasco 500 mL', unidade_estoque: 'mL', fator_conversao: '500',
  };

  it('novo item começa com os padrões', () => {
    const v = paraValores(def, null);
    expect(v.fator_conversao).toBe('1');
    expect(v.criticidade).toBe('E');
    expect(v.ativo).toBe(true);
  });

  it('converte, normaliza código e aceita vazio como null', () => {
    const { registro, erros } = paraRegistro(def, { ...base, temp_min: '2', temp_max: '8', validade_pos_abertura_dias: '30' });
    expect(erros).toEqual({});
    expect(registro).toMatchObject({ codigo: 'MC-DMEM', fator_conversao: 500, temp_min: 2, temp_max: 8, validade_pos_abertura_dias: 30, es_manual: null, categoria_id: null });
  });

  it('obrigatórios e números inválidos', () => {
    const { erros } = paraRegistro(def, { ...base, nome: ' ', fator_conversao: '0', validade_pos_abertura_dias: '2,5' });
    expect(erros).toEqual({ nome: 'Obrigatório.', fator_conversao: 'Deve ser maior que zero.', validade_pos_abertura_dias: 'Use um número inteiro.' });
  });

  it('regras entre campos: faixa de temperatura e justificativa do manual', () => {
    expect(paraRegistro(def, { ...base, temp_min: '8', temp_max: '2' }).erros).toEqual({ temp_max: 'A máxima deve ser maior ou igual à mínima.' });
    expect(paraRegistro(def, { ...base, temp_min: '2' }).erros).toHaveProperty('temp_max');
    expect(paraRegistro(def, { ...base, pr_manual: '100' }).erros).toHaveProperty('justificativa_manual');
    expect(paraRegistro(def, { ...base, pr_manual: '100', es_manual: '150', justificativa_manual: 'sazonal' }).erros).toHaveProperty('pr_manual');
  });

  it('ida e volta preserva o registro', () => {
    const { registro } = paraRegistro(def, { ...base, temp_min: '-25', multiplo_embalagem: '0,5', temp_max: '-15' });
    expect(paraRegistro(def, paraValores(def, registro)).registro).toEqual(registro);
  });

  it('diferenças só com campos alterados', () => {
    expect(diferencas({ nome: 'A', ativo: true, temp_min: null }, { nome: 'B', ativo: true, temp_min: null })).toEqual({ nome: 'B' });
  });
});

describe('outros cadastros', () => {
  it('local fora da raiz exige pai e grade completa', () => {
    const def = CADASTROS.locais;
    const v = { ...paraValores(def, null), nome: 'Freezer', nivel: 'equipamento', grade_linhas: '9' };
    expect(paraRegistro(def, v).erros).toEqual({ grade_colunas: 'Informe linhas e colunas da grade.', pai_id: 'Escolha onde este local fica.' });
    expect(paraRegistro(def, { ...v, nivel: 'laboratorio', grade_colunas: '9', classes_aceitas: 'geral, inflamavel' }).registro.classes_aceitas).toEqual(['geral', 'inflamavel']);
  });
  it('projeto com aprovação exige coordenador; CNPJ com 14 dígitos', () => {
    expect(paraRegistro(CADASTROS.projetos, { ...paraValores(CADASTROS.projetos, null), codigo: 'p1', nome: 'X', exige_aprovacao: true }).erros).toHaveProperty('coordenador_id');
    expect(paraRegistro(CADASTROS.fornecedores, { nome: 'F', cnpj: '12.345.678/0001-9', ativo: true }).erros).toHaveProperty('cnpj');
    expect(paraRegistro(CADASTROS.fornecedores, { nome: 'F', cnpj: '12.345.678/0001-90', ativo: true }).erros).toEqual({});
  });
});

describe('árvore de locais', () => {
  const L = [
    { id: 'frz', pai_id: 'sala', nivel: 'equipamento', nome: 'Freezer' },
    { id: 'lab', pai_id: null, nivel: 'laboratorio', nome: 'Lab' },
    { id: 'cx', pai_id: 'rack', nivel: 'caixa', nome: 'Caixa B7' },
    { id: 'sala', pai_id: 'lab', nivel: 'sala', nome: 'Sala 101' },
    { id: 'gel', pai_id: 'sala', nivel: 'equipamento', nome: 'Geladeira' },
    { id: 'rack', pai_id: 'frz', nivel: 'prateleira', nome: 'Rack 2' },
  ];

  it('ordena em pré-ordem com profundidade', () => {
    expect(ordenarArvore(L).map(({ local, profundidade }) => `${profundidade}:${local.id}`)).toEqual(['0:lab', '1:sala', '2:frz', '3:rack', '4:cx', '2:gel']);
  });
  it('caminho completo', () => expect(caminho(L, 'cx')).toBe('Lab › Sala 101 › Freezer › Rack 2 › Caixa B7'));
  it('pai possível: nível acima, nunca o próprio nem descendente', () => {
    expect(paisPossiveis(L, 'prateleira', 'frz').map((l) => l.id).sort()).toEqual(['gel', 'lab', 'sala']);
    expect(paisPossiveis(L, 'equipamento', 'sala').map((l) => l.id)).toEqual(['lab']);
  });
});
