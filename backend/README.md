# AWS IoT MQTT Monitor

The project root contains only the `backend/` and `frontend/` folders. The backend connects to AWS IoT Core with MQTT over TLS using an X.509 device certificate and private key. It exposes an HTTP API and server-sent event stream. The frontend calls that API and renders incoming messages in the dashboard.

## Configure

For local use, edit `awsConfig.js` in this folder or set `AWS_IOT_HOST`, `AWS_IOT_PORT`, `AWS_IOT_TOPIC`, `AWS_IOT_CERTIFICATE_PATH`, and `AWS_IOT_PRIVATE_KEY_PATH`. The default certificate paths point to files in `backend/certs/`.

The certificate must be registered and active in AWS IoT Core. Its attached IoT policy must allow `iot:Connect`, `iot:Subscribe`, and `iot:Receive` for the client ID, topic filter, and topic resources used by the app.

## Install and run

Open two terminals from the project root.

In the first terminal:

```powershell
cd backend
npm install
npm start
```

In the second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local address printed by Vite. During development, Vite proxies `/api/*` requests to the backend on port `3001`.

The motor dashboard is available at `/liveview`. It shows the latest received values for motor state, RPM, and temperature without keeping a history on that page.

## Deploying the frontend to Vercel

Deploy this repository as a Vercel project with **Root Directory** set to `frontend`, build command `npm run build`, and output directory `dist`. Set the frontend environment variable `VITE_API_BASE_URL` to the public base URL of the separately hosted backend, with no trailing slash (for example, `https://mqtt-api.example.com`). `frontend/.env.example` shows the variable name for local reference.

Run the backend as an always-on Node.js service on a host that supports a persistent MQTT connection and SSE. Do not deploy `server.js` as a Vercel Function: the MQTT subscription is long-lived, while Vercel Functions have a maximum execution duration. Store the device certificate and private key as private secret files on the backend host, then set `AWS_IOT_CERTIFICATE_PATH` and `AWS_IOT_PRIVATE_KEY_PATH` to their mounted paths. Also set `AWS_IOT_HOST`, `AWS_IOT_PORT` (`8883`), `AWS_IOT_TOPIC`, and `FRONTEND_ORIGIN` to the Vercel site's exact origin. The server reads the hosting provider's `PORT` automatically.

Never add the `.crt` or `.key` files to Git or to the Vercel frontend project. The frontend only needs the public backend URL; AWS device credentials must stay on the backend.

## API

- `GET /api/config` — configured host, port, and topic
- `GET /api/status` — current MQTT connection status as JSON
- `GET /api/events` — server-sent event stream with MQTT status and messages

The MQTT client and private key remain in the backend. The private key is never bundled into or sent to the browser. Keep device credentials private and use a least-privilege certificate.
