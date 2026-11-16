// Exportación a calendario (.ics) con alarma 5 minutos antes de cada hueco.
import { pad, aHHMM, DIAS_L, diaSemana } from './fechas.js';

const escIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (fecha, min) => `${fecha.replace(/-/g, '')}T${aHHMM(min).replace(':', '')}00`;
function plegar(linea) {
  const out = [];
  let s = linea;
  while (s.length > 60) {
    out.push(s.slice(0, 60));
    s = ' ' + s.slice(60);
  }
  out.push(s);
  return out.join('\r\n');
}

/** planes: salida de semanaTentativa (un plan por día). mat: materias por id. */
export function generarICS(planes, mat) {
  const ahora = new Date();
  const sello = `${ahora.getUTCFullYear()}${pad(ahora.getUTCMonth() + 1)}${pad(ahora.getUTCDate())}T${pad(ahora.getUTCHours())}${pad(ahora.getUTCMinutes())}00Z`;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Repaso//ES', 'CALSCALE:GREGORIAN'];
  for (const plan of planes) {
    for (const b of plan.bloques) {
      if (b.pasado || b.fin <= b.inicio) continue;
      const nombres = [...new Set(b.items.map((it) => mat[it.materiaId]?.nombre).filter(Boolean))];
      const tipo = b.items.some((it) => it.tipo === 'nuevo') ? 'material nuevo + repaso' : 'repaso con preguntas';
      const titulo = `Estudio: ${nombres.length ? nombres.join(' + ') : 'repaso'}`;
      const desc = [
        b.hueco.planSiEntonces || `Si es ${DIAS_L[diaSemana(plan.fecha)]} a las ${b.hueco.inicio}, abro Repaso y hago lo que toca.`,
        `Previsto: ${tipo}. El tema exacto se recalcula: miralo en la app.`,
      ].join('\n');
      L.push(
        'BEGIN:VEVENT',
        `UID:${plan.fecha}-${b.hueco.id}@repaso`,
        `DTSTAMP:${sello}`,
        `DTSTART:${dt(plan.fecha, b.inicio)}`,
        `DTEND:${dt(plan.fecha, b.fin)}`,
        `SUMMARY:${escIcs(titulo)}`,
        `DESCRIPTION:${escIcs(desc)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escIcs(b.hueco.planSiEntonces || titulo)}`,
        'TRIGGER:-PT5M',
        'END:VALARM',
        'END:VEVENT',
      );
    }
  }
  L.push('END:VCALENDAR');
  return L.map(plegar).join('\r\n') + '\r\n';
}
