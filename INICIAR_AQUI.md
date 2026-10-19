# Iniciar FacturaHábiles CR desde la terminal

Esta carpeta contiene los **archivos para la entrega y la demostración**, sin interfaz propia. n8n sí abrirá su editor local en el navegador.

## Qué archivo hace cada cosa

- **`db.json`**: base de datos con nueve facturas ficticias; **NO se importa en n8n**.
- **`db.semilla.json`**: respaldo para reiniciar la demostración.
- **`package.json`**: define los comandos `npm run db`, `npm run n8n`, `npm test`, etc.
- **`package-lock.json`**, si existe: fija las versiones de dependencias para repetir instalaciones.
- **`workflow/FacturaHabiles_CR_n8n.json`**: **ÚNICO JSON que debes importar en n8n**.
- **`src/negocio.js`** y **`main.js`**: clases JavaScript y demostración independiente.

## 1. Verificar requisitos

En **Windows PowerShell**, Terminal de macOS o Linux:

```bash
node -v
npm -v
```

Usa una versión compatible de Node.js (n8n requiere entre 20.19 y 24.x, inclusive). Si alguno de los comandos no se reconoce, instala Node.js primero y reinicia la terminal.

## 2. Instalar dependencias (una sola vez)

Abre la terminal **DENTRO de esta carpeta extraída** y ejecuta:

```bash
npm install
```

> Esto instala JSON Server para este proyecto. `npm run n8n` usa `npx` para obtener n8n por separado si todavía no lo tienes; necesita Internet al menos la primera vez y puede tardar. No esperes que aparezca una interfaz hasta abrir el navegador.

## 3. Levantar JSON Server — PRIMERA terminal

```bash
npm run db
```

Mantén esta terminal abierta y verifica en un navegador:

`http://127.0.0.1:3001/facturas`

Se debe mostrar un arreglo JSON con **9 facturas**.

## 4. Levantar n8n — SEGUNDA terminal

Abre otra terminal en la misma carpeta y ejecuta:

```bash
npm run n8n
```

Abre:

`http://localhost:5678`

Si n8n ya está instalado globalmente, también puedes usar `n8n start` (o `n8n`). Si ya hay otro n8n abierto en el puerto 5678, usa el que esté abierto; no inicies una segunda instancia con el mismo puerto.

## 5. Importar el workflow

1. En n8n, crea un nuevo workflow.
2. Haz clic en el menú del workflow (tres puntos) → **Import from File**.
3. Selecciona `workflow/FacturaHabiles_CR_n8n.json`.
4. Comprueba los nodos HTTP:
   - **GET Facturas - JSON Server:** `http://127.0.0.1:3001/facturas`
   - **GET Feriados - Nager Date:** `https://date.nager.at/api/v3/PublicHolidays/{{$json.anio}}/CR` (expresión)
   - **PATCH Factura - JSON Server:** `http://127.0.0.1:3001/facturas/{{$json.id}}` (expresión)
5. Haz clic en **Execute workflow**; observarás el nodo `Ejecutar ahora` y las bifurcaciones IF.
6. Recarga `http://127.0.0.1:3001/facturas`: ahora algunas facturas deben contener una `fechaVencimiento` calculada y el estado actualizado.
7. Revisa los nodos `Verificar persistencia` y `Resultados sin cambios y alertas` para ver resultados y facturas con errores.

> Si no se observa un cambio, verifica la salida del nodo que falló. Sin JSON Server en el puerto 3001 o sin acceso a Nager.Date, el workflow no debe actualizar datos.

## 6. Comprobar que las APIs se comunican

Con JSON Server abierto, en otra terminal ejecuta:

```bash
npm run verificar:conexion
```

Este comando consulta **sin modificar** las facturas y los feriados de 2026/2027. Para probar las clases y validaciones:

```bash
npm run demo
npm test
npm run workflow:check
```

## 7. Restablecer la base de datos para la exposición

Cierra JSON Server con **Ctrl+C**, ejecuta:

```bash
npm run db:reset
npm run db
```

Después vuelve a ejecutar el workflow de n8n.

## 8. Errores comunes

- **`n8n` no se reconoce** → usa `npm run n8n`; esto ejecuta `npx --yes n8n start`.
- **`json-server` no se reconoce** → asegúrate de haber ejecutado `npm install` dentro del proyecto; luego usa `npm run db`, no el comando directo.
- **`ECONNREFUSED 127.0.0.1:3001`** → JSON Server no está encendido; comprueba Terminal 1 y el puerto 3001.
- **`EADDRINUSE 3001`** → otro programa ya utiliza ese puerto. Para evitar editar dos nodos de n8n, cierra el otro proceso y conserva 3001.
- **`EADDRINUSE 5678`** → n8n ya corre. Abre `http://localhost:5678`, en vez de iniciarlo otra vez.
- **Node.js incompatible** → instala una versión de Node.js dentro del rango compatible.
- **Error API de feriados** → se requiere Internet y acceso a `https://date.nager.at`; el workflow bloquea escrituras por seguridad.
- **n8n en Docker o en la nube** → `127.0.0.1:3001` apunta a Docker o al servidor remoto, **no** a tu computadora. Este ZIP está preparado para ejecutar **ambos procesos localmente**, no por Docker. Para Docker debe configurarse el acceso a host y cambiar GET y PATCH.

**Importante:** no se debe importar `db.json` como un workflow; únicamente se importa `workflow/FacturaHabiles_CR_n8n.json`. JSON Server y n8n son dos procesos distintos que se comunican por HTTP.

**Estado de verificación:** las pruebas automáticas pueden aprobarse sin demostrar que una instancia de n8n ejecutó el workflow. Para la defensa debes ejecutarlo en n8n con ambos servidores activos y registrar los resultados visibles.
