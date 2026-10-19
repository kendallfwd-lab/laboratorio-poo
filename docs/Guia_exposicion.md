# Guía para la presentación oral — FacturaHábiles CR

**Duración sugerida:** 6–8 minutos. **Objetivo:** mostrar un ciclo real, explicar cada clase y provocar un error controlado.

## 1. Problema (45 segundos)

«Una empresa que factura a crédito no puede sumar simplemente 15 días naturales. Debe excluir sábados, domingos y feriados para asignar vencimientos coherentes. Si la fecha se calcula mal, la empresa podría cobrar antes de tiempo o detectar tarde una cuenta vencida».

## 2. Explicación del diagrama (1 minuto)

```text
Manual / Schedule 07:00
         |
         v
GET /facturas — JSON Server
         |
Preparar años para feriados (Code / POO)
         |
      IF ¿hay años?
    sí /          \ no -> resumen y validaciones
      v
GET feriados Nager.Date (por cada año)
      |
Code: evaluar Factura + CalendarioLaboral
      |
  IF ¿cambió?
   sí /       \ no -> resultado / error
     v
PATCH /facturas/:id — JSON Server
     |
Confirmación de cambio en n8n + db.json
```

## 3. Demostración en vivo (2 minutos)

1. Terminal A: `npm run db` y mostrar `http://127.0.0.1:3001/facturas`.
2. Terminal B: `n8n start`, abrir el workflow importado.
3. Ejecutar con «Execute workflow» sin modificar datos.
4. Mostrar Nager.Date, luego el Code de cálculo, el IF y los nodos PATCH.
5. Recargar las facturas: F-001 pasa a `vencida`, F-002 mantiene `pendiente` con vencimiento calculado, F-005 muestra fecha de 2027.
6. Ejecutar otra vez: la mayoría de resultados pasan a `SIN_CAMBIOS`, demostrando idempotencia.

## 4. Clases POO (1 minuto)

- `Factura`: tiene `id`, `fechaEmision`, `estado` y `plazoDiasHabiles`. El método `evaluar(calendario, hoy)` decide vencimiento, nuevo estado y si se necesita PATCH; `estaCerrada()` protege pagadas y anuladas.
- `CalendarioLaboral`: recibe feriados y ofrece `esHabil(fecha)` y `sumarDiasHabiles(fecha, plazo)`. Cuenta con fechas UTC y compara solo `AAAA-MM-DD`.
- **Una sola lógica:** `scripts/generar-workflow.js` copia las clases a los Code. Mostrar archivo fuente y nodo Code; el hash confirma identidad.
- Ejecución sin n8n: `npm run demo` o `npm run demo:online` (esta última requiere Internet).

## 5. Error controlado en vivo (1 minuto)

**Preferido:** mostrar F-006, que carece de fecha: aparece `ERROR_VALIDACION`, no genera PATCH y el resto se procesa.

**Segundo error opcional:** editar temporalmente la URL Nager por una incorrecta; comprobar `ERROR_API` y cero PATCH. Restaurar inmediatamente la URL.

## 6. Conclusión (45 segundos)

«La parte más difícil fue no duplicar las reglas entre JavaScript normal y n8n, además de bloquear escrituras cuando faltan datos del calendario. Lo resolví generando el workflow desde la lógica POO y fallando de forma segura si una API no responde. La prueba demuestra que las clases no son decorativas: son las que gobiernan las decisiones de negocio».

## Preguntas previsibles del docente

**¿Por qué dos clases?** Una representa la factura y sus estados; la otra administra el calendario laboral; separar responsabilidades simplifica pruebas.

**¿Por qué la emisión no cuenta?** La regla del proyecto fija el primer día del plazo como el día hábil siguiente a la emisión.

**¿Por qué el vencimiento se calcula en UTC?** Para que la operación por fecha no cambie por DST o zona horaria del servidor; para decidir vencimiento se usa la fecha local de Costa Rica.

**¿Qué pasa si falla una API?** Se genera una alerta y no se modifica ninguna factura hasta disponer de todos los años requeridos.

**¿Por qué el mismo código dentro del Code?** n8n Code no requiere importar módulos locales externos; el generador inserta la clase original y verifica su hash.

**¿Cómo se comprueba que funciona?** Pruebas de unidad, resultados del nodo HTTP PATCH, vista del JSON Server después de ejecutar y un caso de error inducido.
