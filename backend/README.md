# AWS IoT MQTT Monitor

The project root contains only the `backend/` and `frontend/` folders. The backend connects to AWS IoT Core with MQTT over TLS using an X.509 device certificate and private key. It exposes an HTTP API and server-sent event stream. The frontend calls that API and renders incoming messages in the dashboard.

## Configure

Edit `awsConfig.js` in this folder. Set the AWS IoT `host`, MQTT `port` (usually `8883`), certificate and private key paths, and MQTT topic filter. Put the device certificate and private key in `backend/certs/`; the default paths are already set for those files.

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

## API

- `GET /api/config` — configured host, port, and topic
- `GET /api/status` — current MQTT connection status as JSON
- `GET /api/events` — server-sent event stream with MQTT status and messages

The MQTT client and private key remain in the backend. The private key is never bundled into or sent to the browser. Keep device credentials private and use a least-privilege certificate.
