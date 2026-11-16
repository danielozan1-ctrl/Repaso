// Utilidades de fecha. Las fechas se guardan como 'YYYY-MM-DD' en hora local.
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoyISO = () => iso(new Date());
export function aDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDias(s, n) {
  const d = aDate(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
/** Días de a hasta b (positivo si b es posterior). */
export const diffDias = (a, b) => Math.round((aDate(b) - aDate(a)) / 864e5);
export const diaSemana = (s) => aDate(s).getDay();
export const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function aMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export const aHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export function horaActualMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
export function fechaCorta(s) {
  const d = aDate(s);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
export const lunesDe = (s) => addDias(s, -((diaSemana(s) + 6) % 7));
export function fechaValida(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
