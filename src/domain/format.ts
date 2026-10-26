/** Datas guardadas em UTC (ISO); exibidas no fuso do aparelho, em pt-BR. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Boa tarde, Ana!" — usa só o primeiro nome; sem nome, "Boa tarde!". */
export function greeting(name: string, date = new Date()): string {
  const h = date.getHours();
  const base = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${base}, ${first}!` : `${base}!`;
}
