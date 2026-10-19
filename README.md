# FacturaHábiles CR — Laboratorio #1 (POO + n8n)

Solución de negocio **sin interfaz gráfica**: calcula el vencimiento de facturas en días hábiles de Costa Rica, consulta feriados reales con **Nager.Date**, obtiene y actualiza facturas mediante **JSON Server**, y ejecuta la automatización con **n8n**. JavaScript puro y dos clases reutilizables.

## 1. Contenido de la entrega

| Ruta | Uso |
| --- | --- |
| `workflow/FacturaHabiles_CR_n8n.json` | **Este es el ÚNICO JSON que se importa a n8n.** |
| `db.json` | Base de datos de JSON Server. **No se importa a n8n.** |
| `db.semilla.json` | Respaldo para repetir la presentación. |
| `src/negocio.js` | Clases `Factura` y `CalendarioLaboral`, reglas y motor compartido. |
| `main.js` | Ejecución de clases sin n8n; muestra resultados, no escribe. |
| `tests/*.test.js` | Pruebas unitarias y de adaptadores de n8n. |
| `scripts/generar-workflow.js` | Incrusta la MISMA lógica JS en Code de n8n. |
| `docs/Logica_de_negocio.pdf` | Documento explicativo, tres páginas. |
| `docs/Logica_de_negocio.docx` | Versión editable. |
| `docs/Guia_exposicion.md` | Guion y evidencias para presentar. |

### Extension implementada: historial y tendencia

El proyecto incluye el **Reto 4** de la extension. Cada ejecucion guarda en `/historial` una fotografia de la cartera con cantidades y montos por estado. La clase `HistorialTendencia` compara la medicion actual con la ultima ejecucion valida y devuelve `MEJORANDO`, `ESTABLE`, `EMPEORANDO`, `SIN_DATOS` o `NO_DISPONIBLE`. El panel visual muestra esta conclusion y una grafica de las ultimas seis ejecuciones.

## 2. Requisitos

- **Node.js 20 o superior**, npm y acceso a Internet.
- **n8n** local, instalado con `npm install -g n8n` (o versión compatible de escritorio/servidor).
- Sin cuentas ni claves para `date.nager.at`.
- Los comandos se ejecutan desde **esta carpeta del proyecto**.

## 3. Arranque paso a paso

**Terminal A — Base de datos**

```bash
npm install
npm run db
```

Abre `http://127.0.0.1:3001` para usar el panel visual. La API queda disponible en `http://127.0.0.1:3001/facturas` y el historial en `http://127.0.0.1:3001/historial`. JSON Server debe permanecer abierto mientras n8n ejecuta el workflow.

**Terminal B — n8n**

```bash
n8n start
```

Abre `http://localhost:5678` y completa la configuración inicial de n8n si hace falta.

**Dentro de n8n**

1. Crea un workflow nuevo, menú de tres puntos → **Import from File**.
2. Importa solamente `workflow/FacturaHabiles_CR_n8n.json`.
3. Comprueba que los HTTP Request apuntan a:
   - `http://127.0.0.1:3001/facturas` (GET)
   - `https://date.nager.at/api/v3/PublicHolidays/{{$json.anio}}/CR` (feriados)
   - `http://127.0.0.1:3001/facturas/{{$json.id}}` (PATCH)
4. Haz clic en **Execute workflow** (nodo **Ejecutar ahora**).
5. Revisa los resultados de `Verificar persistencia` y `Resultados sin cambios y alertas`.
6. Comprueba otra vez `http://127.0.0.1:3001/facturas`: F-001 y F-008 deben figurar vencidas para la fecha 19-oct-2026, y F-006 debe permanecer sin modificar por fecha faltante.
7. Si deseas ejecución automática a las 07:00 hora Costa Rica, **activa** el workflow. No lo actives para un laboratorio de una sola ejecución si no deseas ejecuciones diarias.

**Ejecutar desde Postman**

El workflow incluye el trigger `Webhook Postman`. Para una prueba, abre ese nodo, pulsa **Listen for test event** y envía:

```text
POST http://localhost:5678/webhook-test/facturas-procesar
```

Para uso normal, publica o activa el workflow y envía:

```text
POST http://localhost:5678/webhook/facturas-procesar
```

Usa `Content-Type: application/json`. El cuerpo puede ser `{ "accion": "procesar" }`; el webhook inicia el mismo recorrido que los triggers manual y programado. La respuesta inmediata confirma que el workflow comenzó. Consulta `GET http://localhost:3001/facturas` y `GET http://localhost:3001/historial` para revisar el resultado.

> **Si n8n se ejecuta en Docker**, `127.0.0.1` se refiere al contenedor, no a tu máquina. Cambia AMBAS URLs de JSON Server (GET y PATCH) a `http://host.docker.internal:3001/....`, asegurando que JSON Server esté accesible desde Docker. Mantén Nager sin cambios.

## 4. Pruebas desde terminal

```bash
npm test                  # 17 pruebas: POO, adaptadores Code y HTTP local con PATCH
npm run demo              # instancias reales leídas de db.json, fixture de feriados ilustrativa
npm run demo:online       # pide feriados EN VIVO a Nager.Date (sin n8n)
npm run workflow:check    # verifica conexiones y hash de lógica compartida
node scripts/probar-conexiones.js   # HTTP real de JSON Server y Nager.Date (sin escribir)
```

`npm run demo` funciona aun sin acceso a Internet; su fixture es **ilustrativa, no normativa**. Las pruebas HTTP levantan un servidor local temporal, comprueban seis PATCH y la idempotencia; **no son una ejecución de n8n**. En n8n y `demo:online`, los feriados se obtienen realmente de Nager.Date.

## 5. Reglas de negocio

1. Solo facturas con `estado=pendiente` o `vencida` se recalculan; pagadas/anuladas se preservan.
2. La fecha de emisión no cuenta: se suman 1–60 días hábiles **posteriores**.
3. Sábados, domingos y feriados **públicos nacionales** (`global=true`, `types` incluye `Public`) no cuentan.
4. Una factura solo está **vencida** si la fecha local de Costa Rica es **posterior** al vencimiento; el propio día sigue pendiente.
5. Fechas ISO imposibles, ID/estado/plazo inválidos causan `ERROR_VALIDACION` de esa factura, sin PATCH.
6. Si no se reciben **todos** los años de Nager.Date, se emite `ERROR_API` y no se modifica **ninguna factura** (fallo cerrado).
7. Si JSON Server no responde, se emite `ERROR_JSON_SERVER`, sin ejecutar cálculo ni escrituras.
8. Solo se hace PATCH si cambia el estado o la fecha de vencimiento: **idempotencia**.
9. El programa consulta años futuros cuando el período cruza diciembre/enero.

**Ejemplos de demostración**: F-001 es una vencida, F-002 sigue pendiente, F-003 está pagada, F-005 cruza año y F-006 omite fecha para probar validación.

## 6. Manejo y demostración de errores

**Caso A — dato incompleto (sin cambiar nada):** F-006 no tiene `fechaEmision`. Ejecutar n8n y buscar `ERROR_VALIDACION` en `Resultados sin cambios y alertas`. La ejecución continúa para las demás facturas.

**Caso B — fallo de API:** temporalmente cambia en n8n la URL del nodo `GET Feriados - Nager Date` a `https://date.nager.at/api/v3/RUTA-INCORRECTA/2026/CR` o desactiva la red; ejecutar el workflow. El resultado debe ser `ERROR_API` y **NO** debe ejecutarse ningún PATCH. Restaura la URL original.

**Caso C — JSON Server desconectado:** detén la Terminal A, ejecuta n8n; observa `ERROR_JSON_SERVER`. Inicia de nuevo el servidor.

Para **restablecer los datos** antes de otra demostración, detén JSON Server, luego:

```bash
npm run db:reset
npm run db
```

## 7. Fuente única de verdad de POO

**No edites la lógica directamente en los nodos Code**. Cambia `src/negocio.js`, después ejecuta:

```bash
npm run workflow:build
npm run preflight
```

El generador copia literalmente el mismo código de clase y cálculo en `Preparar anios y validar fuente`, `Calcular vencimientos POO` y `Sin consulta o fallo de origen`. Incluye un SHA-256 del módulo original en el workflow para detectar divergencias.

## 8. Límites conocidos y decisiones

- Los feriados vienen de la **API pública Nager.Date v3**. La clasificación elegida incluye solo feriados públicos nacionales; los cambios legales o traslados especiales deben verificarse con autoridades costarricenses antes de usarlo para cumplimiento legal.
- `JSON Server` es un backend de práctica, no recomendado para datos sensibles ni facturación de producción.
- Se usan 9 facturas de **demostración, no datos de clientes reales**. Los nombres y montos son ficticios.
- Un HTTP GET sin paginación es adecuado para este laboratorio. Para una empresa real se añadirían paginación, autenticación, auditoría de cambios y control de concurrencia.
- **Validado aquí:** 17 pruebas JavaScript, adaptadores de nodos Code y simulación HTTP local de GET, API y PATCH. **Aún requiere validación en tu máquina:** ejecución completa real en n8n con JSON Server + Nager.Date y capturas del resultado. No se declara un E2E real sin ejecutarlo.

## 9. GitHub

```bash
git init
git add .
git commit -m "Laboratorio POO n8n: facturas y dias habiles CR"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

Crea el repositorio vacío en GitHub antes de ejecutar `git remote add origin`, o utiliza la CLI de GitHub. **No se creó ni publicó ningún repositorio remoto automáticamente.**

**Documentación consultada:** https://docs.n8n.io/ ; https://date.nager.at/Api ; https://github.com/typicode/json-server
