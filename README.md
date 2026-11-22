# Rifa 00–99 con MongoDB Atlas

Página de rifa (números del 00 al 99, ₡1.000 cada uno, premio ₡50.000) con panel de organizador.
Un solo servicio Node.js sirve la página y la API, y guarda todo en MongoDB Atlas.

## Qué hace
- Todos ven en vivo qué números están vendidos (rojo) y cuáles disponibles (verde).
- Solo el organizador (usuario y contraseña) puede marcar números y guardar nombre y teléfono del comprador.
- Los datos de compradores nunca salen en la API pública.

## 1. Preparar MongoDB Atlas
1. En Atlas, ve a **Network Access** y agrega `0.0.0.0/0` (Render no tiene IP fija).
2. Arma tu cadena de conexión (la usarás en Render, no en el código):
   `mongodb+srv://USUARIO:CONTRASENA@rifa.nigcqkv.mongodb.net/?retryWrites=true&w=majority`
   Si la contraseña tiene espacios o símbolos, escríbelos codificados (un espacio es `%20`).
   Lo más fácil es usar una contraseña sin espacios ni símbolos.

## 2. Subir a GitHub
```bash
git init
git add .
git commit -m "Rifa"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/rifa.git
git push -u origin main
```
El archivo `.gitignore` evita subir `.env` y `node_modules`. **Nunca escribas la contraseña de Mongo en el código.**

## 3. Desplegar en Render
1. En render.com: **New → Web Service** y conecta tu repositorio.
2. Configura: Runtime **Node**, Build Command `npm install`, Start Command `npm start`, plan **Free**.
3. En **Environment** agrega estas variables:

| Variable | Valor |
|---|---|
| `MONGODB_URI` | tu cadena de conexión de Atlas |
| `ADMIN_USER` | el usuario que quieras para el panel |
| `ADMIN_PASSWORD` | una contraseña larga para el panel |
| `JWT_SECRET` | una frase larga y aleatoria |
| `DB_NAME` | `rifa` (opcional) |

4. Pulsa **Create Web Service**. Al terminar, Render te da la dirección pública.
(También puedes usar el archivo `render.yaml` con **New → Blueprint**.)

Nota: en el plan gratuito Render "duerme" el servicio si nadie entra por un rato; la primera visita puede tardar unos 30 a 60 segundos.

## Probar en tu computador (opcional)
```bash
npm install
cp .env.example .env     # completa los valores
export $(grep -v '^#' .env | xargs) && npm start
```
Abre http://localhost:3000

## Seguridad
- La contraseña del organizador vive solo en variables de entorno de Render, no en la base de datos ni en el código.
- El login entrega un token firmado que dura 12 horas; el servidor bloquea tras 5 intentos fallidos por 15 minutos.
- Solo las rutas `/api/admin/*` leen o modifican datos de compradores y exigen ese token.
