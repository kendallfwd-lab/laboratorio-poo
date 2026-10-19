'use strict';
async function obtener(url) {
  const respuesta = await fetch(url,{signal:AbortSignal.timeout(15000)});
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}: ${url}`);
  const datos = await respuesta.json();
  if (!Array.isArray(datos)) throw new Error(`No devolvió arreglo: ${url}`);
  return datos;
}
(async()=>{
  const facturas = await obtener('http://127.0.0.1:3001/facturas');
  console.log(`JSON Server REAL: OK, ${facturas.length} facturas.`);
  for (const anio of [2026,2027]) {
    const feriados = await obtener(`https://date.nager.at/api/v3/PublicHolidays/${anio}/CR`);
    if (!feriados.length || !feriados.some(x=>x.date)) throw new Error(`No hay feriados válidos: ${anio}`);
    console.log(`Nager.Date REAL: OK, ${feriados.length} eventos devueltos para CR/${anio}.`);
  }
  console.log('CONEXIONES OK; falta ejecutar el workflow dentro de n8n para acreditar E2E.');
})().catch(e=>{console.error('ERROR DE CONEXIÓN:',e.message);process.exitCode=1;});
