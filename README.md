# mqtt-aws-iot

AWS IoT Core MQTT monitor with a separate frontend and backend.

- `backend/` connects to AWS IoT Core using mutual TLS and exposes the API and live message stream.
- `frontend/` displays the latest motor state, RPM, and temperature at `/liveview`.

For local setup, see [backend/README.md](backend/README.md). Device certificates and private keys are intentionally excluded from Git.
