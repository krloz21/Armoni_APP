const items = $('Movimientos').all();                                   // servicios del mes (categoría Servicios)
const fijos = $('Get many database pages1').all().map(i => i.json);       // base Arriendo (último envío)
const movFijos = $input.all().map(i => i.json);                           // movimientos que dicen «jard…» o «arriendo» (nodo Movimientos recientes)
const ARRIENDO_POR_MOVIMIENTO = false;   // ponlo en true cuando el arriendo también cree su movimiento en Notion
const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000);   // hora de Colombia
const dia = hoy.getUTCDate();
const ultimoDiaMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0)).getUTCDate();

// sin tildes ni mayúsculas: «Recibo energía», «ENERGIA», «Energia» cuentan igual
const sin = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fechaDe = x => { let f = x.property_fecha; f = f && (f.start || (f.date && f.date.start) || f); return Date.parse(String(f || '').slice(0, 10) + 'T00:00:00Z'); };
const diaDe = x => { const t = fechaDe(x); return isNaN(t) ? 0 : new Date(t).getUTCDate(); };
// el agua pagada del 1 al 5 es la factura del mes ANTERIOR (se pagó tarde): no cuenta para este mes
function pagado(r){
  return items.some(i => r.re.test(sin(i.json.name)) && !(r.id === 'agua' && diaDe(i.json) >= 1 && diaDe(i.json) <= 5));
}

// "pendientes" = lo que se ve en la barra de Armoni (cada pago solo dentro de su ventana)
// "sinPagar"   = lo que usan las notificaciones push (siguen avisando, ya vencido, hasta que se pague)
const reglas = [
  { id: 'energia',  nombre: 'la energía',  re: /\b(energia|luz|enertotal)\b/,       desde: 3,  hasta: 10,          seguir: ultimoDiaMes },
  { id: 'agua',     nombre: 'el agua',     re: /\b(agua|acueducto)\b/,              desde: 25, hasta: ultimoDiaMes, seguir: ultimoDiaMes },
  { id: 'gas',      nombre: 'el gas',      re: /\bgas(es)?\b/,                      desde: 17, hasta: 21,          seguir: ultimoDiaMes },   // vence el 21
  { id: 'internet', nombre: 'el internet', re: /\b(internet|movistar|wifi)\b/,      desde: 1,  hasta: 5,           seguir: ultimoDiaMes },
];

const pendientes = [], sinPagar = [];
for (const r of reglas) {
  if (pagado(r)) continue;
  const item = { id: r.id, nombre: r.nombre };
  if (dia >= r.desde && dia <= r.hasta) pendientes.push(item);
  if (dia >= r.desde && dia <= r.seguir) sinPagar.push(item);
}

// jardín: pagado si existe su movimiento en Movimientos (si lo borras, el aviso vuelve).
// arriendo: con «último envío» (o, si activas ARRIENDO_POR_MOVIMIENTO, también por su movimiento).
//  - barra de Armoni: arriendo del último día del mes al día 3; jardín del último día del mes al día 5
//  - push: los dos siguen avisando (ya vencidos) hasta que se paguen
const esUltimoDiaMes = dia === ultimoDiaMes;
const ultimoDiaMesAnterior = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 0);
// el comprobante del arriendo (y el pago del jardín) cuenta desde el día 20: se suele mandar unos días antes de fin de mes.
// Del 20 en adelante cuenta lo enviado desde el 20 de este mes; antes del 20, lo enviado desde el 20 del mes pasado.
const inicioArriendo = dia >= 20 ? Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 20) : Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 20);

// si hay varias filas que dicen «arriendo», vale el «último envío» más reciente
const yaPagado = (re, inicioVentana) => {
  const s = fijos.filter(x => re.test(sin(x.name))).map(x => x.property_último_envío && x.property_último_envío.start).filter(Boolean).sort().pop();
  return !!s && Date.parse(s.slice(0, 10) + 'T00:00:00Z') >= inicioVentana;
};
const movPagado = (re, categoria, inicioVentana) => movFijos.some(x => {
  if (!re.test(sin(x.name)) || x.property_categoría !== categoria) return false;   // nombre y categoría: así «jardín plaza» (Salidas) no cuenta
  const t = fechaDe(x);
  return !isNaN(t) && t >= inicioVentana;
});

const arriendoPagado = ARRIENDO_POR_MOVIMIENTO ? movPagado(/arriendo/i, 'Hogar', inicioArriendo) : yaPagado(/arriendo/i, inicioArriendo);
if (!arriendoPagado) {
  const item = { id: 'arriendo', nombre: 'el arriendo' };
  if (esUltimoDiaMes || dia <= 3) pendientes.push(item);
  if (dia < 20 || esUltimoDiaMes) sinPagar.push(item);   // del 20 al penúltimo día todavía no toca: no se insiste
}
// comprobante del arriendo enviado («último envío» en la ventana) pero sin su gasto «Arriendo» (Hogar) en Movimientos:
// falta anotar el valor. Sin ventana: sale hasta que se anote (o hasta que empiece el periodo siguiente, el día 20).
const arriendoRegistrado = movPagado(/arriendo/i, 'Hogar', inicioArriendo);
if (yaPagado(/arriendo/i, inicioArriendo) && !arriendoRegistrado) {
  const item = { id: 'arriendo_valor', nombre: 'el valor del arriendo' };
  pendientes.push(item); sinPagar.push(item);
}
if (!movPagado(/jard/i, 'Hijo', inicioArriendo)) {
  const item = { id: 'jardin', nombre: 'el jardín de Emanuel' };
  if (esUltimoDiaMes || dia <= 5) pendientes.push(item);
  if (dia < 20 || esUltimoDiaMes) sinPagar.push(item);   // del 20 al penúltimo día todavía no toca: no se insiste
}

// v: 3 = reconoce conceptos con tilde o variación, agua del 1 al 5 = mes anterior y el pendiente «arriendo_valor».
// pagados = lo que ya está registrado este mes; arriendoRegistrado = ya está el gasto «Arriendo» (Hogar) del periodo
const pagados = reglas.filter(r => pagado(r)).map(r => r.id);
// el valor de siempre del arriendo y del jardín: el último que quedó anotado (la app lo propone al preguntar)
const ultimoValor = (re, categoria) => { const l = movFijos.filter(x => re.test(x.name || '') && x.property_categoría === categoria && Number(x.property_monto) > 0)
  .sort((a, b) => String((b.property_fecha && (b.property_fecha.start || b.property_fecha)) || '').localeCompare(String((a.property_fecha && (a.property_fecha.start || a.property_fecha)) || ''))); return l.length ? Number(l[0].property_monto) : null; };
const arriendoNormal = ultimoValor(/arriendo/i, 'Hogar'), jardinNormal = ultimoValor(/jard/i, 'Hijo');
return [{ json: { v: 3, pendientes, sinPagar, pagados, arriendoRegistrado, arriendoNormal, jardinNormal } }];
