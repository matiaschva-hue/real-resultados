// Lector automático de resultados y tablas para la app de resultados REAL.
// Uso: node actualizar.mjs [AAAA-MM-DD domingo del finde] [ids,separados]
// Escribe data/<domingo>.json (+ index.json) junto a este archivo. Lo que una fuente no trae se conserva del archivo anterior.
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';

const OUT = process.env.RES_OUT || fileURLToPath(new URL('./data', import.meta.url));
const FS = 'https://www.flashscore.de/feldhockey/';
const LIGAS = [
  { id: 'nl', torneo: 'Hoofdklasse', pais: 'PAÍSES BAJOS', pais_en: 'NETHERLANDS', liga: 'HOOFDKLASSE', knhb: { m: 'lmdzprlesfiv', f: 'mqtcokvtpune' }, m: 'niederlande/hoofdklasse', f: 'niederlande/hoofdklasse-frauen' },
  { id: 'nl-gold', grupo: 'nl', torneo: 'Gold Cup', pais: 'PAÍSES BAJOS', pais_en: 'NETHERLANDS', liga: 'GOLD CUP', knhb: { m: 'iezytzblznnht', f: 'eprcsvgfooofj' }, copa: true },
  { id: 'be', torneo: 'Belgian Hockey League', pais: 'BÉLGICA', pais_en: 'BELGIUM', liga: 'BELGIAN HOCKEY LEAGUE', sportlink: { m: "Men's Hockey League - A", f: "Women's Hockey League - A" }, m: 'belgien/hockey-league' },
  { id: 'es', torneo: 'Liga IATI · Iberdrola', pais: 'ESPAÑA', pais_en: 'SPAIN', liga: 'LIGA IATI · LIGA IBERDROLA', rfeh: { m: 1, f: 8 }, m: 'spanien/division-de-honor', f: 'spanien/liga-iberdrola-frauen' },
  { id: 'de', torneo: 'Bundesliga', pais: 'ALEMANIA', pais_en: 'GERMANY', liga: '1. BUNDESLIGA', dhb: { m: 'herren', f: 'damen' }, m: 'deutschland/1-bundesliga', f: 'deutschland/1-bundesliga-frauen' },
  { id: 'en', torneo: 'Premier Division', pais: 'INGLATERRA', pais_en: 'ENGLAND', liga: 'PREMIER DIVISION', nombres: { m: 'https://www.englandhockey.co.uk/competitions-and-events/open-men-s-hockey-league/ehl-open-men-premier-division', f: 'https://www.englandhockey.co.uk/competitions-and-events/womens-hockey-league/ehl-women-premier-division' }, m: 'england/premier-division', f: 'england/premier-division-frauen' },
  { id: 'it', torneo: 'Serie A Elite', pais: 'ITALIA', pais_en: 'ITALY', liga: 'SERIE A ELITE', fih: true, m: 'italien/serie-a1' },
  { id: 'ar', torneo: 'Metropolitano', pais: 'ARGENTINA', pais_en: 'ARGENTINA', liga: 'METROPOLITANO · PRIMERA A', larry: { m: 'Caballeros A', f: 'Damas A' } },
  { id: 'ar-copa', grupo: 'ar', torneo: 'Copa Buenos Aires', pais: 'ARGENTINA', pais_en: 'ARGENTINA', liga: 'COPA BUENOS AIRES · CAMPEONATO', larry: { m: 'Copa Bs. As. Campeonato Finales', f: 'Copa Bs. As. Campeonato Finales' }, copa: true },
  { id: 'int-ehl', grupo: 'int', flag: 'eu', torneo: 'EHL', pais: 'EHL', pais_en: 'EHL', liga: 'EURO HOCKEY LEAGUE', fsProx: { m: 'europa/euro-hockey-league', f: 'europa/euro-hockey-league-frauen' }, altius: { base: 'https://eurohockey.altiusrt.com', m: /^Euro Hockey League\b.*\sMen\b/, f: /^Euro Hockey League\b.*\sWomen\b/ }, copa: true },
  { id: 'int-pro', grupo: 'int', flag: 'un', torneo: 'Pro League', pais: 'PRO LEAGUE', pais_en: 'PRO LEAGUE', liga: 'FIH HOCKEY PRO LEAGUE', selecciones: true, altius: { base: 'https://fih.altiusrt.com', m: /Pro League.*\((M|Men)\)/i, f: /Pro League.*\((W|Women)\)/i }, copa: true },
  { id: 'int-mundial', grupo: 'int', flag: 'un', torneo: 'Mundial', pais: 'MUNDIAL', pais_en: 'WORLD CUP', liga: 'FIH HOCKEY WORLD CUP', selecciones: true, altius: { base: 'https://fih.altiusrt.com', m: /^FIH Hockey World Cup(?!.*(Junior|Indoor|Para|5s)).*\((M|Men)\)/i, f: /^FIH Hockey World Cup(?!.*(Junior|Indoor|Para|5s)).*\((W|Women)\)/i }, copa: true },
  { id: 'int-jjoo', grupo: 'int', flag: 'un', torneo: 'JJOO', pais: 'JJOO', pais_en: 'OLYMPICS', liga: 'JUEGOS OLÍMPICOS', selecciones: true, altius: { base: 'https://fih.altiusrt.com', m: /Olympic Games.*(Men|\(M\))/i, f: /Olympic Games.*(Women|\(W\))/i }, copa: true },
  { id: 'au', torneo: 'Hockey One', pais: 'AUSTRALIA', pais_en: 'AUSTRALIA', liga: 'HOCKEY ONE', inicio: '08/10', m: 'australien/hockey-one', f: 'australien/hockey-one-frauen' },
];

// ---------- finde ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function domingo(arg) {
  if (arg) return new Date(arg + 'T12:00:00');
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; // domingo más reciente (hoy si es domingo)
}
const DOM = domingo(process.argv[2] && /^\d{4}-/.test(process.argv[2]) ? process.argv[2] : null);
const ONLY = (process.argv.find(a => /^[a-z]{2,3}(-[a-z]+)?(,[a-z]{2,3}(-[a-z]+)?)*$/.test(a)) || '').split(',').filter(Boolean);
// ventana del finde: viernes a lunes; Hockey One (Australia) juega desde el miércoles
let DIAS_ANTES = 2;
let ID_ACTUAL = ''; // liga que se está leyendo (para el huso horario)
const enFinde = d => { const a = new Date(DOM), b = new Date(DOM); a.setDate(a.getDate() - DIAS_ANTES); a.setHours(0, 0, 0, 0); b.setDate(b.getDate() + 1); b.setHours(23, 59, 59, 0); return d >= a && d <= b; };
const limpiar = s => s.replace(/\s+F$/, '').trim(); // Flashscore agrega " F" a los equipos femeninos

// navegar con reintentos (Flashscore a veces tarda)
async function ir(pg, url, opt) { for (let i = 0; ; i++) { try { return await pg.goto(url, opt); } catch (e) { if (i >= 2) throw e; await new Promise(r => setTimeout(r, 3000)); } } }

// ---------- KNHB (Países Bajos, fuente oficial: Match Center de hockey.nl) ----------
const MESES_NL = { januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5, juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11 };
const faseNL = l => { const t = l.replace(/^.*?[–—]\s*/, ''); const k = /KO ronde \d+|(Kwart|Halve )?finale/i.exec(t); return k ? k[0] : t.split(' - ').pop().trim(); };
const sinEquipo = s => s.replace(/\s+[HD]1$/, '').trim(); // "Oranje-Rood H1" → "Oranje-Rood"
async function knhb(pg, comp, copa) {
  const base = 'https://www.hockey.nl/match-center#/competitions/national/' + comp;
  const R = fn => pg.evaluate(fn);
  await ir(pg, base + '/overview', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForFunction(sel => document.querySelector('match-center')?.shadowRoot?.querySelector(sel), { timeout: 20000 }, copa ? 'a' : '.standing .row').catch(e => { if (!copa) throw e; });
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
      if (e.tagName === 'A' && /\d+\s*-\s*\d+/.test(t)) out.push({ f, id: (e.getAttribute('href') || '').split('/').pop(), lines: e.innerText.split('\n').map(x => x.trim()).filter(Boolean) });
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
    const row = [sinEquipo(it.lines[si - 1]), ga, gb, sinEquipo(it.lines[si + 1] || '')], x = { d: iso(d) };
    if (so) x.so = [+so[1], +so[2]];
    if (copa && si >= 2) x.fase = faseNL(it.lines[si - 2]);
    if (Object.keys(x).length) row.push(x);
    ms.push(row);
  }
  // goleadores: se suman los goles del detalle oficial de cada partido de la temporada (con caché: cada partido se lee una sola vez)
  const cacheF = `${OUT}/goles_nl_${comp}.json`, cache = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, 'utf8')) : {};
  for (const it of copa ? [] : items) { // en copas no se suman goleadores
    if (!it.id || cache[it.id]) continue;
    const si = it.lines.findIndex(x => /^\d+\s*-\s*\d+/.test(x)); if (si < 1) continue;
    try {
      await ir(pg, 'about:blank'); await ir(pg, 'https://www.hockey.nl/match-center#/match/' + it.id, { waitUntil: 'networkidle2', timeout: 60000 });
      await pg.waitForFunction(() => document.querySelector('match-center')?.shadowRoot?.querySelector('.match-progress'), { timeout: 15000 });
      const goles = await pg.evaluate(() => [...document.querySelector('match-center').shadowRoot.querySelectorAll('.match-action')]
        .map(a => [a.querySelector('.match-action__action-type')?.textContent.trim() || '', a.querySelector('.match-action__player')?.textContent.trim() || '', a.classList.contains('home') ? 'h' : 'a'])
        .filter(([t, n]) => n && /doelpunt|strafbal|strafcorner/i.test(t) && !/gemist|mis/i.test(t)).map(([, n, l]) => [n, l]));
      cache[it.id] = { h: sinEquipo(it.lines[si - 1]), a: sinEquipo(it.lines[si + 1] || ''), g: goles };
    } catch (e) { console.log('KNHB goles', it.id, e.message); }
  }
  fs.writeFileSync(cacheF, JSON.stringify(cache));
  const cuenta = {};
  for (const m of Object.values(cache)) for (const [n, l] of m.g) { const eq = l === 'h' ? m.h : m.a, k = n + '|' + eq; cuenta[k] = (cuenta[k] || 0) + 1; }
  const gol = Object.entries(cuenta).map(([k, g]) => { const [nom, eq] = k.split('|'); return { nom, eq, g }; }).sort((x, y) => y.g - x.g || x.nom.localeCompare(y.nom)).slice(0, 10);
  return { ms, tabla, gol };
}

async function knhbProx(pg, comp, w) {
  await ir(pg, 'about:blank'); await ir(pg, 'https://www.hockey.nl/match-center#/competitions/national/' + comp + '/program', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForFunction(() => document.querySelector('match-center')?.shadowRoot?.querySelector('a'), { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  const items = await pg.evaluate(() => { const out = []; let f = '';
    for (const e of document.querySelector('match-center').shadowRoot.querySelectorAll('*')) { const t = e.textContent.trim();
      if (e.children.length === 0 && /^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag) \d{1,2} \w+/i.test(t)) f = t;
      if (e.tagName === 'A' && /\d{1,2}:\d{2}/.test(t) && !/\d+\s*-\s*\d+/.test(t)) out.push({ f, lines: e.innerText.split('\n').map(x => x.trim()).filter(Boolean) }); }
    return out; });
  const out = [];
  for (const it of items) {
    const m = /(\d{1,2}) (\w+)(?: (\d{4}))?/.exec(it.f); if (!m || MESES_NL[m[2].toLowerCase()] == null) continue;
    const d = new Date(+(m[3] || DOM.getFullYear()), MESES_NL[m[2].toLowerCase()], +m[1], 12); if (d < w.desde || d > w.hasta) continue;
    const ti = it.lines.findIndex(x => /^\d{1,2}:\d{2}$/.test(x)); if (ti < 1) continue;
    const fase = it.lines.find(x => /[–—]| - Poule/.test(x));
    out.push([sinEquipo(it.lines[ti - 1]), sinEquipo(it.lines[ti + 2] || it.lines[ti + 1] || ''), fase ? { d: iso(d), h: it.lines[ti], fase: faseNL(fase) } : { d: iso(d), h: it.lines[ti] }]);
  }
  return out;
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
    ms.push([nombreES(eq[0]), g[0], g[1], nombreES(eq[1]), { d: `${f[3]}-${f[2]}-${f[1]}` }]); jornada = jornada || jor;
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
async function sportlink(nombrePool, pg) {
  if (!poolsBE) { // los id de las divisiones cambian cada temporada: se buscan por nombre en el buscador oficial
    await ir(pg, 'https://hockey.be/fr/competition/calendrier-resultats-et-classements/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.waitForSelector('select[name=poolid] option', { timeout: 30000 }).catch(() => {});
    const html = await pg.content();
    poolsBE = [...html.matchAll(/<option value="(\d+)"[^>]*>([^<]+)<\/option>/g)].map(m => [m[1], m[2].trim()]);
  }
  const pool = (poolsBE.find(([, t]) => /Outdoor/.test(t) && t.endsWith(nombrePool)) || [])[0];
  if (!pool) throw new Error('no encontré la división ' + nombrePool);
  const a = new Date(DOM), b = new Date(DOM); a.setDate(a.getDate() - DIAS_ANTES); b.setDate(b.getDate() + 1);
  const q = `&poolid=${pool}&from=${iso(a)}&to=${iso(b)}`;
  const pide = u => pg.evaluate(async u => (await fetch(u)).json(), u);
  const res = await pide(SL('results') + q);
  const ms = (res.data || []).map(x => { const g = (sinTags(x[5]).match(/\d+/g) || []).map(Number); const d = String(x[0]).split('/').reverse().join('-'); return g.length < 2 ? null : [nombreBE(sinTags(x[3])), g[0], g[1], nombreBE(sinTags(x[7])), { d }]; }).filter(Boolean).reverse();
  const st = await pide(SL('standing') + q);
  const tabla = (st.data || []).map(x => ({ eq: nombreBE(x[1]), pj: +x[2], gf: +x[6], gc: +x[7], pts: +x[8] }));
  return { ms, tabla };
}

// ---------- Federhockey (Italia, fuente oficial: comunicados "#PRATO/I RISULTATI DELLE GARE DI ...") ----------
const MESES_IT = { gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5, luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11 };
const texto = html => html.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h\d>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'").replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù').replace(/&igrave;/g, 'ì');
async function federhockey() {
  // todos los comunicados de resultados de la temporada (archivo del blog + página de campeonatos), con caché por comunicado
  const base = 'https://www.federhockey.it', urls = new Set();
  const junta = html => { for (const m of html.matchAll(/href="([^"]*risultati-delle-gare-di-[a-z]+-\d{1,2}-[a-z]+-\d{4}[^"]*\.html)"/g)) urls.add(m[1].startsWith('http') ? m[1] : base + m[1]); };
  junta(await (await fetch(base + '/49-campionati/campionati-prato.html')).text());
  for (let st = 0; st <= 200; st += 10) { const n = urls.size; junta(await (await fetch(base + '/home/fih/comunicati-stampa/comunicati-stampa-blog.html?start=' + st)).text()); if (st > 0 && urls.size === n) break; }
  const cacheF = `${OUT}/it_comunicados.json`, cache = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, 'utf8')) : {};
  for (const u of urls) {
    const m = /-(\d{1,2})-([a-z]+)-(\d{4})/.exec(u); if (!m || MESES_IT[m[2]] == null) continue;
    const fecha = iso(new Date(+m[3], MESES_IT[m[2]], +m[1], 12));
    if (cache[u] && fecha < iso(new Date(Date.now() - 3 * 864e5))) continue; // los recientes se releen por si corrigen algo
    const lines = texto(await (await fetch(u)).text()).split('\n').map(x => x.trim()).filter(Boolean);
    const d = { fecha, m: [], f: [], jor: {} }; let sec = null;
    for (const l of lines) {
      const h = /^SERIE A ELITE (MASCHILE|FEMMINILE).*?Giornata (\d+)/i.exec(l);
      if (h) { sec = h[1].toUpperCase() === 'MASCHILE' ? 'm' : 'f'; d.jor[sec] = +h[2]; continue; }
      if (/^(SERIE|COPPA|GIRONE|POULE|PLAY|FINAL|SUPERCOPPA)\b/i.test(l)) { sec = null; continue; }
      if (!sec) continue;
      const g = /^(.+?)\s*-\s*(.+?)\s+(\d+)\s*-\s*(\d+)(?:\s*\((.*)\))?\s*$/.exec(l);
      const sp = x => x.replace(/\s+/g, ' ').trim();
      if (g) { const gh = +g[3], ga = +g[4], txt = g[5] || ''; let [mh, ma] = /\s-\s|^-|-$/.test(txt.trim()) ? txt.split(/\s+-\s+|^\s*-\s*|\s*-\s*$/) : (gh === 0 ? ['', txt] : ga === 0 ? [txt, ''] : [txt, '']); d[sec].push([sp(g[1]), gh, ga, sp(g[2]), (mh || '').trim(), (ma || '').trim()]); }
    }
    cache[u] = d;
  }
  fs.writeFileSync(cacheF, JSON.stringify(cache));
  const out = { m: [], f: [], jornada: '', jor: {}, tabla: {}, gol: {} };
  for (const k of ['m', 'f']) {
    const pts = {}, goles = {};
    const eq = n => (pts[n] ||= { eq: n, pj: 0, pts: 0, gf: 0, gc: 0 });
    for (const d of Object.values(cache)) for (const [h, gh, ga, a, mh, ma] of d[k]) {
      const H = eq(h), A = eq(a); H.pj++; A.pj++; H.gf += gh; H.gc += ga; A.gf += ga; A.gc += gh;
      H.pts += gh > ga ? 3 : gh === ga ? 1 : 0; A.pts += ga > gh ? 3 : gh === ga ? 1 : 0;
      for (const [lista, club] of [[mh, h], [ma, a]]) for (const x of lista.split(',').map(z => z.trim()).filter(Boolean)) {
        const mm = /^(.+?)(?:\s+(\d+))?$/.exec(x); const key = mm[1] + '|' + club; goles[key] = (goles[key] || 0) + (+mm[2] || 1);
      }
      if (enFinde(new Date(d.fecha + 'T12:00:00'))) { out[k].push([h, gh, ga, a, { d: d.fecha }]); if (k === 'm' && d.jor.m) out.jornada = 'FECHA ' + d.jor.m; if (d.jor[k]) out.jor[k] = 'FECHA ' + d.jor[k]; }
    }
    out.tabla[k] = Object.values(pts).sort((x, y) => y.pts - x.pts || (y.gf - y.gc) - (x.gf - x.gc) || y.gf - x.gf);
    out.gol[k] = Object.entries(goles).map(([kk, g]) => { const [nom, eq] = kk.split('|'); return { nom, eq, g }; }).sort((x, y) => y.g - x.g || x.nom.localeCompare(y.nom)).slice(0, 10);
  }
  return out;
}

// ---------- Altius (EuroHockey: EHL, fuente oficial eurohockey.altiusrt.com) ----------
const MES_EN = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const filasTabla = () => [...document.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.innerText.trim().replace(/\s+/g, ' ')));
async function altius(pg, base, re) {
  await ir(pg, base + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  const comps = (await pg.evaluate(() => [...document.querySelectorAll('a')].map(a => [a.textContent.trim().replace(/\s+/g, ' '), a.href]).filter(([, h]) => /\/competitions\/\d+$/.test(h))))
    .filter(([t]) => re.test(t));
  const ms = [], gol = {};
  for (const [, url] of [...new Map(comps.map(c => [c[1], c])).values()]) {
    await ir(pg, url + '/matches', { waitUntil: 'networkidle2', timeout: 60000 });
    const filas = (await pg.evaluate(filasTabla)).filter(c => /\d{1,2} [A-Z][a-z]{2} \d{4}/.test(c[1] || '') && /Official|Final|Result/i.test(c[4] || ''));
    const enVentana = filas.filter(c => { const m = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/.exec(c[1]); return enFinde(new Date(+m[3], MES_EN[m[2]], +m[1], 12)); });
    if (!enVentana.length) continue;
    await ir(pg, url + '/teams', { waitUntil: 'networkidle2', timeout: 60000 });
    const corto = n => ({ 'Real Club de Campo Villa de Madrid': 'Club de Campo', 'Real Club de Polo': 'RC Polo' }[n] || n);
    const nombres = Object.fromEntries((await pg.evaluate(filasTabla)).filter(c => c.length >= 2 && c[1]).map(c => [c[1], corto(c[0].replace(/\s*\([A-Z]{3}\)$/, '').trim())]));
    for (const c of enVentana) {
      const t = /^(.+?) v (.+?)(?: \(|$)/.exec(c[2]); const g = (c[3].match(/\d+/g) || []).map(Number); if (!t || g.length < 2) continue;
      const md = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/.exec(c[1]);
      const row = [nombres[t[1]] || t[1], g[0], g[1], nombres[t[2]] || t[2]], x = { d: iso(new Date(+md[3], MES_EN[md[2]], +md[1], 12)) };
      if (g.length >= 4) x.so = [g[2], g[3]];
      const fase = (/\((.+)\)/.exec(c[2]) || [])[1]; if (fase) x.fase = fase;
      ms.push(Object.keys(x).length ? [...row, x] : row);
    }
    await ir(pg, url + '/statistics', { waitUntil: 'networkidle2', timeout: 60000 });
    for (const c of (await pg.evaluate(filasTabla)).filter(c => c.length === 7 && /\([A-Z]{3}\)$/.test(c[0]) && /^\d+$/.test(c[6]))) {
      const eq = corto(c[0].replace(/\s*\([A-Z]{3}\)$/, '').trim()), w = c[2].split(' '), ap = w.filter(x => x === x.toUpperCase() && /\p{L}/u.test(x)), no = w.filter(x => !ap.includes(x));
      const nom = [...no, ...ap.map(x => x[0] + x.slice(1).toLowerCase())].join(' '), k = nom + '|' + eq; gol[k] = (gol[k] || 0) + +c[6];
    }
  }
  return { ms, gol: Object.entries(gol).map(([k, g]) => { const [nom, eq] = k.split('|'); return { nom, eq, g }; }).sort((a, b) => b.g - a.g).slice(0, 10) };
}

async function altiusNombres(pg, base, re) {
  await ir(pg, base + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  const comps = (await pg.evaluate(() => [...document.querySelectorAll('a')].map(a => [a.textContent.trim().replace(/\s+/g, ' '), a.href]))).filter(([t, h]) => re.test(t) && /\/competitions\/\d+$/.test(h));
  const out = [];
  for (const [, url] of comps.slice(0, 3)) {
    await ir(pg, url + '/teams', { waitUntil: 'networkidle2', timeout: 60000 });
    for (const c of await pg.evaluate(() => [...document.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.innerText.trim())))) if (c.length >= 2 && c[1] && /\([A-Z]{3}\)$/.test(c[0])) out.push(c[0].replace(/\s*\([A-Z]{3}\)$/, '').trim());
  }
  return out;
}

function ventanaProx(copa, au) {
  const NX = new Date(DOM); NX.setDate(NX.getDate() + 7);
  const desde = new Date(copa ? DOM : NX), hasta = new Date(NX);
  desde.setDate(desde.getDate() + (copa ? 1 : -(au ? 4 : 2))); desde.setHours(0, 0, 0, 0); hasta.setDate(hasta.getDate() + 1); hasta.setHours(23, 59, 0, 0);
  return { desde, hasta };
}
const filasVs = (P, w) => { // "fecha / LOCAL / Vs / VISITANTE" (LarrySport)
  const out = [];
  for (let i = 0; i < P.length - 3; i++) {
    const m = /^(lun|mar|mié|jue|vie|sáb|dom)\w* (\d{2}) (\w{3})(?: (\d{2}:\d{2}))?/.exec(P[i]);
    if (!m || P[i + 2] !== 'Vs') continue;
    const d = new Date(DOM.getFullYear(), MES[m[3]], +m[2], 12); if (d < w.desde || d > w.hasta) continue;
    out.push([cap(P[i + 1].replace(/\s*\(N\.P\.\)/i, '')), cap(P[i + 3]), { d: iso(d), h: m[4] || '' }]);
  }
  return out;
};

// ---------- próxima fecha (Flashscore, hora argentina) ----------
async function fsProgramma(pg, slug, desde, hasta) {
  // horario local de cada liga: la página se abre en el huso horario del país
  const TZ = { en: "Europe/London", au: "Australia/Sydney" };
  await pg.emulateTimezone(TZ[ID_ACTUAL] || "Europe/Amsterdam");
  await ir(pg, FS + slug + '/begegnungen/', { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForSelector('.event__match', { timeout: 15000 }).catch(() => {});
  const filas = await pg.evaluate(() => [...document.querySelectorAll('.event__match')].map(e => {
    const q = s => e.querySelector(s)?.innerText.trim() ?? '';
    return { time: q('.event__time') || e.innerText, home: q('[class*="event__participant--home"], .event__homeParticipant'), away: q('[class*="event__participant--away"], .event__awayParticipant') };
  }));
  await pg.emulateTimezone(process.env.TZ || "America/Argentina/Buenos_Aires");
  const out = [];
  for (const f of filas) {
    const m = /(\d{2})\.(\d{2})\.\s*(\d{2}:\d{2})?/.exec(f.time); if (!m || !f.home) continue;
    let y = DOM.getFullYear(); if (+m[2] - 1 < DOM.getMonth() - 6) y++;
    const d = new Date(y, +m[2] - 1, +m[1], 12); if (d < desde || d > hasta) continue;
    out.push([limpiar(f.home), limpiar(f.away), { d: iso(d), h: m[3] || '' }]);
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
    const x = { d: iso(d) };
    if (/n\.\s?P\./.test(f.raw)) { // definido por penales: el total incluye la tanda → restar los dos últimos números
      const nums = f.raw.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);
      const so = nums.slice(-2); x.so = so; ga -= so[0]; gb -= so[1];
    }
    ms.push([limpiar(f.home), ga, gb, limpiar(f.away), x]);
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
async function larry(pg, rama, torneo, copaLarry) {
  const base = 'https://tournamenttracker.buenosaireshockey.ar/';
  await ir(pg, base, { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForFunction(() => [...document.querySelectorAll('main button')].some(b => /^(Masculino|Femenino)$/.test(b.innerText.trim())) && document.querySelector('button[role=radio]'), { timeout: 45000 }).catch(() => {});
  const click = async (fn, arg) => { for (let i = 0; i < 10 && !(await pg.evaluate(fn, arg)); i++) await new Promise(r => setTimeout(r, 1500)); const ok = true; if (!ok) throw new Error('LarrySport: no encontré ' + arg); await new Promise(r => setTimeout(r, 1500)); };
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
  const L = fx.slice(Math.max(0, fx.indexOf('Todas las fechas') >= 0 ? fx.indexOf('Todas las fechas') : fx.indexOf('Llaves'))).split('\n').map(s => s.replace(/[-​-‏﻿]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (process.env.DEBUG) console.log(rama, torneo, JSON.stringify(L.slice(0, 8)), [...(L[1] || '')].map(c => c.charCodeAt(0)).join(','));
  let ronda = '';
  for (let i = 0; i < L.length - 4; i++) {
    if (/^(Dieciseisavos|Octavos|Cuartos|Semi|Final|Tercer|3er)\b/i.test(L[i]) && !/\d/.test(L[i])) { ronda = L[i]; continue; }
    const m = /^(lun|mar|mié|jue|vie|sáb|dom)\w* (\d{2}) (\w{3})/.exec(L[i]); if (!m) continue;
    const d = new Date(DOM.getFullYear(), MES[m[3]], +m[2], 12);
    const sa = /^(\d+)(?: \((\d+)\))?$/.exec(L[i + 2]), sb = /^(\d+)(?: \((\d+)\))?$/.exec(L[i + 3]);
    if (sa && sb && enFinde(d)) { const sin = x => cap(x.replace(/\s*\(N\.P\.\)/i, '')); const row = [sin(L[i + 1]), +sa[1], +sb[1], sin(L[i + 4])], x = { d: iso(d) }; if (sa[2] != null && sb[2] != null) x.so = [+sa[2], +sb[2]]; if (ronda) x.fase = ronda; if (Object.keys(x).length) row.push(x); ms.push(row); }
  }
  // próxima fecha: se recorren las fechas siguientes del fixture y se toman las que caen en la ventana (puede haber dos en un finde)
  const prox = [], proxFechas = [], w = ventanaProx(copaLarry);
  const leer = async () => (await pg.evaluate(() => document.querySelector('main').innerText)).split('\n').map(s => s.replace(/[\ue000-\uf8ff]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (copaLarry) prox.push(...filasVs(await leer(), w)); // en las copas el cuadro ya muestra lo que viene
  else if (/^\d+$/.test(fecha)) for (let n = +fecha + 1; n <= +fecha + 3; n++) {
    const ok = await pg.evaluate(n => { const b = [...document.querySelectorAll('main button')].find(b => b.innerText.trim() === String(n)); if (!b) return false; b.click(); return true; }, n);
    if (!ok) break;
    await new Promise(r => setTimeout(r, 3000));
    const filas = filasVs(await leer(), w); if (!filas.length) break;
    prox.push(...filas); proxFechas.push(n);
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
  return { ms, tabla, gol, fecha, prox, proxFechas };
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
  ID_ACTUAL = L.id;
  DIAS_ANTES = L.copa && L.grupo !== 'int' ? 6 : L.id === 'au' ? 4 : 2; // copas locales: toda la semana; internacionales y ligas: viernes a lunes
  try {
    if (L.altius) {
      const gol = {};
      for (const k of ['m', 'f']) { const o = await altius(pg, L.altius.base, L.altius[k]); p[k] = o.ms; if (o.gol.length) gol[k] = o.gol; }
      p.goleadores = gol; p.tabla = {}; p.fuente = 'European Hockey Federation · eurohockey.altiusrt.com (oficial)';
    } else if (L.fih) {
      const o = await federhockey();
      if (o.m.length) p.m = o.m; else if (!old.m) p.m = [];
      if (o.f.length) p.f = o.f; else if (!old.f) p.f = [];
      if (o.jornada) p.jornada = o.jornada;
      p.jor = { ...o.jor };
      p.tabla = { ...(p.tabla || {}), ...Object.fromEntries(Object.entries(o.tabla).filter(([, t]) => t.length)) };
      p.goleadores = { ...(p.goleadores || {}), ...Object.fromEntries(Object.entries(o.gol).filter(([, g]) => g.length)) };
      p.fuente = 'Federhockey · federhockey.it (oficial)';
    } else if (L.sportlink) {
      const tabla = { ...(p.tabla || {}) };
      for (const k of ['m', 'f']) {
        try { const o = await sportlink(L.sportlink[k], pg); if (o.ms.length) p[k] = o.ms; else if (!old[k]) p[k] = []; if (o.tabla.length) tabla[k] = o.tabla; }
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
          if (o.jornada) (p.jor ||= {})[k] = o.jornada.replace('JORNADA', 'FECHA');
        } catch (e) { console.log(L.id, k, 'RFEH falló, uso Flashscore:', e.message); const r = await fsResultados(pg, L[k]); const nom = ((p.tabla || {})[k] || []).map(t => t.eq); if (r.ms.length) p[k] = r.ms.map(([a, ga, gb, b, x]) => [nom.length ? oficial(a, nom) : a, ga, gb, nom.length ? oficial(b, nom) : b, x]); }
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
        try { const r = await knhb(pg, L.knhb[k], L.copa); if (r.ms.length) p[k] = r.ms; else if (!old[k]) p[k] = []; if (r.tabla.length) tabla[k] = r.tabla; if (r.gol.length) (p.goleadores ||= {})[k] = r.gol; }
        catch (e) { console.log(L.id, k, 'KNHB falló, uso Flashscore:', e.message); const r = await fsResultados(pg, L[k]); if (r.ms.length) p[k] = r.ms; const t = await fsTabla(pg, L[k]); if (t.some(x => x.pj > 0)) tabla[k] = t; }
      }
      p.tabla = L.copa ? {} : tabla; p.fuente = 'KNHB · hockey.nl (oficial)';
    } else if (L.larry) {
      await pg.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR' });
      const m = await larry(pg, 'Masculino', L.larry.m, L.copa), f = await larry(pg, 'Femenino', L.larry.f, L.copa);
      Object.assign(p, { m: m.ms.length ? m.ms : (p.m || []), f: f.ms.length ? f.ms : (p.f || []), tabla: L.copa ? {} : { m: m.tabla, f: f.tabla }, goleadores: { m: m.gol, f: f.gol }, jornada: L.copa ? '' : m.fecha ? 'FECHA ' + m.fecha : p.jornada, fuente: 'LarrySport TournamentTracker (AHBA)' });
      if (!L.copa) p.jor = { m: m.fecha ? 'FECHA ' + m.fecha : '', f: f.fecha ? 'FECHA ' + f.fecha : '' };
      const fj = n => n.length > 1 ? `FECHAS ${n.slice(0, -1).join(', ')} Y ${n[n.length - 1]}` : n.length ? 'FECHA ' + n[0] : '';
      if (m.prox.length || f.prox.length) { p.prox = { m: m.prox, f: f.prox }; p.prox_jor = L.copa ? {} : { m: fj(m.proxFechas), f: fj(f.proxFechas) }; const ds = [...m.prox, ...f.prox].map(x => x[2].d).sort(); p.prox_fecha = ds[0].slice(8, 10) + '.' + ds[0].slice(5, 7) + '–' + ds[ds.length - 1].slice(8, 10) + '.' + ds[ds.length - 1].slice(5, 7); p.prox_jornada = p.prox_jor.m || p.prox_jor.f || ''; }
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
  if (L.soloPrimera) { // copas abiertas: solo los partidos donde juega al menos un equipo de primera
    const base = paises.find(x => x.id === L.soloPrimera) || prev.paises.find(x => x.id === L.soloPrimera) || {};
    for (const k of ['m', 'f']) { const pri = ((base.tabla || {})[k] || []).map(t => t.eq); if (pri.length) p[k] = (p[k] || []).filter(x => pri.includes(oficial(x[0], pri)) || pri.includes(oficial(x[3], pri))); }
  }
  // número de fecha: si la fuente no lo trae, sale de la tabla (máximo de partidos jugados); si un equipo jugó dos veces, fueron dos fechas
  const vecesPorEquipo = ms => { const c = {}; for (const x of ms || []) for (const e of [x[0], x[1] === undefined ? '' : x[3]]) c[e] = (c[e] || 0) + 1; return Math.max(0, ...Object.values(c)); };
  if (!L.copa) {
    p.jor = { ...(p.jor || {}) };
    for (const k of ['m', 'f']) {
      if (p.jor[k] || !(p[k] || []).length) continue;
      const pj = Math.max(0, ...(((p.tabla || {})[k]) || []).map(t => t.pj || 0)), dos = vecesPorEquipo(p[k]) >= 2;
      if (pj) p.jor[k] = dos ? `FECHAS ${pj - 1} Y ${pj}` : 'FECHA ' + pj;
    }
    if (!p.jornada || !/^FECHA/.test(p.jornada)) p.jornada = p.jor.m || p.jor.f || '';
  }
  // próxima fecha: el finde siguiente (copas e internacionales: toda la semana que viene)
  try {
    const NX = new Date(DOM); NX.setDate(NX.getDate() + 7);
    const desde = new Date(NX), hasta = new Date(NX); desde.setDate(desde.getDate() - (L.copa ? 6 : L.id === 'au' ? 4 : 2)); desde.setHours(0, 0, 0, 0); hasta.setDate(hasta.getDate() + 1); hasta.setHours(23, 59, 0, 0);
    const prox = {};
    for (const k of ['m', 'f']) {
      if (L.knhb) { const w = ventanaProx(L.copa); const ms = await knhbProx(pg, L.knhb[k], w).catch(() => []); if (ms.length) { prox[k] = ms; continue; } }
      const slug = (L.fsProx || {})[k] || (L.altius || L.larry ? null : L[k]); if (!slug) continue;
      const nombres = [...new Set([...((p.tabla || {})[k] || []).map(t => t.eq), ...(p[k] || []).flatMap(x => [x[0], x[3]]), ...(L.altius ? await altiusNombres(pg, L.altius.base, L.altius[k]) : [])])];
      const ren = n => nombres.length ? oficial(n, nombres) : n;
      const ms = await fsProgramma(pg, slug, desde, hasta);
      if (ms.length) prox[k] = ms.map(([a, b, x]) => [ren(a), ren(b), x]);
    }
    if (L.larry) { /* Argentina: la próxima fecha ya vino de LarrySport */ }
    else if (Object.keys(prox).length) { p.prox = prox;
      p.prox_jor = {};
      for (const kk of ['m', 'f']) {
        const ult = +((/(\d+)\s*$/.exec((p.jor || {})[kk] || '') || [])[1] || 0), veces = {}; for (const [a, b] of prox[kk] || []) { veces[a] = (veces[a] || 0) + 1; veces[b] = (veces[b] || 0) + 1; }
        if (!L.copa && ult && (prox[kk] || []).length) p.prox_jor[kk] = Math.max(...Object.values(veces)) >= 2 ? `FECHAS ${ult + 1} Y ${ult + 2}` : 'FECHA ' + (ult + 1);
      }
      p.prox_jornada = p.prox_jor.m || p.prox_jor.f || ''; p.prox_fecha = `${pad(desde.getDate() + (L.copa ? 0 : 0))}.${pad(desde.getMonth() + 1)}–${pad(hasta.getDate())}.${pad(hasta.getMonth() + 1)}`; }
    else delete p.prox;
  } catch (e) { console.log(L.id, 'próxima fecha:', e.message); }
  if (L.copa && !(p.m || []).length && !(p.f || []).length && !p.prox) continue;
  if (L.copa) { const fs_ = [...new Set([...(p.m || []), ...(p.f || [])].map(x => x[4] && x[4].fase).filter(Boolean))]; p.jornada = fs_.length === 1 ? 'RONDA:' + fs_[0] : ''; }
  if (L.grupo) p.grupo = L.grupo;
  if (L.flag) p.flag = L.flag;
  if (L.selecciones) p.selecciones = true;
  if (L.torneo) p.torneo = L.torneo;
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
