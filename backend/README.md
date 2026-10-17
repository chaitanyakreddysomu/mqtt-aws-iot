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

For a backend-only Vercel deployment, set **Root Directory** to `backend`, choose the **Node.js** preset, leave the build command empty, and deploy the functions in `api/`. Vercel exposes `api/liveview.js` as `GET /api/liveview` and `api/config.js` as `GET /api/config`. Do not use the long-running `server.js` as the Vercel entry point.

Add these variables in the Vercel project's Settings → Environment Variables. Choose **Secret** for the certificate and private key values:

- `AWS_IOT_HOST` — AWS IoT data endpoint, without `https://`
- `AWS_IOT_PORT` — `8883`
- `AWS_IOT_TOPIC` — MQTT topic filter
- `AWS_IOT_CERTIFICATE` — contents of the device certificate PEM file
- `AWS_IOT_PRIVATE_KEY` — contents of the matching private key PEM file
- `FRONTEND_ORIGIN` — the exact browser app origin, if a separate frontend will call this API

Never commit or paste the private key into frontend code. The API opens a short MQTT connection for each request, subscribes for up to five seconds, returns the latest motor values it receives, then disconnects. A separate frontend can poll `/api/liveview`; set its `VITE_API_BASE_URL` to the Vercel backend URL. The existing frontend uses this mode when that variable is set.

For a response immediately after subscribing, publish the device's latest state with MQTT's RETAIN flag and subscribe to the exact topic for that retained message. A wildcard topic filter does not deliver retained messages upon subscription in AWS IoT Core. Without retained messages, the function must wait for the next device publish; set `MQTT_CAPTURE_MS` to adjust the sample window (1000–15000 ms).

The AWS IoT certificate must be active and have a policy attached that allows the generated client IDs to connect and subscribe/receive on the configured topic. Vercel Functions have a maximum execution duration, so this short request-based connection is suitable for periodically fetching values, not for maintaining a permanent MQTT subscription.

## API

- Vercel `GET /api/config` — configured host, port, and topic
- Vercel `GET /api/liveview` — opens a short MQTT connection and returns the latest motor values received
- Local `GET /api/status` and `GET /api/events` — status and continuous event stream from `server.js`

The MQTT client and private key remain in the backend. The private key is never bundled into or sent to the browser. Keep device credentials private and use a least-privilege certificate.
