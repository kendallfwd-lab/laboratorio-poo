'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const workflow = JSON.parse(readFileSync('workflow/FacturaHabiles_CR_n8n.json','utf8'));
const facturas = JSON.parse(readFileSync('db.semilla.json','utf8')).facturas;
const feriados = JSON.parse(readFileSync('tests/fixtures/feriados-demostracion.json','utf8'));
const code = nombre => workflow.nodes.find(n => n.name === nombre).parameters.jsCode;
const items = registros => registros.map(json => ({json}));
function ejecutar(nombre, entrada, anteriores={}) {
  const $ = nombreNodo => ({all: () => anteriores[nombreNodo] || []});
  return vm.runInNewContext("(function(){\n" + code(nombre) + "\n})()", {
    $input:{all:()=>entrada, first:()=>entrada[0]}, $,
    Intl, Date, Number, Object, String, Array, Set, Map, Error, RegExp
  },{timeout:3000});
}

test('adaptador de n8n detecta años y evalúa respuestas de Nager', () => {
  const inicio = items(facturas);
  const anios = ejecutar('Preparar anios y validar fuente',items([]),{'GET Facturas - JSON Server':inicio});
  assert.deepEqual(Array.from(anios, x=>x.json.anio),[2026,2027]);
  const salida = ejecutar('Calcular vencimientos POO',items(feriados),{
    'GET Facturas - JSON Server':inicio,
    'Preparar anios y validar fuente':anios
  });
  assert.equal(salida.find(x=>x.json.id==='F-001').json.estado,'vencida');
  assert.equal(salida.find(x=>x.json.id==='F-005').json.fechaVencimiento,'2027-01-13');
  assert.equal(salida.find(x=>x.json.id==='F-006').json.accion,'ERROR_VALIDACION');
});
test('API Nager caída bloquea TODAS las escrituras', () => {
  const inicio = items(facturas);
  const anios = ejecutar('Preparar anios y validar fuente',items([]),{'GET Facturas - JSON Server':inicio});
  const salida = ejecutar('Calcular vencimientos POO',items([{error:'ECONNRESET'}]),{
    'GET Facturas - JSON Server':inicio,'Preparar anios y validar fuente':anios
  });
  assert.equal(salida[0].json.accion,'ERROR_API');
  assert.equal(salida[0].json.guardar,false);
});
test('si falta calendario 2027 se bloquea todo',()=>{
  const inicio = items(facturas);
  const anios = ejecutar('Preparar anios y validar fuente',items([]),{'GET Facturas - JSON Server':inicio});
  const salida = ejecutar('Calcular vencimientos POO',items(feriados.filter(x=>x.date.startsWith('2026'))),{
    'GET Facturas - JSON Server':inicio,'Preparar anios y validar fuente':anios
  });
  assert.equal(salida[0].json.accion,'ERROR_API');
});
test('JSON Server caído emite error controlado',()=>{
  const salida = ejecutar('Preparar anios y validar fuente',items([]),{'GET Facturas - JSON Server':items([{error:'ECONNREFUSED'}])});
  assert.equal(salida[0].json.accion,'ERROR_JSON_SERVER');
  assert.equal(salida[0].json.consultar,false);
});
test('JSON Server vacío emite SIN_FACTURAS',()=>{
  const salida = ejecutar('Preparar anios y validar fuente',items([]),{'GET Facturas - JSON Server':items([{}])});
  assert.equal(salida[0].json.accion,'SIN_FACTURAS');
});

test('nodo de historial crea una medicion con tendencia',()=>{
  const resultados = items([
    {id:'F-001',estado:'vencida',accion:'ACTUALIZAR'},
    {id:'F-002',estado:'pendiente',accion:'SIN_CAMBIOS'}
  ]);
  const salida = ejecutar('Crear historial y tendencia',resultados,{
    'GET Facturas - JSON Server':items(facturas),
    'GET Historial - JSON Server':items([{resultado:'OK',fechaEjecucion:'2026-10-18T12:00:00.000Z',montoVencido:500000,vencidas:3}])
  });
  assert.equal(salida.length,1);
  assert.equal(salida[0].json.totalFacturas,9);
  assert.ok(['MEJORANDO','EMPEORANDO','ESTABLE'].includes(salida[0].json.tendencia));
});
