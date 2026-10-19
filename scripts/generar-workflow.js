'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = path.resolve(__dirname, '..');
const ruta = path.join(dir, 'src/negocio.js');
const codigo = fs.readFileSync(ruta, 'utf8');
const poos = codigo.slice(codigo.indexOf('const DIA_MS'), codigo.indexOf("if (typeof module !== 'undefined'"));
const checksum = crypto.createHash('sha256').update(codigo).digest('hex');
const fuente = `// AUTO-GENERADO desde src/negocio.js (SHA256: ${checksum}).\n// Modifica src/negocio.js y ejecuta npm run workflow:build.\n${poos}\n`;

const extraer = `
function registrosDesde(items) {
  return items.flatMap(item => {
    const valor = item.json;
    if (Array.isArray(valor)) return valor;
    if (Array.isArray(valor?.data)) return valor.data;
    if (Array.isArray(valor?.facturas)) return valor.facturas;
    return [valor];
  });
}
function falloJSONServer(registros) {
  return registros.length === 1 && (
    !registros[0] || registros[0].error != null || registros[0].code === 'ECONNREFUSED'
  );
}
`;
const preparar = fuente + extraer + `
const registros = registrosDesde($('GET Facturas - JSON Server').all());
if (falloJSONServer(registros)) {
  return [{json: {consultar:false, accion:'ERROR_JSON_SERVER', guardar:false,
    detalle: 'JSON Server no respondió o devolvió un error. Verifica el puerto 3001 y la ruta /facturas.'}}];
}
if (!registros.length || registros.every(item => !item || Object.keys(item).length === 0)) {
  return [{json:{consultar:false, accion:'SIN_FACTURAS', guardar:false,
    detalle:'No existen facturas para evaluar.'}}];
}
const anios = aniosRequeridos(registros);
if (!anios.length) {
  return [{json:{consultar:false, accion:'SIN_CONSULTA', guardar:false,
    detalle:'No hay facturas abiertas con fechas válidas; se revisarán los errores locales.'}}];
}
return anios.map(anio => ({json:{consultar:true, anio}}));`;
const calcular = fuente + extraer + `
const registros = registrosDesde($('GET Facturas - JSON Server').all());
const respuestas = registrosDesde($input.all());
const aniosEsperados = $('Preparar anios y validar fuente').all()
  .filter(item => item.json.consultar === true).map(item => Number(item.json.anio));
const errorHTTP = respuestas.some(item => !item || item.error != null || item.code != null);
const fechas = respuestas.filter(item => typeof item?.date === 'string' &&
  /^\\d{4}-\\d{2}-\\d{2}$/.test(item.date));
const aniosPresentes = new Set(fechas.map(item => Number(item.date.slice(0, 4))));
const faltantes = aniosEsperados.filter(anio => !aniosPresentes.has(anio));
if (errorHTTP || faltantes.length || !fechas.length) {
  return [{json:{ accion:'ERROR_API', guardar:false,
    detalle:'No se pudieron verificar TODOS los calendarios requeridos (' +
      aniosEsperados.join(', ') + '). No se modifica ninguna factura. ' +
      (faltantes.length ? 'Sin respuesta valida para: ' + faltantes.join(', ') : 'Respuesta de error o vacía.') }}];
}
const resultados = procesarFacturas(registros, fechas, fechaHoyCR());
return resultados.map(resultado => ({json: resultado}));`;
const sinConsulta = fuente + extraer + `
const control = $input.first().json;
if (control.accion !== 'SIN_CONSULTA') return [{json:control}];
const registros = registrosDesde($('GET Facturas - JSON Server').all());
const resultados = procesarFacturas(registros, [], fechaHoyCR());
return resultados.map(resultado => ({json:resultado}));`;
const finales = `
return $input.all().map(item => ({json: {
  ...item.json,
  resultadoWorkflow: item.json.accion === 'ERROR_API' ? 'PROTEGIDO: sin escrituras' :
    item.json.accion === 'ERROR_VALIDACION' ? 'REVISAR FACTURA' :
    item.json.accion || 'SIN_CAMBIOS'
}}));`;
const resultadoPatch = `
return $input.all().map(item => {
  const r = item.json;
  if (r.error != null || r.code != null) return {json:{accion:'ERROR_ESCRITURA',
    detalle:'No se pudo persistir un PATCH en JSON Server', error:r.error || r.code}};
  return {json:{accion:'ACTUALIZACION_PERSISTIDA', id:r.id,
    estado:r.estado, fechaVencimiento:r.fechaVencimiento,
    detalle:'Registro confirmado por PATCH de JSON Server.'}};
});`;
const historial = fuente + extraer + `
const facturas = registrosDesde($('GET Facturas - JSON Server').all());
const resultados = registrosDesde($input.all());
const anteriores = registrosDesde($('GET Historial - JSON Server').all())
  .filter(item => item && item.error == null && item.code == null);
const registro = new HistorialTendencia(anteriores)
  .crearRegistro(facturas, resultados, new Date().toISOString());
return [{json:registro}];`;

function node(nombre, tipo, version, posicion, parametros, otros={}) {
  return {parameters:parametros, id:crypto.createHash('sha1').update(nombre).digest('hex').slice(0, 8)+'-0000-4000-8000-000000000001',
    name:nombre, type:tipo, typeVersion:version, position:posicion, ...otros};
}
function code(nombre,x,y,jsCode) { return node(nombre,'n8n-nodes-base.code',2,[x,y],{mode:'runOnceForAllItems',jsCode}); }
function http(nombre,x,y,method,url,otros={}) {
  return node(nombre,'n8n-nodes-base.httpRequest',4.2,[x,y],{
    method, url, options:{timeout:15000}, ...otros
  }, {onError:'continueRegularOutput', alwaysOutputData:true});
}
function ifNode(nombre,x,y,prop) {
  return node(nombre,'n8n-nodes-base.if',2.2,[x,y],{
    conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},combinator:'and',conditions:[
      {id:'cond-'+prop,leftValue:`={{ $json.${prop} }}`,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}
    ]}, options:{}
  });
}
const nodos = [
  node('Ejecutar ahora','n8n-nodes-base.manualTrigger',1,[200,260],{}),
  node('Cada dia a las 07:00','n8n-nodes-base.scheduleTrigger',1.2,[200,440],{rule:{interval:[{field:'days',triggerAtHour:7,triggerAtMinute:0}]}}),
  node('Webhook Postman','n8n-nodes-base.webhook',2,[200,620],{
    httpMethod:'POST',path:'facturas-procesar',responseMode:'onReceived',options:{}
  },{webhookId:'6c174f25-3db8-4ac8-b1fd-89d9d7ee2718'}),
  http('GET Facturas - JSON Server',480,340,'GET','http://127.0.0.1:3001/facturas'),
  http('GET Historial - JSON Server',720,340,'GET','http://127.0.0.1:3001/historial'),
  code('Preparar anios y validar fuente',960,340,preparar),
  ifNode('Hay calendarios para consultar',1200,340,'consultar'),
  http('GET Feriados - Nager Date',1450,210,'GET','=https://date.nager.at/api/v3/PublicHolidays/{{$json.anio}}/CR'),
  code('Calcular vencimientos POO',1710,210,calcular),
  ifNode('Requiere actualizar factura',1960,210,'guardar'),
  http('PATCH Factura - JSON Server',2210,90,'PATCH','=http://127.0.0.1:3001/facturas/{{$json.id}}',{
    sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({ estado: $json.estado, fechaVencimiento: $json.fechaVencimiento }) }}'
  }),
  code('Verificar persistencia',2470,90,resultadoPatch),
  code('Resultados sin cambios y alertas',2210,330,finales),
  code('Sin consulta o fallo de origen',1450,500,sinConsulta),
  code('Crear historial y tendencia',1960,550,historial),
  http('POST Historial - JSON Server',2210,550,'POST','http://127.0.0.1:3001/historial',{
    sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json) }}'
  })
];
const conexiones = {};
function unir(origen,destino,salida=0) {
  conexiones[origen] ||= {main:[]};
  while (conexiones[origen].main.length<=salida) conexiones[origen].main.push([]);
  conexiones[origen].main[salida].push({node:destino,type:'main',index:0});
}
unir('Ejecutar ahora','GET Facturas - JSON Server');
unir('Cada dia a las 07:00','GET Facturas - JSON Server');
unir('Webhook Postman','GET Facturas - JSON Server');
unir('GET Facturas - JSON Server','GET Historial - JSON Server');
unir('GET Historial - JSON Server','Preparar anios y validar fuente');
unir('Preparar anios y validar fuente','Hay calendarios para consultar');
unir('Hay calendarios para consultar','GET Feriados - Nager Date',0);
unir('Hay calendarios para consultar','Sin consulta o fallo de origen',1);
unir('GET Feriados - Nager Date','Calcular vencimientos POO');
unir('Calcular vencimientos POO','Requiere actualizar factura');
unir('Requiere actualizar factura','PATCH Factura - JSON Server',0);
unir('Requiere actualizar factura','Resultados sin cambios y alertas',1);
unir('PATCH Factura - JSON Server','Verificar persistencia');
unir('Calcular vencimientos POO','Crear historial y tendencia');
unir('Sin consulta o fallo de origen','Crear historial y tendencia');
unir('Crear historial y tendencia','POST Historial - JSON Server');
const workflow = {
  name:'FacturaHabiles CR | POO + JSON Server + Nager.Date',
  nodes:nodos, connections:conexiones, active:false,
  settings:{executionOrder:'v1', timezone:'America/Costa_Rica'},
  tags:[], pinData:{},
  meta:{templateCredsSetupCompleted:true, sourceHash:checksum}
};
const destino = path.join(dir,'workflow','FacturaHabiles_CR_n8n.json');
fs.writeFileSync(destino,JSON.stringify(workflow,null,2)+'\n');
console.log(`Workflow exportado: ${destino}\nSHA-256 de src/negocio.js: ${checksum}\n${nodos.length} nodos, tres triggers.`);
