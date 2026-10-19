'use strict';
const { readFileSync } = require('node:fs');
const { CalendarioLaboral, Factura, aniosRequeridos, procesarFacturas, fechaHoyCR } = require('./src/negocio');
const facturas = JSON.parse(readFileSync('./db.json', 'utf8')).facturas;
const feriadosDemo = JSON.parse(readFileSync('./tests/fixtures/feriados-demostracion.json', 'utf8'));

async function iniciar() {
  const usarAPI = process.argv.includes('--online');
  let feriados = feriadosDemo;
  if (usarAPI) {
    feriados = [];
    for (const anio of aniosRequeridos(facturas)) {
      const respuesta = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${anio}/CR`, { signal: AbortSignal.timeout(12000) });
      if (!respuesta.ok) throw new Error(`Error de Nager.Date: ${respuesta.status} (${anio})`);
      const datos = await respuesta.json();
      if (!Array.isArray(datos) || datos.length === 0) throw new Error(`Sin feriados válidos para ${anio}`);
      feriados.push(...datos);
    }
  }
  console.log(`\nFACTURAS CR | ${fechaHoyCR()} | ${usarAPI ? 'API Nager.Date en vivo' : 'fixture ilustrativa (modo offline)'}`);
  const calendario = new CalendarioLaboral(feriados);
  const ejemplo = new Factura(facturas[0]);
  console.log(`Instancia Factura: ${ejemplo.id} / cliente: ${ejemplo.cliente}`);
  console.log(`Instancia CalendarioLaboral: vencimiento = ${calendario.sumarDiasHabiles(ejemplo.fechaEmision, ejemplo.plazoDiasHabiles)}\n`);
  console.table(procesarFacturas(facturas, feriados, fechaHoyCR()).map(({id,accion,estado,fechaVencimiento,detalle}) => ({id,accion,estado,fechaVencimiento,detalle})));
  console.log('main.js NO modifica db.json. El nodo PATCH de n8n persiste los cambios.');
}
iniciar().catch(error => { console.error('ERROR:', error.message); process.exitCode = 1; });
