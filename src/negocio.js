'use strict';

// FUENTE UNICA DE VERDAD: scripts/generar-workflow.js incrusta este archivo
// SIN modificar las reglas en los nodos Code de n8n.
const DIA_MS = 24 * 60 * 60 * 1000;

function fechaISO(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error('FECHA_INVALIDA: se requiere AAAA-MM-DD');
  }
  const [anio, mes, dia] = valor.split('-').map(Number);
  const utc = new Date(Date.UTC(anio, mes - 1, dia));
  if (utc.getUTCFullYear() !== anio || utc.getUTCMonth() !== mes - 1 || utc.getUTCDate() !== dia) {
    throw new Error('FECHA_INVALIDA: la fecha no existe');
  }
  return utc;
}

function utcAISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function fechaHoyCR() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const valor = Object.fromEntries(partes.map(p => [p.type, p.value]));
  return `${valor.year}-${valor.month}-${valor.day}`;
}

class CalendarioLaboral {
  constructor(feriados) {
    if (!Array.isArray(feriados)) throw new Error('FERIADOS_INVALIDOS: se esperaba lista');
    this.feriados = new Set();
    for (const feriado of feriados) {
      if (typeof feriado === 'string') {
        fechaISO(feriado);
        this.feriados.add(feriado);
        continue;
      }
      // Solo feriados PUBLICOS nacionales, no observancias ni festividades regionales.
      if (feriado && feriado.global === true && Array.isArray(feriado.types) && feriado.types.includes('Public')) {
        fechaISO(feriado.date);
        this.feriados.add(feriado.date);
      }
    }
  }

  esHabil(fecha) {
    const d = fechaISO(fecha);
    const diaSemana = d.getUTCDay();
    return diaSemana !== 0 && diaSemana !== 6 && !this.feriados.has(fecha);
  }

  sumarDiasHabiles(fechaEmision, diasHabiles) {
    const fecha = fechaISO(fechaEmision);
    if (!Number.isInteger(diasHabiles) || diasHabiles < 1 || diasHabiles > 60) {
      throw new Error('PLAZO_INVALIDO: debe ser entero de 1 a 60');
    }
    const cursor = new Date(fecha.getTime());
    let acumulados = 0;
    for (let iteracion = 0; acumulados < diasHabiles; iteracion++) {
      // Límite defensivo: evita ciclos anómalos por configuraciones irrazonables.
      if (iteracion > 366) throw new Error('CALENDARIO_INVALIDO: imposible calcular plazo');
      cursor.setUTCDate(cursor.getUTCDate() + 1); // emisión NO cuenta
      if (this.esHabil(utcAISO(cursor))) acumulados++;
    }
    return utcAISO(cursor);
  }
}

class Factura {
  constructor(datos) {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      throw new Error('FACTURA_INVALIDA: registro inexistente');
    }
    if ((typeof datos.id !== 'string' && typeof datos.id !== 'number') || String(datos.id).trim() === '') {
      throw new Error('ID_INVALIDO: no existe identificador');
    }
    this.id = String(datos.id);
    this.cliente = typeof datos.cliente === 'string' ? datos.cliente : 'Sin nombre';
    fechaISO(datos.fechaEmision);
    this.fechaEmision = datos.fechaEmision;
    if (!Number.isInteger(datos.plazoDiasHabiles) || datos.plazoDiasHabiles < 1 || datos.plazoDiasHabiles > 60) {
      throw new Error('PLAZO_INVALIDO: debe ser entero de 1 a 60');
    }
    this.plazoDiasHabiles = datos.plazoDiasHabiles;
    const estadosValidos = ['pendiente', 'vencida', 'pagada', 'anulada'];
    if (!estadosValidos.includes(datos.estado)) throw new Error('ESTADO_INVALIDO: estado desconocido');
    this.estado = datos.estado;
    this.fechaVencimiento = datos.fechaVencimiento ?? null;
  }

  estaCerrada() {
    return this.estado === 'pagada' || this.estado === 'anulada';
  }

  evaluar(calendario, hoyISO) {
    fechaISO(hoyISO);
    if (this.estaCerrada()) {
      return { id: this.id, cliente: this.cliente, accion: 'OMITIR_CERRADA', guardar: false,
        estado: this.estado, fechaVencimiento: this.fechaVencimiento,
        detalle: 'Factura pagada o anulada: no se modifica.' };
    }
    const vencimiento = calendario.sumarDiasHabiles(this.fechaEmision, this.plazoDiasHabiles);
    const nuevoEstado = hoyISO > vencimiento ? 'vencida' : 'pendiente';
    const cambio = vencimiento !== this.fechaVencimiento || nuevoEstado !== this.estado;
    return { id: this.id, cliente: this.cliente, accion: cambio ? 'ACTUALIZAR' : 'SIN_CAMBIOS',
      guardar: cambio, estado: nuevoEstado, fechaVencimiento: vencimiento,
      detalle: cambio ? 'Requiere actualizar fecha y/o estado.' : 'Resultado idéntico; evita escritura duplicada.' };
  }
}

function aniosRequeridos(registros) {
  const anios = new Set();
  for (const registro of registros) {
    try {
      const factura = new Factura(registro);
      if (factura.estaCerrada()) continue;
      const fecha = fechaISO(factura.fechaEmision);
      // Cota superior deliberadamente holgada, max. 60 días hábiles.
      const limite = new Date(fecha.getTime() + (factura.plazoDiasHabiles * 3 + 14) * DIA_MS);
      for (let a = fecha.getUTCFullYear(); a <= limite.getUTCFullYear(); a++) anios.add(a);
    } catch (_) { /* El evaluador informa el registro inválido individualmente. */ }
  }
  return [...anios].sort((a, b) => a - b);
}

function procesarFacturas(registros, feriados, hoyISO) {
  const calendario = new CalendarioLaboral(feriados);
  fechaISO(hoyISO);
  return registros.map(registro => {
    try {
      return new Factura(registro).evaluar(calendario, hoyISO);
    } catch (error) {
      return { id: registro?.id == null ? null : String(registro.id),
        accion: 'ERROR_VALIDACION', guardar: false,
        detalle: String(error.message || error) };
    }
  });
}

class HistorialTendencia {
  constructor(historial = []) {
    if (!Array.isArray(historial)) throw new Error('HISTORIAL_INVALIDO: se esperaba lista');
    this.historial = historial
      .filter(item => item && item.resultado === 'OK' && Number.isFinite(Number(item.montoVencido)))
      .sort((a, b) => String(a.fechaEjecucion).localeCompare(String(b.fechaEjecucion)));
  }

  determinar(actual) {
    if (actual.resultado !== 'OK') {
      return { tendencia: 'NO_DISPONIBLE', conclusion: 'La ejecucion tuvo errores y no se usa para evaluar la tendencia.' };
    }
    const anterior = this.historial.at(-1);
    if (!anterior) {
      return { tendencia: 'SIN_DATOS', conclusion: 'Primera medicion: aun no existe una ejecucion anterior para comparar.' };
    }
    const montoAnterior = Number(anterior.montoVencido) || 0;
    const montoActual = Number(actual.montoVencido) || 0;
    const vencidasAnterior = Number(anterior.vencidas) || 0;
    const vencidasActual = Number(actual.vencidas) || 0;
    if (montoActual < montoAnterior || (montoActual === montoAnterior && vencidasActual < vencidasAnterior)) {
      return { tendencia: 'MEJORANDO', conclusion: 'La cartera vencida disminuyo respecto a la ejecucion anterior.' };
    }
    if (montoActual > montoAnterior || (montoActual === montoAnterior && vencidasActual > vencidasAnterior)) {
      return { tendencia: 'EMPEORANDO', conclusion: 'La cartera vencida aumento respecto a la ejecucion anterior.' };
    }
    return { tendencia: 'ESTABLE', conclusion: 'La cartera vencida se mantiene igual a la ejecucion anterior.' };
  }

  crearRegistro(facturas, resultados, fechaEjecucion = new Date().toISOString()) {
    if (!Array.isArray(facturas) || !Array.isArray(resultados)) {
      throw new Error('DATOS_TENDENCIA_INVALIDOS: se esperaban listas');
    }
    const porId = new Map(resultados.filter(item => item?.id != null).map(item => [String(item.id), item]));
    const consolidadas = facturas.map(factura => ({
      ...factura,
      estado: porId.get(String(factura.id))?.estado ?? factura.estado
    }));
    const contar = estado => consolidadas.filter(item => item.estado === estado).length;
    const monto = estado => consolidadas
      .filter(item => item.estado === estado)
      .reduce((total, item) => total + (Number(item.monto) || 0), 0);
    const errores = resultados.filter(item => String(item?.accion || '').startsWith('ERROR_')).length;
    const actual = {
      fechaEjecucion,
      resultado: errores === resultados.length && errores > 0 ? 'ERROR' : 'OK',
      totalFacturas: consolidadas.length,
      pendientes: contar('pendiente'),
      vencidas: contar('vencida'),
      pagadas: contar('pagada'),
      anuladas: contar('anulada'),
      montoPendiente: monto('pendiente'),
      montoVencido: monto('vencida'),
      errores
    };
    return { ...actual, ...this.determinar(actual) };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CalendarioLaboral, Factura, HistorialTendencia, aniosRequeridos, procesarFacturas, fechaISO, fechaHoyCR };
}
