import { greeting } from '@/domain/format';

it('saudação usa o primeiro nome e o horário', () => {
  expect(greeting('Ana Souza', new Date('2026-10-22T09:00:00'))).toBe('Bom dia, Ana!');
  expect(greeting('', new Date('2026-10-22T15:00:00'))).toBe('Boa tarde!');
  expect(greeting('Beto', new Date('2026-10-22T20:00:00'))).toBe('Boa noite, Beto!');
});
