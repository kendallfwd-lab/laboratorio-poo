'use strict';
// Integración HTTP LOCAL y evaluación de los Code generados: NO es una
// ejecución dentro de n8n ni una consulta en vivo a Nager.Date.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const fs = require('node:fs');
const wf = JSON.parse(fs.readFileSync('workflow/FacturaHabiles_CR_n8n.json','utf8'));
const semilla = JSON.parse(fs.readFileSync('db.semilla.json','utf8')).facturas;
const feriados = JSON.parse(fs.readFileSync('tests/fixtures/feriados-demostracion.json','utf8'));
const codigo = name => wf.nodes.find(n => n.name === name).parameters.jsCode;
const items = datos => datos.map(json => ({json}));
function evaluar(name, entrada, previos={}) {
  const $ = n => ({all:() => previos[n] || []});
  return vm.runInNewContext('(function(){\n'+codigo(name)+'\n})()',{
    $input:{all:()=>entrada,first:()=>entrada[0]}, $, Intl,Date,Number,Object,String,Array,Set,Map,Error,RegExp
  }, {timeout:3000});
}
async function iniciarServidor() {
  const estado = {datos:structuredClone(semilla), patches:[], fallarAnio:null};
  const servidor = http.createServer(async (req,res) => {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    const url = new URL(req.url,'http://127.0.0.1');
    if (req.method==='GET' && url.pathname==='/facturas') {
      res.end(JSON.stringify(estado.datos));return;
    }
    if (req.method==='GET' && /^\/feriados\/\d{4}$/.test(url.pathname)) {
      const anio=+url.pathname.split('/')[2];
      if (estado.fallarAnio===anio) {res.statusCode=503;res.end(JSON.stringify({error:'servicio de feriados no disponible'}));return;}
      res.end(JSON.stringify(feriados.filter(f=>f.date.startsWith(String(anio)))));return;
    }
    const match=url.pathname.match(/^\/facturas\/(.+)$/);
    if (req.method==='PATCH' && match) {
      const id=decodeURIComponent(match[1]);
      const registro=estado.datos.find(f=>f.id===id);
      if (!registro) {res.statusCode=404;res.end(JSON.stringify({error:'no existe'}));return;}
      let cuerpo='';for await(const parte of req)cuerpo+=parte;
      const cambios=JSON.parse(cuerpo);
      Object.assign(registro,cambios);estado.patches.push({id,cambios});res.end(JSON.stringify(registro));return;
    }
    res.statusCode=404;res.end(JSON.stringify({error:'ruta inexistente'}));
  });
  await new Promise(resolve=>servidor.listen(0,'127.0.0.1',resolve));
  return {servidor,estado,base:`http://127.0.0.1:${servidor.address().port}`};
}
async function recorrer(base) {
  const dbRespuesta=await fetch(base+'/facturas');
  assert.equal(dbRespuesta.status,200);
  const origen=items(await dbRespuesta.json());
  const control=evaluar('Preparar anios y validar fuente',items([]),{'GET Facturas - JSON Server':origen});
  const responses=[];
  for (const item of control) {
    if (!item.json.consultar) continue;
    const r=await fetch(base+'/feriados/'+item.json.anio);
    const cuerpo=await r.json();
    if (!r.ok) responses.push({json:cuerpo});
    else responses.push(...items(cuerpo));
  }
  const calculos=evaluar('Calcular vencimientos POO',responses,{
    'GET Facturas - JSON Server':origen,
    'Preparar anios y validar fuente':control
  });
  const parches=[];
  for (const resultado of calculos) {
    if (resultado.json.guardar!==true) continue;
    const r=await fetch(base+'/facturas/'+encodeURIComponent(resultado.json.id),{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({estado:resultado.json.estado,fechaVencimiento:resultado.json.fechaVencimiento})
    });
    assert.equal(r.status,200);
    parches.push(await r.json());
  }
  return {calculos,parches};
}
test('HTTP local: GET facturas + GET feriados + POO n8n + PATCH + segunda ejecución idempotente',async()=>{
  const {servidor,estado,base}=await iniciarServidor();
  try {
    const primera=await recorrer(base);
    assert.equal(primera.parches.length,6);
    assert.equal(estado.datos.find(x=>x.id==='F-001').estado,'vencida');
    assert.equal(estado.datos.find(x=>x.id==='F-005').fechaVencimiento,'2027-01-13');
    assert.equal(estado.datos.find(x=>x.id==='F-006').fechaVencimiento,null);
    assert.equal(estado.datos.find(x=>x.id==='F-003').estado,'pagada');
    const segunda=await recorrer(base);
    assert.equal(segunda.parches.length,0,'la segunda ejecución no debe escribir');
    assert.equal(estado.patches.length,6);
    assert.ok(segunda.calculos.some(x=>x.json.accion==='SIN_CAMBIOS'));
  } finally {await new Promise(resolve=>servidor.close(resolve));}
});
test('HTTP local: un año de la API devuelve 503 -> ERROR_API, cero PATCH',async()=>{
  const {servidor,estado,base}=await iniciarServidor();
  try {
    estado.fallarAnio=2027;
    const salida=await recorrer(base);
    assert.equal(salida.calculos[0].json.accion,'ERROR_API');
    assert.equal(salida.parches.length,0);
    assert.equal(estado.patches.length,0);
  } finally {await new Promise(resolve=>servidor.close(resolve));}
});
