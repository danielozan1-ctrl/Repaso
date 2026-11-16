// Lector de cronogramas pegados como texto. Detecta fechas, clasifica cada renglón
// y devuelve qué datos faltan para poder calcular los deadlines.
import { addDias, fechaValida, pad } from './fechas.js';

const MES = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};
const MES_RE = '(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)';
const RE = {
  rangoTxt: new RegExp(`\\b(\\d{1,2})\\s*(?:al|a|y|-|–)\\s*\\d{1,2}\\s*(?:de\\s+)?${MES_RE}\\b\\.?(?:\\s*(?:de\\s+|del\\s+)?(\\d{4}))?`, 'g'),
  txt: new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?${MES_RE}\\b\\.?(?:\\s*(?:de\\s+|del\\s+)?(\\d{4}))?`, 'g'),
  num3: /\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})\b/g,
  num2: /\b(\d{1,2})\/(\d{1,2})\b/g,
  iso: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  semana: /\bsem(?:ana)?\.?\s*(?:n[ro°º.]*\s*)?(\d{1,2})\b/g,
};
const DIA_INI = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)\b\.?/;
const SEP_INI = /^[\s\-–—:·•*|,;.()\[\]\t>]+/;

/** Minúsculas sin tildes, conservando el largo para que los índices coincidan con el original. */
const plano = (s) => s.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');

function clasificar(n) {
  if (/\b(feriado|receso|sin clases?|no hay clases?|asueto|paro|vacaciones)\b/.test(n)) return 'ignorar';
  if (/\b(repaso|consultas?|devolucion|entrega de notas|revision de examen)\b/.test(n)) return 'ignorar';
  if (/\brecup/.test(n)) return 'recuperatorio';
  if (/\b(entrega|tp|trabajo practico|trabajo final|monografia|informe)\b/.test(n) && !/\bparcial/.test(n)) return 'entrega';
  if (/\bparcial/.test(n)) return 'parcial';
  if (/\b(examen final|finales|final|integrador)\b/.test(n)) return 'final';
  return 'tema';
}

function buscarFechas(n) {
  const hits = [];
  const libre = (i, len) => !hits.some((h) => i < h.i + h.len && h.i < i + len);
  const add = (re, fn) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(n))) if (libre(m.index, m[0].length)) hits.push({ i: m.index, len: m[0].length, ...fn(m) });
  };
  add(RE.iso, (m) => ({ d: +m[3], m: +m[2], y: +m[1] }));
  add(RE.rangoTxt, (m) => ({ d: +m[1], m: MES[m[2]], y: m[3] ? +m[3] : null }));
  add(RE.txt, (m) => ({ d: +m[1], m: MES[m[2]], y: m[3] ? +m[3] : null }));
  add(RE.num3, (m) => ({ d: +m[1], m: +m[2], y: m[3].length === 2 ? 2000 + +m[3] : +m[3] }));
  add(RE.num2, (m) => ({ d: +m[1], m: +m[2], y: null }));
  add(RE.semana, (m) => ({ semana: +m[1] }));
  return hits.sort((a, b) => a.i - b.i);
}

function limpiarTitulo(orig, n, hits) {
  const chars = [...orig];
  // orig y n tienen el mismo largo en unidades UTF-16; trabajamos por índice de string
  let s = orig;
  let np = n;
  for (const h of [...hits].sort((a, b) => b.i - a.i)) {
    s = s.slice(0, h.i) + ' ' + s.slice(h.i + h.len);
    np = np.slice(0, h.i) + ' ' + np.slice(h.i + h.len);
  }
  void chars;
  for (let k = 0; k < 6; k++) {
    const a = np.match(SEP_INI);
    if (a) { s = s.slice(a[0].length); np = np.slice(a[0].length); continue; }
    const d = np.match(DIA_INI);
    if (d) { s = s.slice(d[0].length); np = np.slice(d[0].length); continue; }
    const r = np.match(/^(al|a|hasta)\s+(?=[\s\-–:]|$)/);
    if (r) { s = s.slice(r[0].length); np = np.slice(r[0].length); continue; }
    break;
  }
  return s.replace(/\s{2,}/g, ' ').replace(/[\s\-–—:,;|(]+$/, '').trim();
}

/**
 * Paso 1: leer el texto.
 * @returns {items, necesita:{anio, semana1, sinFecha:[indices de exámenes sin fecha]}}
 */
export function leerCronograma(texto) {
  const items = [];
  for (const cruda of texto.normalize('NFC').split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    const n = plano(linea);
    const hits = buscarFechas(n);
    const f = hits.find((h) => h.d) || null;
    const sem = hits.find((h) => h.semana) || null;
    const tipo = clasificar(n);
    // Encabezados del documento ("Cronograma 2026", "Fecha | Tema")
    if (!hits.length && /^(cronograma|calendario|programa|planificacion|catedra|materia|fechas?|clase\s*[|\t]|semana\s*[|\t])/.test(n)) continue;
    let titulo = limpiarTitulo(linea, n, hits);
    if (!titulo) {
      if (tipo === 'tema') continue; // renglón que es solo una fecha
      titulo = tipo[0].toUpperCase() + tipo.slice(1);
    }
    if (tipo === 'tema' && !/[a-zA-ZÀ-ſ]{3}/.test(titulo)) continue;
    items.push({
      linea, tipo, titulo,
      d: f?.d ?? null, m: f?.m ?? null, y: f?.y ?? null,
      semana: !f && sem ? sem.semana : null,
      fecha: null, dudas: [],
    });
  }
  return { items, necesita: calcularNecesita(items) };
}

const esExamen = (t) => t === 'parcial' || t === 'recuperatorio' || t === 'final' || t === 'entrega';

function calcularNecesita(items) {
  return {
    anio: items.some((it) => it.d && !it.y),
    semana1: items.some((it) => it.semana),
    sinFecha: items.map((it, i) => (esExamen(it.tipo) && !it.d && !it.semana ? i : -1)).filter((i) => i >= 0),
  };
}

/**
 * Paso 2: con las respuestas del usuario, calcula la fecha de cada renglón.
 * resp: {anio:number, semana1:'YYYY-MM-DD', fechas:{[indice]:'YYYY-MM-DD'}}
 */
export function resolverFechas(items, resp = {}) {
  let anio = resp.anio || new Date().getFullYear();
  let mesPrev = null;
  return items.map((it0, i) => {
    const it = { ...it0, dudas: [] };
    if (resp.fechas?.[i]) {
      it.fecha = resp.fechas[i];
    } else if (it.d) {
      let { d, m, y } = it;
      if (!y) {
        // Cronograma que cruza de año (ej. noviembre → marzo)
        if (mesPrev != null && m <= 12 && m < mesPrev - 5) anio++;
        y = anio;
      } else {
        anio = y;
      }
      if (!fechaValida(y, m, d) && fechaValida(y, d, m)) {
        [d, m] = [m, d];
        it.dudas.push('Leí la fecha como mes/día. Revisala.');
      }
      if (fechaValida(y, m, d)) {
        it.fecha = `${y}-${pad(m)}-${pad(d)}`;
        mesPrev = m;
      } else {
        it.dudas.push('No pude entender la fecha.');
      }
    } else if (it.semana && resp.semana1) {
      it.fecha = addDias(resp.semana1, (it.semana - 1) * 7);
    }
    if (esExamen(it.tipo) && !it.fecha) it.dudas.push('Falta la fecha.');
    return it;
  });
}

/**
 * Paso 3: arma exámenes y temas. Cada tema queda asociado al primer parcial que
 * aparece después de él; los que vienen después del último parcial van al final.
 */
export function armarMateria(items, nuevoId) {
  const examenes = [];
  const temas = [];
  let sueltos = [];
  let huboParcial = false;
  for (const it of items) {
    if (it.tipo === 'ignorar') continue;
    if (it.tipo === 'tema') {
      const t = { titulo: it.titulo, fechaClase: it.fecha || null, examenId: null };
      temas.push(t);
      sueltos.push(t);
      continue;
    }
    const ex = { id: nuevoId(), tipo: it.tipo, titulo: it.titulo, fecha: it.fecha || '' };
    examenes.push(ex);
    if (it.tipo === 'parcial') {
      sueltos.forEach((t) => (t.examenId = ex.id));
      sueltos = [];
      huboParcial = true;
    } else if (it.tipo === 'final' && huboParcial) {
      sueltos.forEach((t) => (t.examenId = ex.id));
      sueltos = [];
    }
  }
  return { examenes, temas };
}
