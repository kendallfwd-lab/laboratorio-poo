'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const wf = JSON.parse(fs.readFileSync(path.join(root,'workflow/FacturaHabiles_CR_n8n.json'),'utf8'));
const source = fs.readFileSync(path.join(root,'src/negocio.js'),'utf8');
const hash = crypto.createHash('sha256').update(source).digest('hex');
assert.equal(wf.meta.sourceHash,hash,'El workflow no coincide con las clases: npm run workflow:build');
assert.equal(wf.nodes.filter(n=>n.type.includes('Trigger')||n.type.endsWith('manualTrigger')||n.type.endsWith('.webhook')).length,3);
const webhook = wf.nodes.find(n=>n.name==='Webhook Postman');
assert.ok(webhook,'Falta el Webhook para Postman');
assert.equal(webhook.parameters.httpMethod,'POST');
assert.equal(webhook.parameters.path,'facturas-procesar');
assert.equal(webhook.parameters.responseMode,'onReceived');
assert.ok(wf.nodes.filter(n=>n.type.endsWith('httpRequest')).length>=2);
assert.ok(wf.nodes.filter(n=>n.type.endsWith('.if')).length>=1);
assert.ok(wf.nodes.some(n=>n.name==='GET Historial - JSON Server'));
assert.ok(wf.nodes.some(n=>n.name==='Crear historial y tendencia'));
assert.ok(wf.nodes.some(n=>n.name==='POST Historial - JSON Server'));
for (const n of wf.nodes.filter(n=>n.type.endsWith('.code')&&/POO|anios/.test(n.name))) {
  assert.match(n.parameters.jsCode,new RegExp(hash));
  assert.match(n.parameters.jsCode,/class Factura/);
  assert.match(n.parameters.jsCode,/class CalendarioLaboral/);
}
assert.match(wf.nodes.find(n=>n.name==='Crear historial y tendencia').parameters.jsCode,/class HistorialTendencia/);
const nombres = new Set(wf.nodes.map(n=>n.name));
for (const [origen,salidas] of Object.entries(wf.connections)) {
  assert.ok(nombres.has(origen));
  for (const salida of salidas.main) for (const c of salida) assert.ok(nombres.has(c.node));
}
console.log(`Workflow válido: ${wf.nodes.length} nodos, SHA de código compartido correcto, conexiones verificadas.`);
