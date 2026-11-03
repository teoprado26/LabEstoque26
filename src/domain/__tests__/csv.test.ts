import { describe, expect, it } from 'vitest';
import { paraCsv } from '../csv';

describe('CSV para Excel pt-BR', () => {
  it('BOM, separador ";" e quebra de linha CRLF', () => {
    const t = paraCsv(['A', 'B'], [[1, 'x']]);
    expect(t.charCodeAt(0)).toBe(0xfeff);
    expect(t.slice(1)).toBe('A;B\r\n1;x');
  });
  it('aspas em campos com ";", aspas ou quebra de linha; vazio para null', () => {
    expect(paraCsv(['c'], [['a;b'], ['diz "oi"'], ['linha\n2'], [null]]).slice(1).split('\r\n').slice(1)).toEqual(['"a;b"', '"diz ""oi"""', '"linha\n2"', '']);
  });
});
