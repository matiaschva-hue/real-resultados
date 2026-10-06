// Lector automático de resultados y tablas para la app de resultados REAL.
// Uso: node actualizar.mjs [AAAA-MM-DD domingo del finde] [ids,separados]
// Escribe data/<domingo>.json (+ index.json) junto a este archivo. Lo que una fuente no trae se conserva del archivo anterior.
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';

const OUT = process.env.RES_OUT || fileURLToPath(new URL('./data', import.meta.url));
const FS = 'https://www.flashscore.de/feldhockey/';
const LIGAS = [
  { id: 'nl', pais: 'PAÍSES BAJOS', pais_en: 'NETHERLANDS', liga: 'HOOFDKLASSE', knhb: { m: 'lmdzprlesfiv', f: 'mqtcokvtpune' }, m: 'niederlande/hoofdklasse', f: 'niederlande/hoofdklasse-frauen' },
  { id: 'be', pais: 'BÉLGICA', pais_en: 'BELGIUM', liga: 'BELGIAN HOCKEY LEAGUE', sportlink: { m: "Men's Hockey League - A", f: "Women's Hockey League - A" }, m: 'belgien/hockey-league' },
  { id: 'es', pais: 'ESPAÑA', pais_en: 'SPAIN', liga: 'LIGA IATI · LIGA IBERDROLA', rfeh: { m: 1, f: 8 }, m: 'spanien/division-de-honor', f: 'spanien/liga-iberdrola-frauen' },
  { id: 'de', pais: 'ALEMANIA', pais_en: 'GERMANY', liga: '1. BUNDESLIGA', dhb: { m: 'herren', f: 'damen' }, m: 'deutschland/1-bundesliga', f: 'deutschland/1-bundesliga-frauen' },
  { id: 'en', pais: 'INGLATERRA', pais_en: 'ENGLAND', liga: 'PREMIER DIVISION', nombres: { m: 'https://www.englandhockey.co.uk/competitions-and-events/open-men-s-hockey-league/ehl-open-men-premier-division', f: 'https://www.englandhockey.co.uk/competitions-and-events/womens-hockey-league/ehl-women-premier-division' }, m: 'england/premier-division', f: 'england/premier-division-frauen' },
  { id: 'it', pais: 'ITALIA', pais_en: 'ITALY', liga: 'SERIE A ELITE', fih: true, m: 'italien/serie-a1' },
  { id: 'ar', pais: 'ARGENTINA', pais_en: 'ARGENTINA', liga: 'METROPOLITANO · PRIMERA A', larry: true },
  { id: 'au', pais: 'AUSTRALIA', pais_en: 'AUSTRALIA', liga: 'HOCKEY ONE', inicio: '08/10', m: 'australien/hockey-one', f: 'australien/hockey-one-frauen' },
];

// ---------- finde ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function domingo(arg) {
  if (arg) return new Date(arg + 'T12:00:00');
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; // domingo más reciente (hoy si es domingo)
}
const DOM = domingo(process.argv[2] && /^\d{4}-/.test(process.argv[2]) ? process.argv[2] : null);
const ONLY = (process.argv.find(a => /^[a-z]{2}(,[a-z]{2})*$/.test(a)) || '').split(',').filter(Boolean);
// ventana del finde: viernes a lunes; Hockey One (Australia) juega desde el miércoles
let DIAS_ANTES = 2;
const enFinde = d => { const a = new Date(DOM), b = new Date(DOM); a.setDate(a.getDate() - DIAS_ANTES); a.setHours(0, 0, 0, 0); b.setDate(b.getDate() + 1); b.setHours(23, 59, 59, 0); return d >= a && d <= b; };
const limpiar = s => s.replace(/\s+F$/, '').trim(); // Flashscore agrega " F" a los equipos femeninos

// navegar con reintentos (Flashscore a veces tarda)
async function ir(pg, url, opt) { for (let i = 0; ; i++) { try { return await pg.goto(url, opt); } catch (e) { if (i >= 2) throw e; await new Promise(r => setTimeout(r, 3000)); } } }

// ---------- KNHB (Países Bajos, fuente oficial: Match Center de hockey.nl) ----------
const MESES_NL = { januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5, juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11 };
const sinEquipo = s => s.replace(/\s+[HD]1$/, '').trim(); // "Oranje-Rood H1" → "Oranje-Rood"
async function knhb(pg, comp) {
  const base = 'https://www.hockey.nl/match-center#/competitions/national/' + comp;
  const R = fn => pg.evaluate(fn);
  await ir(pg, base + '/overview', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForFunction(() => document.querySelector('match-center')?.shadowRoot?.querySelector('.standing .row'), { timeout: 20000 });
  const filas = await R(() => [...document.querySelector('match-center').shadowRoot.querySelectorAll('.standing .row')].map(r => [...r.children].map(c => c.textContent.trim())));
  const tabla = filas.filter(c => /^\d+$/.test(c[0])).map(c => ({ eq: sinEquipo(c[2]), pj: +c[3], pts: +c[4], dg: +c[5] }));
  await ir(pg, 'about:blank');
  await ir(pg, base + '/results', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForFunction(() => [...(document.querySelector('match-center')?.shadowRoot?.querySelectorAll('a') || [])].some(a => /\d+\s*-\s*\d+/.test(a.textContent)), { timeout: 20000 }).catch(() => {});
  const items = await R(() => {
    const out = []; let f = '';
    for (const e of document.querySelector('match-center').shadowRoot.querySelectorAll('*')) {
      const t = e.textContent.trim();
      if (e.children.length === 0 && /^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag) \d{1,2} \w+ \d{4}$/i.test(t)) f = t;
      if (e.tagName === 'A' && /\d+\s*-\s*\d+/.test(t)) out.push({ f, lines: e.innerText.split('\n').map(x => x.trim()).filter(Boolean) });
    }
    return out;
  });
  const ms = [];
  for (const it of items) {
    const m = /(\d{1,2}) (\w+) (\d{4})/.exec(it.f); if (!m) continue;
    const d = new Date(+m[3], MESES_NL[m[2].toLowerCase()], +m[1], 12); if (!enFinde(d)) continue;
    const si = it.lines.findIndex(x => /^\d+\s*-\s*\d+/.test(x)); if (si < 1) continue;
    const [ga, gb] = it.lines[si].match(/\d+/g).map(Number);
    const so = /\((\d+)\s*-\s*(\d+)\)/.exec(it.lines[si]); // tanda de shoot-outs, si la muestran
    const row = [sinEquipo(it.lines[si - 1]), ga, gb, sinEquipo(it.lines[si + 1] || '')];
    if (so) row.push({ so: [+so[1], +so[2]] });
    ms.push(row);
  }
  return { ms, tabla };
}

// ---------- DHB (Alemania, fuente oficial: hockeybundesliga.de) ----------
async function dhb(pg, rama) {
  await ir(pg, 'https://www.hockeybundesliga.de/match-center/1-bundesliga-1/' + rama, { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForSelector('tr.table-standings__table-row', { timeout: 20000 });
  return pg.evaluate(() => {
    const tabla = [...document.querySelectorAll('tr.table-standings__table-row')].map(tr => {
      const c = [...tr.children].map(td => td.innerText.trim());
      const g = c.find(x => /^\d+\s*:\s*\d+$/.test(x)) || '0:0', [gf, gc] = g.split(':').map(Number);
      return { eq: tr.querySelector('.table__label--full')?.textContent.trim() || c[1], pj: +c[2], pts: +c[c.length - 1], gf, gc };
    });
    const gol = [...document.querySelectorAll('.matchcenter-top-scorers-wrapper tr')].map(tr => {
      const q = k => tr.querySelector('.table-scorers__' + k)?.textContent.trim(), c = [...tr.children].map(td => td.innerText.trim());
      return q('player-name') ? { nom: q('player-name'), eq: q('country-name'), pj: +c[1], g: +c[c.length - 1] } : null;
    }).filter(Boolean).slice(0, 10);
    return { tabla, gol };
  });
}
// nombre de Flashscore → nombre oficial de la tabla (por coincidencia de palabras)
const ALIAS = { rw: 'rot weiss', sw: 'schwarz weiss', bw: 'blau weiss' }; // abreviaturas de la tabla oficial
const clave = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').map(w => ALIAS[w] || w).join(' ').split(' ').filter(w => w.length > 2 && !['der', 'club', 'hockey', 'und', 'the'].includes(w));
function oficial(n, nombres) {
  const a = clave(n); let best = null, bs = 0;
  for (const o of nombres) { const b = clave(o), n = a.filter(w => b.some(x => x.startsWith(w) || w.startsWith(x))).length, sc = (n / Math.max(a.length, 1) + n / Math.max(b.length, 1)) / 2; if (sc > bs) { bs = sc; best = o; } }
  return bs >= .5 ? best : n;
}

// lista oficial de equipos (England Hockey publica los nombres, no las tablas): "CARDIFF & MET" → "Cardiff & Met"
async function nombresOficiales(pg, url) {
  await ir(pg, url, { waitUntil: 'networkidle2', timeout: 60000 });
  const t = await pg.evaluate(() => (document.querySelector('main') || document.body).innerText);
  const lines = t.split('\n').map(x => x.trim()), fin = lines.findIndex(x => /^INTERNATIONAL|^CONTINUE READING/.test(x));
  return lines.slice(0, fin > 0 ? fin : undefined).filter(x => /^[A-Z0-9&'. -]{3,40}$/.test(x) && !/^\d/.test(x))
    .map(x => x.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/\bOf\b/g, 'of'));
}

// ---------- RFEH (España, fuente oficial: resultadoshockey.isquad.es) ----------
const temporada = () => { const y = DOM.getFullYear() % 100, m = DOM.getMonth(); return m >= 7 ? `${y}${y + 1}` : `${y - 1}${y}`; };
// nombres oficiales largos → como se los conoce ("REAL CLUB DE CAMPO VILLA DE MADRID" → "Club de Campo")
function nombreES(n) {
  let x = n.replace(/,?\s*S\.?A\.?D\.?$/i, '').trim();
  const fijo = { 'REAL CLUB DE CAMPO VILLA DE MADRID': 'Club de Campo', 'UNION DEPORTIVA TABURIENTE': 'UD Taburiente', 'VALENCIA CLUB DE HOCKEY': 'Valencia CH', 'SANSE COMPLUTENSE': 'Sanse Complutense' };
  if (fijo[x.toUpperCase()]) return fijo[x.toUpperCase()];
  x = x.replace(/\s+HOCKEY CLUB$/i, '').replace(/\s+CLUB DE HOCKEY$/i, ' CH').replace(/\s+HOCKEY$/i, '');
  return x.toLowerCase().replace(/(^|[\s.(-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase())
    .replace(/\b(Rc|Cd|Ud|Rs|Fc|Ch|Sad|Cf|Hc)\b/g, w => w.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, w => w.toLowerCase());
}
async function rfeh(pg, cat) {
  const url = `https://resultadoshockey.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_categoria=${cat}&id_temp=${temporada()}&id_ambito=0&id_territorial=9999`;
  await ir(pg, url, { waitUntil: 'networkidle2', timeout: 60000 });
  const links = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('a')].filter(a => /^(CLASIFICACIONES|GOLEADORAS|GOLEADORES|TODAS)$/.test(a.textContent.trim())).map(a => [a.textContent.trim(), a.href])));
  const jorDef = ((await pg.evaluate(() => document.body.innerText)).match(/JORNADA \d+/) || [''])[0]; // jornada que muestra por defecto (la última jugada)
  if (links.TODAS) { await ir(pg, links.TODAS, { waitUntil: 'networkidle2', timeout: 60000 }); }
  const filas = await pg.evaluate(() => {
    const out = []; let jor = '';
    for (const e of document.querySelectorAll('*')) {
      const t = e.children.length === 0 ? e.textContent.trim() : '';
      if (/^JORNADA \d+$/.test(t)) jor = t;
      if (e.tagName === 'TR' && /Finalizado/.test(e.innerText)) out.push({ jor, c: [...e.children].map(td => td.innerText.trim()) });
    }
    return out;
  });
  const ms = []; let jornada = '';
  for (const { jor, c } of filas) {
    const f = /(\d{2})\/(\d{2})\/(\d{4})/.exec(c.join(' ')); if (!f) continue;
    if (!enFinde(new Date(+f[3], +f[2] - 1, +f[1], 12))) continue;
    const eq = c[0].split('\n').map(x => x.trim()).filter(x => x && x !== 'VS' && x !== '-');
    const g = (c[1].match(/\d+/g) || []).map(Number); if (eq.length < 2 || g.length < 2) continue;
    ms.push([nombreES(eq[0]), g[0], g[1], nombreES(eq[1])]); jornada = jornada || jor;
  }
  let tabla = [], gol = [];
  if (links.CLASIFICACIONES) {
    await ir(pg, links.CLASIFICACIONES, { waitUntil: 'networkidle2', timeout: 60000 });
    tabla = (await pg.evaluate(() => [...document.querySelectorAll('tr')].map(r => [...r.children].map(c => c.innerText.trim())))).filter(c => /^\d+$/.test(c[0]) && c.length >= 10)
      .map(c => ({ eq: nombreES(c[1].replace(/^\d+\s+/, '').split('\n').pop().trim()), pts: +c[3], pj: +c[4], gf: parseInt(c[8]), gc: parseInt(c[9]) }));
  }
  const gl = links.GOLEADORAS || links.GOLEADORES;
  if (gl) {
    await ir(pg, gl, { waitUntil: 'networkidle2', timeout: 60000 });
    await pg.waitForFunction(() => [...document.querySelectorAll('tr')].some(r => /^\d+$/.test(r.children[0]?.innerText.trim())), { timeout: 15000 }).catch(() => {});
    gol = (await pg.evaluate(() => [...document.querySelectorAll('tr')].map(r => [...r.children].map(c => c.innerText.trim())))).filter(c => /^\d+$/.test(c[0]) && c[1])
      .slice(0, 10).map(c => ({ nom: nombreES(c[1]).replace(/\b(Ch|CD|RC|UD|RS|FC|CH)\b/g, w => w[0] + w.slice(1).toLowerCase()), eq: nombreES(c[2]), g: +c[3], pj: +c[4] }));
  }
  return { ms, tabla, gol, jornada: jornada || jorDef };
}

// ---------- Hockey Belgium (fuente oficial: Sportlink de hockey.be, devuelve JSON) ----------
const SL = ep => `https://hockey.be/wp-json/sportlink-api/cached?lang=fr&endpoint=${ep}&dump=&clubid=&facilityid=`; // el orden de los parámetros importa
const ACENTOS_BE = { Oree: 'Orée', Leopold: 'Léopold' };
const sinTags = h => String(h).replace(/<br\s*\/?>[\s\S]*$/, '').replace(/<[^>]+>/g, '').trim();
const nombreBE = n => { const x = n.replace(/\s+[DH]-\d+$/, '').trim(); return ACENTOS_BE[x] || x; };
let poolsBE = null;
async function sportlink(nombrePool) {
  if (!poolsBE) { // los id de las divisiones cambian cada temporada: se buscan por nombre en el buscador oficial
    const html = await (await fetch('https://hockey.be/fr/competition/calendrier-resultats-et-classements/')).text();
    poolsBE = [...html.matchAll(/<option value="(\d+)"[^>]*>([^<]+)<\/option>/g)].map(m => [m[1], m[2].trim()]);
  }
  const pool = (poolsBE.find(([, t]) => /Outdoor/.test(t) && t.endsWith(nombrePool)) || [])[0];
  if (!pool) throw new Error('no encontré la división ' + nombrePool);
  const a = new Date(DOM), b = new Date(DOM); a.setDate(a.getDate() - DIAS_ANTES); b.setDate(b.getDate() + 1);
  const q = `&poolid=${pool}&from=${iso(a)}&to=${iso(b)}`;
  const res = await (await fetch(SL('results') + q)).json();
  const ms = (res.data || []).map(x => { const g = (sinTags(x[5]).match(/\d+/g) || []).map(Number); const d = String(x[0]).split('/').reverse().join('-'); return g.length < 2 ? null : [nombreBE(sinTags(x[3])), g[0], g[1], nombreBE(sinTags(x[7])), { d }]; }).filter(Boolean).reverse();
  const st = await (await fetch(SL('standing') + q)).json();
  const tabla = (st.data || []).map(x => ({ eq: nombreBE(x[1]), pj: +x[2], gf: +x[6], gc: +x[7], pts: +x[8] }));
  return { ms, tabla };
}

// ---------- Federhockey (Italia, fuente oficial: comunicados "#PRATO/I RISULTATI DELLE GARE DI ...") ----------
const MESES_IT = { gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5, luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11 };
const texto = html => html.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h\d>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'").replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù').replace(/&igrave;/g, 'ì');
async function federhockey() {
  const base = 'https://www.federhockey.it';
  const idx = await (await fetch(base + '/49-campionati/campionati-prato.html')).text();
  const arts = [...new Set([...idx.matchAll(/href="([^"]*risultati-delle-gare-di-[a-z]+-(\d{1,2})-([a-z]+)-(\d{4})[^"]*\.html)"/g)].map(m => m[1]))];
  const out = { m: [], f: [], jornada: '' };
  for (const u of arts) {
    const m = /-(\d{1,2})-([a-z]+)-(\d{4})/.exec(u); if (!m || MESES_IT[m[2]] == null) continue;
    if (!enFinde(new Date(+m[3], MESES_IT[m[2]], +m[1], 12))) continue;
    const lines = texto(await (await fetch(u.startsWith('http') ? u : base + u)).text()).split('\n').map(x => x.trim()).filter(Boolean);
    let sec = null;
    for (const l of lines) {
      const h = /^SERIE A ELITE (MASCHILE|FEMMINILE).*?Giornata (\d+)/i.exec(l);
      if (h) { sec = h[1].toUpperCase() === 'MASCHILE' ? 'm' : 'f'; if (sec === 'm') out.jornada = 'FECHA ' + h[2]; continue; }
      if (/^(SERIE|COPPA|GIRONE|POULE|PLAY|FINAL|SUPERCOPPA)\b/i.test(l)) { sec = null; continue; } // otro encabezado (Serie A1, Coppa Federale...)
      if (!sec) continue;
      const g = /^(.+?)\s*-\s*(.+?)\s+(\d+)\s*-\s*(\d+)(?:\s*\((.*)\))?\s*$/.exec(l);
      const sp = x => x.replace(/\s+/g, ' ').trim();
      if (g) out[sec].push([sp(g[1]), +g[3], +g[4], sp(g[2])]);
    }
  }
  return out;
}

// ---------- Flashscore ----------
async function fsResultados(pg, slug) {
  await ir(pg, FS + slug + '/ergebnisse/', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForSelector('.event__match', { timeout: 15000 }).catch(() => {});
  const filas = await pg.evaluate(() => {
    let ronda = '';
    const out = [];
    for (const e of document.querySelectorAll('.event__round, .event__match')) {
      if (e.matches('.event__round')) { ronda = e.innerText.trim(); continue; }
      const q = s => e.querySelector(s)?.innerText.trim() ?? '';
      const parts = [...e.querySelectorAll('[class*="event__part--home"]')].map(x => x.innerText.trim());
      out.push({ ronda, time: q('.event__time'), home: q('[class*="event__participant--home"], .event__homeParticipant'), away: q('[class*="event__participant--away"], .event__awayParticipant'),
        sh: q('[class*="event__score--home"]'), sa: q('[class*="event__score--away"]'), stage: q('.event__stage'), raw: e.innerText });
    }
    return out;
  });
  const anio = DOM.getFullYear();
  const ms = [];
  let ronda = '';
  for (const f of filas) {
    const m = /(\d{2})\.(\d{2})\./.exec(f.time || f.raw); if (!m) continue;
    let d = new Date(anio, +m[2] - 1, +m[1], 12); if (d - DOM > 200 * 864e5) d = new Date(anio - 1, +m[2] - 1, +m[1], 12);
    if (!enFinde(d)) continue;
    let ga = parseInt(f.sh), gb = parseInt(f.sa); if (isNaN(ga) || isNaN(gb)) continue;
    const x = {};
    if (/n\.\s?P\./.test(f.raw)) { // definido por penales: el total incluye la tanda → restar los dos últimos números
      const nums = f.raw.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);
      const so = nums.slice(-2); x.so = so; ga -= so[0]; gb -= so[1];
    }
    ms.push(Object.keys(x).length ? [limpiar(f.home), ga, gb, limpiar(f.away), x] : [limpiar(f.home), ga, gb, limpiar(f.away)]);
    ronda = ronda || f.ronda;
  }
  return { ms, ronda };
}
async function fsTabla(pg, slug) {
  await ir(pg, FS + slug + '/tabelle/', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForSelector('.ui-table__row', { timeout: 15000 }).catch(() => {});
  const rows = await pg.evaluate(() => [...document.querySelectorAll('.ui-table__row')].map(r => r.innerText.split('\n').map(s => s.trim()).filter(Boolean)));
  return rows.map(c => {
    const gi = c.findIndex(s => /^\d+:\d+$/.test(s)); if (gi < 0) return null;
    const [gf, gc] = c[gi].split(':').map(Number);
    return { eq: limpiar(c[1]), pts: +c[gi + 1], pj: +c[2], gf, gc };
  }).filter(Boolean);
}

// próximo partido programado (para avisar cuándo arranca o sigue la liga)
async function fsProximo(pg, slug) {
  await ir(pg, FS + slug + '/begegnungen/', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForSelector('.event__match', { timeout: 10000 }).catch(() => {});
  const t = await pg.evaluate(() => document.querySelector('.event__match .event__time')?.innerText || '');
  const m = /(d{2}).(d{2})./.exec(t); return m ? `${m[1]}/${m[2]}` : '';
}

// ---------- LarrySport (Argentina) ----------
const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
async function larry(pg, rama, torneo) {
  const base = 'https://tournamenttracker.buenosaireshockey.ar/';
  await ir(pg, base, { waitUntil: 'networkidle2', timeout: 60000 });
  const click = async (fn, arg) => { const ok = await pg.evaluate(fn, arg); if (!ok) throw new Error('LarrySport: no encontré ' + arg); await new Promise(r => setTimeout(r, 1500)); };
  const exact = t => [...document.querySelectorAll('main *, button, span, div')].find(e => e.children.length <= 1 && e.innerText?.trim() === t);
  // rama: la página arranca en Femenino; para Masculino se abre el paso de la miga y se elige el botón
  const actual = await pg.evaluate(() => [...document.querySelectorAll('main button')].map(b => b.innerText.trim()).find(t => /^(Masculino|Femenino)$/.test(t)));
  if (actual !== rama) {
    await click(() => { const b = [...document.querySelectorAll('main button')].find(b => /^(Masculino|Femenino)$/.test(b.innerText.trim())); if (!b) return false; b.click(); return true; }, 'miga de rama');
    await click(r => { const b = [...document.querySelectorAll('main button')].find(b => b.innerText.trim().endsWith(r)); if (!b) return false; b.click(); return true; }, rama);
    await pg.waitForFunction(() => [...document.querySelectorAll('button[role=radio]')].some(b => /^Primera/.test(b.innerText)), { timeout: 10000 }).catch(() => {});
  }
  await click(() => { const b = [...document.querySelectorAll('button[role=radio]')].find(b => /^Primera/.test(b.innerText)); if (!b) return false; b.click(); return true; }, 'Primera');
  await click(t => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === t); if (!e) return false; e.click(); return true; }, torneo);
  await new Promise(r => setTimeout(r, 1500));
  const fecha = await pg.evaluate(() => [...document.querySelectorAll('button.ms-Button--primary')].map(b => b.innerText.trim()).find(t => /^\d+$/.test(t)) || '');
  await pg.waitForFunction(() => /Todas las fechas[\s\S]*\d{2} \w{3} \d{2}:\d{2}/.test(document.querySelector('main')?.innerText || ''), { timeout: 15000 }).catch(() => {});
  const fx = await pg.evaluate(() => document.querySelector('main').innerText);
  const ms = [];
  // la página antepone íconos (caracteres de uso privado) a las fechas: se limpian
  const L = fx.slice(fx.indexOf('Todas las fechas')).split('\n').map(s => s.replace(/[-​-‏﻿]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (process.env.DEBUG) console.log(rama, torneo, JSON.stringify(L.slice(0, 8)), [...(L[1] || '')].map(c => c.charCodeAt(0)).join(','));
  for (let i = 0; i < L.length - 4; i++) {
    const m = /^(lun|mar|mié|jue|vie|sáb|dom)\w* (\d{2}) (\w{3})/.exec(L[i]); if (!m) continue;
    const d = new Date(DOM.getFullYear(), MES[m[3]], +m[2], 12);
    if (/^\d+$/.test(L[i + 2]) && /^\d+$/.test(L[i + 3]) && enFinde(d)) ms.push([cap(L[i + 1]), +L[i + 2], +L[i + 3], cap(L[i + 4])]);
  }
  const tab = async t => { await pg.evaluate(t => [...document.querySelectorAll('main button, main [role=tab]')].find(b => b.innerText.trim() === t)?.click(), t); await new Promise(r => setTimeout(r, 2500)); return pg.evaluate(() => document.querySelector('main').innerText); };
  const pos = (await tab('Posiciones')).split('\n').map(s => s.trim()).filter(Boolean);
  const tabla = [];
  for (let i = pos.indexOf('PB') + 1; i < pos.length - 10; i += 11) {
    if (!/^\d+$/.test(pos[i])) break;
    tabla.push({ eq: pos[i + 1], pts: +pos[i + 2], pj: +pos[i + 3], gf: +pos[i + 7], gc: +pos[i + 8] });
  }
  const gl = (await tab('Goleadores')).split('\n').map(s => s.trim()).filter(Boolean);
  const gol = [];
  for (let i = gl.indexOf('Promedio') + 1; i < gl.length - 5 && gol.length < 10; i += 6) {
    if (!/^\d+$/.test(gl[i])) break;
    gol.push({ nom: gl[i + 1], eq: gl[i + 2], g: +gl[i + 3], pj: +gl[i + 4] });
  }
  return { ms, tabla, gol, fecha };
}
// "BCO. PROVINCIA" → "Bco. Provincia"
const ACENTOS = { Barbara: 'Bárbara', Nacion: 'Nación', Catherines: "Catherine's", Martin: 'Martín' };
const cap = s => s.toLowerCase().replace(/(^|[\s.(-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/\bY\b/g, 'y').replace(/\p{L}+/gu, w => ACENTOS[w] || w);

// ---------- principal ----------
const file = `${OUT}/${iso(DOM)}.json`;
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { paises: [] };
const ahora = new Date(), sello = `${iso(ahora)} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--lang=de-DE', '--no-sandbox'] });
const pg = await br.newPage();
await pg.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36');
await pg.setViewport({ width: 1280, height: 900 });
const paises = [];
for (const L of LIGAS) {
  const old = prev.paises.find(p => p.id === L.id) || {};
  if (ONLY.length && !ONLY.includes(L.id)) { if (old.id) paises.push(old); continue; }
  const p = { ...old, id: L.id, pais: L.pais, pais_en: L.pais_en, liga: L.liga };
  DIAS_ANTES = L.id === 'au' ? 4 : 2;
  try {
    if (L.fih) {
      const o = await federhockey();
      if (o.m.length) p.m = o.m; else if (!old.m) p.m = [];
      if (o.f.length) p.f = o.f; else if (!old.f) p.f = [];
      if (o.jornada) p.jornada = o.jornada;
      const tabla = { ...(p.tabla || {}) }, t = await fsTabla(pg, L.m), nombres = [...new Set([...(p.m || []), ...(old.m || [])].flatMap(x => [x[0], x[3]]))];
      if (t.some(x => x.pj > 0)) tabla.m = t.map(x => ({ ...x, eq: oficial(x.eq, nombres) }));
      p.tabla = tabla; p.fuente = 'Federhockey · federhockey.it (oficial) + Flashscore (tabla)';
    } else if (L.sportlink) {
      const tabla = { ...(p.tabla || {}) };
      for (const k of ['m', 'f']) {
        try { const o = await sportlink(L.sportlink[k]); if (o.ms.length) p[k] = o.ms; else if (!old[k]) p[k] = []; if (o.tabla.length) tabla[k] = o.tabla; }
        catch (e) { console.log(L.id, k, 'Hockey Belgium falló:', e.message); if (L[k]) { const r = await fsResultados(pg, L[k]); if (r.ms.length) p[k] = r.ms; } }
      }
      p.tabla = tabla; p.fuente = 'Hockey Belgium · hockey.be (oficial)';
    } else if (L.rfeh) {
      const tabla = { ...(p.tabla || {}) }, gol = { ...(p.goleadores || {}) };
      for (const k of ['m', 'f']) {
        try {
          const o = await rfeh(pg, L.rfeh[k]);
          if (o.ms.length) p[k] = o.ms; else if (!old[k]) p[k] = [];
          if (o.tabla.length) tabla[k] = o.tabla; if (o.gol.length) gol[k] = o.gol;
          if (k === 'm' && o.jornada) p.jornada = o.jornada.replace('JORNADA', 'FECHA');
        } catch (e) { console.log(L.id, k, 'RFEH falló, uso Flashscore:', e.message); const r = await fsResultados(pg, L[k]); if (r.ms.length) p[k] = r.ms; }
      }
      p.tabla = tabla; p.goleadores = gol; p.fuente = 'RFEH · resultadoshockey.isquad.es (oficial)';
    } else if (L.dhb) {
      const tabla = { ...(p.tabla || {}) }, gol = { ...(p.goleadores || {}) };
      for (const k of ['m', 'f']) {
        let ofi = null;
        try { ofi = await dhb(pg, L.dhb[k]); if (ofi.tabla.length) tabla[k] = ofi.tabla; if (ofi.gol.length) gol[k] = ofi.gol; } catch (e) { console.log(L.id, k, 'DHB falló:', e.message); }
        const r = await fsResultados(pg, L[k]);
        const nombres = (tabla[k] || []).map(x => x.eq);
        if (r.ms.length) p[k] = r.ms.map(([a, ga, gb, b, x]) => x ? [oficial(a, nombres), ga, gb, oficial(b, nombres), x] : [oficial(a, nombres), ga, gb, oficial(b, nombres)]); else if (!old[k]) p[k] = [];
        if (!ofi || !ofi.tabla.length) { const t = await fsTabla(pg, L[k]); if (t.some(x => x.pj > 0)) tabla[k] = t; }
      }
      p.tabla = tabla; p.goleadores = gol; p.fuente = 'hockeybundesliga.de (oficial) + Flashscore';
    } else if (L.knhb) {
      const tabla = { ...(p.tabla || {}) };
      for (const k of ['m', 'f']) {
        try { const r = await knhb(pg, L.knhb[k]); if (r.ms.length) p[k] = r.ms; else if (!old[k]) p[k] = []; if (r.tabla.length) tabla[k] = r.tabla; }
        catch (e) { console.log(L.id, k, 'KNHB falló, uso Flashscore:', e.message); const r = await fsResultados(pg, L[k]); if (r.ms.length) p[k] = r.ms; const t = await fsTabla(pg, L[k]); if (t.some(x => x.pj > 0)) tabla[k] = t; }
      }
      p.tabla = tabla; p.fuente = 'KNHB · hockey.nl (oficial)';
    } else if (L.larry) {
      await pg.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR' });
      const m = await larry(pg, 'Masculino', 'Caballeros A'), f = await larry(pg, 'Femenino', 'Damas A');
      Object.assign(p, { m: m.ms.length ? m.ms : (p.m || []), f: f.ms.length ? f.ms : (p.f || []), tabla: { m: m.tabla, f: f.tabla }, goleadores: { m: m.gol, f: f.gol }, jornada: m.fecha ? 'FECHA ' + m.fecha : p.jornada, fuente: 'LarrySport TournamentTracker (AHBA)' });
    } else {
      const tabla = { ...(p.tabla || {}) };
      for (const k of ['m', 'f']) {
        if (!L[k]) continue;
        const r = await fsResultados(pg, L[k]);
        let ofi = [];
        if (L.nombres && L.nombres[k]) { try { ofi = await nombresOficiales(pg, L.nombres[k]); } catch (e) { console.log(L.id, k, 'nombres oficiales:', e.message); } }
        const ren = n => ofi.length ? oficial(n, ofi) : n;
        if (r.ms.length) p[k] = r.ms.map(([a, ga, gb, b, x]) => x ? [ren(a), ga, gb, ren(b), x] : [ren(a), ga, gb, ren(b)]); else if (!old[k]) p[k] = [];
        const t = await fsTabla(pg, L[k]); if (t.some(r => r.pj > 0)) tabla[k] = t.map(x => ({ ...x, eq: ren(x.eq) }));
        const rn = /(\d+)\.\s*Runde|Spieltag\s*(\d+)/i.exec(r.ronda); if (k === 'm' && rn) p.jornada = 'FECHA ' + (rn[1] || rn[2]);
      }
      if (!(p.m || []).length && !(p.f || []).length) p.proximo = (await fsProximo(pg, L.m || L.f)) || L.inicio || '';
      p.tabla = tabla; p.fuente = old.fuente && !/flashscore/i.test(old.fuente) ? old.fuente + ' + Flashscore' : 'Flashscore';
    }
    // aviso para la app (no se publica): se jugó / no se jugó la fecha / la liga no arrancó
    const jugados = (p.m || []).length + (p.f || []).length, arranco = Object.values(p.tabla || {}).some(t => t.some(r => r.pj > 0));
    p.estado = jugados ? 'jugada' : arranco ? 'sin-fecha' : 'no-arranco';
    p.consulta = sello;
    console.log(L.id, 'm', (p.m || []).length, 'f', (p.f || []).length, 'tabla', Object.keys(p.tabla || {}).join('/'), p.jornada || '');
  } catch (e) { console.log(L.id, 'ERROR', e.message); }
  paises.push(p);
}
await br.close();
const out = { fecha: `${pad(DOM.getDate())}.${pad(DOM.getMonth() + 1)}.${DOM.getFullYear()}`, actualizado: sello, paises };
fs.writeFileSync(file, JSON.stringify(out, null, 1));
const idxF = `${OUT}/index.json`, idx = fs.existsSync(idxF) ? JSON.parse(fs.readFileSync(idxF, 'utf8')) : { semanas: [] };
if (!idx.semanas.includes(iso(DOM))) idx.semanas.push(iso(DOM));
idx.semanas.sort(); idx.ultima = idx.semanas[idx.semanas.length - 1]; idx.actualizado = sello;
fs.writeFileSync(idxF, JSON.stringify(idx));
console.log('ok', file);
