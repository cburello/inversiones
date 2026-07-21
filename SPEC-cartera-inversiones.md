# Cartera de Inversiones - Especificación para Claude Code

Aplicación web (React/Vite + Supabase + Vercel, PWA) para seguimiento personal de inversiones: acciones, CEDEARs, bonos, obligaciones negociables y FCI. Multi-usuario con login. Reemplaza una planilla Excel de carga manual.

## Contexto del desarrollador

- Windows, terminal PowerShell.
- Patrón ya probado en otro proyecto (React/Vite + Supabase + Vercel, PWA con bottom nav en móvil y layout completo en desktop).
- Preferencias de trabajo: mostrar mockup o propuesta de pantalla antes de codificar; ediciones quirúrgicas sobre archivos existentes en lugar de reescrituras completas.

## Alcance de la versión 1

Lo que SÍ hace:
1. Login multi-usuario (Supabase Auth, email y contraseña). Cada usuario ve solo sus datos (RLS).
2. Registrar compras y ventas de especies, por lote (misma especie en distintas fechas = registros separados).
3. Registrar cobros de renta, amortización y dividendos (registro simple, sin vincular a reinversiones).
4. Registrar movimientos de caja (depósitos y extracciones) en pesos o dólares.
5. Incluir FCI como tipo de instrumento (cuotaparte cargada a mano, sin API).
6. Obtener cotizaciones automáticamente desde APIs gratuitas y cachearlas.
7. Dashboard con tenencia actual, valuación, resultado no realizado por especie y consolidado, en ARS y en USD MEP.

Lo que NO hace (futuras versiones):
- Vincular ventas con reinversiones o extracciones.
- Cálculo de resultado realizado con método FIFO/PPP.
- Proyección de flujo de cupones de ONs.
- Alertas o notificaciones.

## Moneda

- Cada operación y movimiento registra su moneda de origen: ARS o USD.
- La app muestra valuaciones en ambas monedas usando el TC MEP del día (dolarapi).
- Para operaciones en ARS que se quieran expresar en USD histórico, se guarda opcionalmente el TC MEP de la fecha de operación.

## Modelo de datos (Supabase / PostgreSQL)

### especies (catálogo compartido entre usuarios)

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| ticker | varchar not null | ej. AAPL, AL30, IRCPO. Único junto con tipo |
| nombre | varchar | descripción |
| tipo | varchar not null | 'accion', 'cedear', 'bono', 'on', 'fci' |
| moneda_cotizacion | varchar not null | 'ARS' o 'USD' |
| factor_cotizacion | numeric default 1 | 100 para bonos y ONs (cotizan cada 100 nominales), 1 para el resto |
| vencimiento | date null | bonos y ONs |
| tasa | numeric null | tasa cupón anual, bonos y ONs |
| ley | varchar null | 'AR' o 'NY', para ONs |
| meses_pago | varchar null | ej. 'MAR-SEP', informativo |
| creado_por | uuid null | referencia a auth.users |

RLS: lectura para todo usuario autenticado; alta permitida a cualquier usuario autenticado (si el ticker no existe, lo crea y queda disponible para todos); modificación solo por creado_por.

### operaciones (compras y ventas, por usuario)

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| user_id | uuid not null | auth.users, default auth.uid() |
| especie_id | uuid not null | FK especies |
| tipo_operacion | varchar not null | 'compra' o 'venta' |
| fecha | date not null | |
| cantidad | numeric not null | siempre positiva; el signo lo da tipo_operacion. Nominales en bonos/ONs, cuotapartes en FCI |
| monto | numeric not null | total operado, siempre positivo |
| moneda | varchar not null | 'ARS' o 'USD' |
| tc_mep | numeric null | TC del día si moneda = ARS y se quiere USD histórico |
| broker | varchar null | ej. 'INVIU', 'GALICIA' |
| notas | text null | |

RLS: select/insert/update/delete solo donde user_id = auth.uid().

### cobros (renta, amortización, dividendos, por usuario)

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| user_id | uuid not null | |
| especie_id | uuid not null | FK especies |
| tipo | varchar not null | 'renta', 'amortizacion', 'dividendo' |
| fecha | date not null | |
| monto | numeric not null | |
| moneda | varchar not null | 'ARS' o 'USD' |
| notas | text null | |

Nota: una amortización reduce el capital, pero en v1 NO ajusta automáticamente la cantidad de nominales; si el usuario quiere reflejarla en tenencia, registra una venta. Documentar esto en la UI con un texto de ayuda.

RLS: igual que operaciones.

### movimientos_caja (por usuario)

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| user_id | uuid not null | |
| tipo | varchar not null | 'deposito' o 'extraccion' |
| fecha | date not null | |
| monto | numeric not null | positivo |
| moneda | varchar not null | 'ARS' o 'USD' |
| broker | varchar null | |
| notas | text null | ej. 'DESDE GALICIA' |

RLS: igual que operaciones.

### cotizaciones (cache compartido)

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| especie_id | uuid not null | FK especies |
| fecha | date not null | |
| precio | numeric not null | por unidad de cotización (bonos/ONs: cada 100 nominales) |
| moneda | varchar not null | |
| fuente | varchar | 'data912', 'manual', etc. |

Único por (especie_id, fecha, fuente). Lectura para todos; insert para autenticados (necesario para carga manual de cuotapartes de FCI).

### tipo_cambio (compartido)

| Campo | Tipo | Nota |
|---|---|---|
| fecha | date PK | |
| mep | numeric | |
| ccl | numeric | |
| oficial | numeric | |
| fuente | varchar | 'dolarapi' |

## Cálculos clave

- Tenencia actual por especie = suma(cantidad de compras) - suma(cantidad de ventas).
- Valuación = tenencia * ultimo_precio / factor_cotizacion, en la moneda de cotización; conversión ARS/USD por MEP del día.
- Costo de la posición = suma de montos de compras de los lotes vigentes (v1 simple: costo total de compras - costo total de ventas a valor de compra promedio; documentar la simplificación).
- Resultado no realizado = valuación - costo, en % y absoluto, por especie y consolidado.
- Cobros acumulados por especie (renta + amortización + dividendos) como columna informativa.
- Total invertido de caja = depósitos - extracciones, por moneda.

## APIs de precios

1. data912.com (sin autenticación):
   - /live/arg_stocks (acciones locales), /live/arg_cedears, /live/arg_bonds (soberanos), /live/arg_corp (ONs), /live/arg_notes (letras).
   - Verificar los endpoints exactos al implementar; si la estructura cambió, ajustar el cliente.
2. dolarapi.com (sin autenticación): /v1/dolares/bolsa (MEP), /v1/dolares/contadoconliqui (CCL), /v1/dolares/oficial.
3. FCI: sin API en v1, precio de cuotaparte por carga manual (fuente = 'manual').

Estrategia: al abrir el dashboard, la app consulta las APIs, actualiza la tabla cotizaciones (upsert por especie y fecha) y valúa. Si la API falla, usa el último precio cacheado e indica la fecha del dato. Los precios gratuitos tienen demora de 15-20 minutos; es aceptable, es seguimiento personal, no trading.

## Pantallas (mostrar mockup antes de codificar cada una)

1. Login / registro.
2. Dashboard: valuación total en ARS y USD MEP, resultado consolidado, tabla o cards por especie (tenencia, precio, valuación, resultado $ y %). Desktop: tabla; móvil: cards.
3. Operaciones: listado con filtros (especie, tipo, fechas), alta de compra/venta con formulario paso a paso en móvil.
4. Cobros: listado y alta (renta / amortización / dividendo).
5. Caja: listado de depósitos/extracciones y alta, con saldos por moneda.
6. Especies: catálogo, alta de especie nueva (con validación de ticker contra la API cuando el tipo lo permita).
7. Detalle de especie: lotes, cobros, gráfico simple de precio (histórico de la tabla cotizaciones).

PWA: manifest, íconos, bottom nav en móvil (Dashboard, Operaciones, Caja, Más). Deploy en Vercel.

## Importación inicial del Excel

Archivo del usuario: Tenencias-208077 (hojas ON-BONOS, CEDEAR, FCI - GALICIA, MOVIMIENTOS). Escribir un script de importación (Node) que el usuario corre una vez. Consideraciones detectadas al analizar el archivo:

- Las fechas están como número serial de Excel (ej. 46023). Convertir: fecha = 1899-12-30 + serial días.
- Hoja ON-BONOS: columnas ticker, broker, nombre, vencimiento (serial), tasa, cantidad (nominales), ley, invertido en USD. Filas de subtotal y notas al pie: ignorarlas. Hay un ticker dudoso anotado "PNZCO (PNDCO??)" (ON Pan American Energy): validarlo contra la API antes de importar y preguntar al usuario cuál es el correcto.
- Hoja CEDEAR: lotes múltiples por ticker (compras separadas). Filas con monto negativo son ventas (PBR, SPY, TSLA, QQQ): importarlas como tipo_operacion = 'venta' con monto positivo. Notas tipo "Comprado con Dolares" o "Comprado con Pesos" definen la moneda del lote; si no dice nada, asumir USD y marcar en notas para revisión.
- Hoja FCI - GALICIA: movimientos de suscripción/rescate por fecha y monto en USD. Crear especies tipo 'fci' (RENTA FIJA DOLARES, MIX DOLARES, ADCAP AHORRO PESOS) e importar como operaciones.
- Hoja MOVIMIENTOS: depósitos en pesos y dólares con fecha serial. Importar a movimientos_caja.
- Cargar catálogo de especies con los datos de la planilla (vencimiento, tasa, ley, meses de pago para ONs; factor_cotizacion = 100 en bonos y ONs).
- El script debe ser idempotente o al menos avisar si ya hay datos, para no duplicar.

## Orden de trabajo sugerido

1. Crear proyecto Vite + React, estructura base, Supabase client, Auth con pantalla de login.
2. Migración SQL: tablas, índices, RLS. Probar con un usuario de prueba.
3. Script de importación del Excel. Validar totales contra la planilla (subtotal ONs aprox 30.382 USD invertidos, CEDEARs aprox 14.109 USD).
4. Cliente de APIs (data912 + dolarapi) con cache en cotizaciones y tipo_cambio.
5. Dashboard con valuación.
6. CRUD de operaciones, cobros, caja y especies.
7. Detalle de especie y gráfico.
8. PWA + deploy en Vercel.

## Convenciones

- Código y UI en español (rioplatense neutro, sin voseo en labels).
- Montos con separador de miles punto y decimal coma en la UI (formato es-AR).
- No usar rayas largas en textos; guiones simples y comillas rectas.
- Commits chicos por etapa.
