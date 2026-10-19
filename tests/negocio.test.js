'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarioLaboral, Factura, HistorialTendencia, procesarFacturas, aniosRequeridos, fechaISO } = require('../src/negocio');
function factura(datos = {}) { return { id:'T-1', cliente:'Ejemplo', fechaEmision:'2026-10-16', plazoDiasHabiles:2, estado:'pendiente', fechaVencimiento:null, ...datos }; }

test('salta sábado y domingo; emisión no cuenta', () => {
  assert.equal(new CalendarioLaboral([]).sumarDiasHabiles('2026-10-16', 2), '2026-10-20');
});
test('salta feriado público nacional', () => {
  const cal = new CalendarioLaboral([{date:'2026-10-19',global:true,types:['Public']}]);
  assert.equal(cal.sumarDiasHabiles('2026-10-16', 2), '2026-10-21');
});
test('ignora observancias y feriados no nacionales', () => {
  const cal = new CalendarioLaboral([{date:'2026-10-19',global:true,types:['Observance']}, {date:'2026-10-20',global:false,types:['Public']}]);
  assert.equal(cal.sumarDiasHabiles('2026-10-16', 2), '2026-10-20');
});
test('cruza 2026 -> 2027 sin contar Navidad y Año Nuevo', () => {
  const cal = new CalendarioLaboral(['2026-12-25', '2027-01-01']);
  assert.equal(cal.sumarDiasHabiles('2026-12-24', 5), '2027-01-04');
});
test('fecha hoy igual a vencimiento sigue pendiente; día siguiente vencida', () => {
  const f = new Factura(factura({fechaEmision:'2026-10-16',plazoDiasHabiles:1}));
  const cal = new CalendarioLaboral([]);
  assert.equal(f.evaluar(cal,'2026-10-19').estado,'pendiente');
  assert.equal(f.evaluar(cal,'2026-10-20').estado,'vencida');
});
test('pagada y anulada nunca modificadas', () => {
  for (const estado of ['pagada','anulada']) assert.equal(new Factura(factura({estado})).evaluar(new CalendarioLaboral([]),'2026-10-31').guardar,false);
});
test('idempotencia: resultado correcto no produce PATCH', () => {
  const f = new Factura(factura({fechaVencimiento:'2026-10-20'}));
  assert.equal(f.evaluar(new CalendarioLaboral([]),'2026-10-19').guardar,false);
});
test('datos inválidos se aíslan, no impiden procesar otras facturas', () => {
  const salida = procesarFacturas([factura(), factura({id:'T-2', fechaEmision:'2026-02-30'}), factura({id:'T-3', plazoDiasHabiles:0})], [], '2026-10-19');
  assert.deepEqual(salida.map(x=>x.accion),['ACTUALIZAR','ERROR_VALIDACION','ERROR_VALIDACION']);
});
test('meses y años esperados para salto de diciembre', () => {
  assert.deepEqual(aniosRequeridos([factura({fechaEmision:'2026-12-21',plazoDiasHabiles:15})]),[2026,2027]);
});
test('rechaza fechas inexistentes y plazos no enteros', () => {
  assert.throws(()=>fechaISO('2026-02-29'),/FECHA_INVALIDA/);
  assert.throws(()=>new Factura(factura({plazoDiasHabiles:2.5})),/PLAZO_INVALIDO/);
});

test('historial detecta si la cartera vencida mejora, empeora o permanece estable', () => {
  const base = {resultado:'OK',fechaEjecucion:'2026-10-18T12:00:00.000Z',montoVencido:200000,vencidas:2};
  const historial = new HistorialTendencia([base]);
  assert.equal(historial.determinar({resultado:'OK',montoVencido:150000,vencidas:2}).tendencia,'MEJORANDO');
  assert.equal(historial.determinar({resultado:'OK',montoVencido:250000,vencidas:2}).tendencia,'EMPEORANDO');
  assert.equal(historial.determinar({resultado:'OK',montoVencido:200000,vencidas:2}).tendencia,'ESTABLE');
});

test('crea un resumen historico consolidando los estados calculados', () => {
  const facturas = [
    {...factura({id:'T-1'}),monto:100000},
    {...factura({id:'T-2'}),monto:50000,estado:'pagada'}
  ];
  const registro = new HistorialTendencia([]).crearRegistro(facturas,[
    {id:'T-1',estado:'vencida',accion:'ACTUALIZAR'},
    {id:'T-2',estado:'pagada',accion:'OMITIR_CERRADA'}
  ],'2026-10-19T13:00:00.000Z');
  assert.equal(registro.vencidas,1);
  assert.equal(registro.pagadas,1);
  assert.equal(registro.montoVencido,100000);
  assert.equal(registro.tendencia,'SIN_DATOS');
});
