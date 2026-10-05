// ¿Toca avisar?  Va entre el reloj y «Pedir pagos pendientes».
// El reloj ahora revisa cada 15 minutos. Si un horario (8:00, 12:30, 20:30) ya pasó y no se ha enviado hoy,
// deja continuar el flujo. Así, si el computador estuvo apagado, el aviso sale apenas se prende.
const sd = $getWorkflowStaticData('global');
const co = new Date(Date.now() - 5 * 3600 * 1000);            // hora de Colombia
const hoy = co.toISOString().slice(0, 10);
const min = co.getUTCHours() * 60 + co.getUTCMinutes();
const FRANJAS = [{ id: '8:00', m: 480 }, { id: '12:30', m: 750 }, { id: '20:30', m: 1230 }];
const TOPE = 22 * 60 + 30;                                    // pasadas las 10:30 pm ya no se avisa

if (sd.diaAvisos !== hoy) { sd.diaAvisos = hoy; sd.franjasHechas = []; }
if (min > TOPE) return [];

const vencidas = FRANJAS.filter(f => min >= f.m && !sd.franjasHechas.includes(f.id));
if (!vencidas.length) return [];

vencidas.forEach(f => sd.franjasHechas.push(f.id));           // si estuvo apagado, se manda un solo aviso
return [{ json: { franja: vencidas[vencidas.length - 1].id, atrasada: vencidas.length > 1 } }];
