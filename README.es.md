# neighbourhood

> 🏘️ **Herramienta de transferencia de archivos LAN sin dependencias** — comparte archivos entre máquinas en la misma red al instante.

[![zh](https://img.shields.io/badge/lang-zh--CN-blue.svg)](README.md) [![en](https://img.shields.io/badge/lang-en-red.svg)](README.en.md) [![ja](https://img.shields.io/badge/lang-ja-green.svg)](README.ja.md) [![ko](https://img.shields.io/badge/lang-ko-orange.svg)](README.ko.md) [![es](https://img.shields.io/badge/lang-es-purple.svg)](README.es.md)

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![No Dependencies](https://img.shields.io/badge/dependencies-0-success)

`neighbourhood` es una herramienta ligera y autónoma para transferencia de archivos en LAN. Sin dependencias externas — solo utiliza módulos nativos de Node.js. Soporta reanudación de descargas, descarga de directorios (transmitidos como tar) y una hermosa barra de progreso.

**⚠️ Aviso de seguridad:** `neighbourhood` **no tiene autenticación ni TLS** — úsalo solo en redes de confianza. Por defecto escucha en `0.0.0.0` (todas las interfaces) y CORS está completamente abierto. Diseñado para migraciones rápidas en LAN, no para exposición pública.

---

## ✨ Funcionalidades

- **📂 Explorar archivos remotos** — listar el contenido de directorios desde otra máquina
- **⬇️ Descargar archivos** — descarga de archivos individuales con barra de progreso, velocidad y ETA
- **📁 Descargar directorios** — carpetas completas transmitidas como `.tar`
- **⏯️ Reanudación** — reanudar descargas interrumpidas mediante cabeceras HTTP Range
- **🚫 Sin dependencias** — biblioteca estándar pura de Node.js (`http`, `fs`, `path`, `os`, `stream`)
- **🌐 Optimizado para LAN** — construido para la velocidad y fiabilidad de la red local
- **🖥️ Multiplataforma** — funciona en Windows, macOS y Linux

---

## 📦 Inicio rápido

```bash
# ¡No necesitas npm install! Solo clona y ejecuta.

# Clonar el repositorio
git clone https://github.com/herdeiroeth/neighbourhood.git
cd neighbourhood

# Terminal 1: Iniciar el servidor (comparte el directorio actual)
node bin/server.js

# Terminal 2: Listar y descargar archivos
node bin/client.js localhost:3000 list /
node bin/client.js localhost:3000 get /package.json
node bin/client.js localhost:3000 get-dir /lib
```

---

## 🚀 Uso

### Servidor (máquina con los archivos)

```bash
# Compartir el directorio actual en el puerto predeterminado (3000)
node bin/server.js

# Compartir un directorio específico en un puerto personalizado
node bin/server.js /ruta/a/compartir --port 8080

# O usando la variable de entorno PORT
PORT=8080 node bin/server.js /ruta/a/compartir
```

**Salida de ejemplo:**
```
  trans-server running
  Root: /Users/me/shared-files
  Local: http://localhost:3000
  LAN:   http://192.168.1.10:3000

  On the other machine run:
    node bin/client.js 192.168.1.10:3000 list /
```

### Cliente (cualquier máquina en la LAN)

```bash
# Listar archivos (ls es un alias de list)
node bin/client.js 192.168.1.10:3000 list /
node bin/client.js 192.168.1.10:3000 ls /Documents

# Descargar un archivo individual
node bin/client.js 192.168.1.10:3000 get /photos/vacation.zip

# Descargar un directorio completo (transmitido como tar)
node bin/client.js 192.168.1.10:3000 get-dir /Documents
```

Las descargas interrumpidas dejan un archivo `.part` — al ejecutar el mismo comando `get` de nuevo, se reanuda automáticamente mediante las cabeceras HTTP Range.

---

## 📋 Endpoints de la API

Para uso avanzado o acceso desde el navegador:

| Endpoint | Método | Parámetro | Descripción |
|---|---|---|---|
| `/api/list` | GET | `path` | Listar contenido del directorio en JSON |
| `/api/stat` | GET | `path` | Obtener metadatos de archivo/directorio |
| `/api/download` | GET | `path` | Descargar archivo (soporta Range/206) |
| `/api/download-dir` | GET | `path` | Descargar directorio como archivo TAR |

---

## 🔧 Arquitectura

```
[Máquina A - origen]                      [Máquina B - destino]
  trans-server                              trans-client
  rootDir ──► HTTP :3000 ── LAN ──► list / get / get-dir
              /api/list
              /api/stat
              /api/download      (archivo, Range)
              /api/download-dir  (flujo tar)
```

### Estructura del proyecto

```
.
├── bin/
│   ├── server.js          # Punto de entrada del servidor CLI
│   └── client.js          # Punto de entrada del cliente CLI
├── lib/
│   ├── client/
│   │   ├── index.js       # Análisis de argumentos y despacho de comandos
│   │   ├── commands.js    # Implementación de list / get / get-dir
│   │   ├── progress.js    # Barra de progreso con velocidad y ETA
│   │   └── resume.js      # Gestión de archivos .part y cabeceras Range
│   ├── server/
│   │   ├── index.js       # Servidor HTTP + apagado graceful
│   │   ├── routes.js      # Manejadores de rutas API (con seguridad de ruta)
│   │   └── tar-stream.js  # Generador de TAR en streaming (formato ustar)
│   └── shared/
│       ├── protocol.js    # Constantes de puerto y endpoints
│       └── format.js      # Formateadores de tamaño, velocidad, fecha
├── package.json
├── README.md
├── README.en.md
├── README.ja.md
├── README.ko.md
├── README.es.md
├── LICENSE
└── .gitignore
```

| Capa | Ruta | Rol |
|---|---|---|
| CLI | `bin/` | Puntos de entrada ejecutables |
| Servidor | `lib/server/` | HTTP, enrutamiento, generación TAR |
| Cliente | `lib/client/` | Comandos, progreso, lógica de reanudación |
| Compartido | `lib/shared/` | Constantes de protocolo, utilidades de formato |

**Stack tecnológico:**
- **Entorno:** Node.js ≥ 18 (ES modules)
- **Dependencias:** Cero (solo biblioteca estándar)
- **Protocolo:** HTTP/1.x plano (sin TLS)

---

## 🧪 Validación manual

1. Inicia el servidor apuntando a un directorio de prueba
2. `list /` — verifica nombres, tipos y tamaños
3. `get` un archivo pequeño, luego uno grande — prueba interrupción + reanudación
4. `get-dir` — verifica la extracción local
5. Intenta `../` para path traversal — debe devolver 403 Forbidden
6. Pulsa Ctrl+C en el servidor — verifica el mensaje de apagado graceful

---

## ⚠️ Seguridad y limitaciones

Esta herramienta está **deliberadamente permisiva** para migración en LAN:

| Aspecto | Comportamiento actual | Riesgo |
|---|---|---|
| Autenticación | Ninguna | Cualquier máquina que alcance el puerto puede listar y descargar |
| TLS | Ninguno | El tráfico viaja en texto plano por la red |
| Bind | `0.0.0.0` | Escucha en todas las interfaces |
| CORS | `Access-Control-Allow-Origin: *` | Permite acceso desde el navegador en la LAN |
| Seguridad de ruta | `safePath` limita a `rootDir` | Mitiga path traversal básico |
| Extracción tar | Limpia `..` en nombres de archivo | Reduce riesgos tipo zip-slip |

**Recomendaciones de uso:**
1. Usa solo en **redes locales de confianza** (o túneles aislados)
2. **No** expongas el puerto en routers, WAN o VPN abiertas sin autenticación adicional
3. Apunta `rootDir` solo al directorio que realmente necesitas migrar
4. Detén el servidor tan pronto como se complete la transferencia

**Limitaciones conocidas:**
- Sin autenticación, autorización de usuarios ni auditoría de acceso
- Sin HTTPS/TLS — solo HTTP plano
- La implementación TAR es ustar simplificada: nombres de archivo > 100 caracteres se truncan
- `get-dir` **no soporta** reanudación (solo `get` de archivo individual)
- Sin pruebas automatizadas, CI ni scripts de lint
- Sin límite de velocidad, tamaño ni control de concurrencia
- La compatibilidad con Windows tiene soluciones para Git Bash, pero no hay matriz de pruebas multiplataforma

---

## 📄 Licencia

MIT © [herdeiroeth](https://github.com/herdeiroeth)

---

<p align="center">Hecho con ❤️ y cero <code>node_modules</code></p>
