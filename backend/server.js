
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mqtt from "mqtt";
import { awsIotConfig } from "./awsConfig.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));

const serverPort = Number(
  process.env.PORT || process.env.DASHBOARD_PORT || 3001
);

const clients = new Set();

let currentStatus = {
  status: "connecting",
  message: "Starting MQTT connection…",
};

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// --------------------------------------------------
// CORS
// --------------------------------------------------

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;

  if (!allowedOrigins.length) {
    response.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }

  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// --------------------------------------------------
// SSE helpers
// --------------------------------------------------

function send(client, event, payload) {
  if (client.destroyed || client.writableEnded) {
    clients.delete(client);
    return;
  }

  client.write(
    `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  );
}

function broadcast(event, payload) {
  for (const client of clients) {
    send(client, event, payload);
  }
}

function broadcastError(message) {
  broadcast("error", {
    error: String(message || "Unknown error"),
  });
}

function publishStatus(status, message) {
  currentStatus = { status, message };
  broadcast("status", currentStatus);
}

function reportError(message) {
  const errorMessage = String(message || "Unknown error");

  console.error("[Backend Error]", errorMessage);

  publishStatus("error", errorMessage);
  broadcastError(errorMessage);
}

// --------------------------------------------------
// Certificate and private key loading
// --------------------------------------------------

function loadPemFromEnvironmentOrFile(envValue, filePath, label) {
  if (envValue && envValue.trim()) {
    const pem = envValue.replace(/\\n/g, "\n").trim() + "\n";
    return Buffer.from(pem, "utf8");
  }

  if (filePath) {
    return readFileSync(path.resolve(backendDirectory, filePath));
  }

  throw new Error(`${label} is not configured.`);
}

// --------------------------------------------------
// HTTP server and endpoints
// --------------------------------------------------

const httpServer = http.createServer((request, response) => {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`
  );

  // GET /api/events
  // Continuous Server-Sent Events stream
  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/events"
  ) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    response.write(": connected\n\n");

    clients.add(response);

    request.on("close", () => {
      clients.delete(response);
    });

    // Send current status immediately to new clients.
    send(response, "status", currentStatus);

    return;
  }

  // GET /api/config
  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/config"
  ) {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });

    response.end(
      JSON.stringify({
        host: awsIotConfig.host,
        port: awsIotConfig.port,
        topic: awsIotConfig.topic,
      })
    );

    return;
  }

  // GET /api/status
  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/status"
  ) {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });

    response.end(JSON.stringify(currentStatus));

    return;
  }

  // 404
  response.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8",
  });

  response.end(
    JSON.stringify({
      error: "Endpoint not found",
    })
  );
});

// --------------------------------------------------
// HTTP server startup
// --------------------------------------------------

httpServer.on("error", (error) => {
  console.error("[HTTP Server Error]", error.message);
});

httpServer.listen(serverPort, "0.0.0.0", () => {
  console.log(
    `AWS IoT dashboard service listening on port ${serverPort}`
  );

  if (!awsIotConfig.host || !awsIotConfig.topic) {
    reportError(
      "Set AWS_IOT_HOST and AWS_IOT_TOPIC in environment variables or awsConfig.js."
    );
    return;
  }

  let client;

  try {
    // Prefer environment-variable PEM contents.
    // Fall back to local certificate files.
    const cert = loadPemFromEnvironmentOrFile(
      awsIotConfig.certificatePem,
      awsIotConfig.certificatePath,
      "AWS IoT certificate"
    );

    const key = loadPemFromEnvironmentOrFile(
      awsIotConfig.privateKeyPem,
      awsIotConfig.privateKeyPath,
      "AWS IoT private key"
    );

    // Validate PEM headers before connecting.
    const certText = cert.toString("utf8");
    const keyText = key.toString("utf8");

    if (!certText.includes("-----BEGIN CERTIFICATE-----")) {
      throw new Error(
        "AWS IoT certificate is not in a supported PEM format."
      );
    }

    if (
      !keyText.includes("-----BEGIN PRIVATE KEY-----") &&
      !keyText.includes("-----BEGIN RSA PRIVATE KEY-----") &&
      !keyText.includes("-----BEGIN EC PRIVATE KEY-----")
    ) {
      throw new Error(
        "AWS IoT private key is not in a supported PEM format."
      );
    }

    client = mqtt.connect({
      protocol: "mqtts",
      host: awsIotConfig.host,
      port: Number(awsIotConfig.port || 8883),
      cert,
      key,
      rejectUnauthorized: true,
      clientId: `mqtt-monitor-${randomBytes(8).toString("hex")}`,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 10000,
      keepalive: 60,
    });

    // MQTT connected
    client.on("connect", () => {
      publishStatus("connected", "Connected — subscribing…");

      client.subscribe(
        awsIotConfig.topic,
        { qos: 1 },
        (error, granted) => {
          if (error) {
            reportError(
              `Subscribe failed: ${error.message || error}`
            );
            return;
          }

          const subscription = granted?.find(
            (item) => item.topic === awsIotConfig.topic
          );

          if (subscription && subscription.qos === 128) {
            reportError(
              `Subscription rejected by broker for topic: ${awsIotConfig.topic}`
            );
            return;
          }

          publishStatus(
            "connected",
            "Connected and subscribed"
          );

          console.log(
            `[MQTT] Subscribed to topic: ${awsIotConfig.topic}`
          );
        }
      );
    });

    // MQTT reconnecting
    client.on("reconnect", () => {
      publishStatus(
        "connecting",
        "MQTT disconnected; reconnecting…"
      );
    });

    // MQTT offline
    client.on("offline", () => {
      publishStatus("connecting", "MQTT client is offline");
    });

    // MQTT connection closed
    client.on("close", () => {
      publishStatus("connecting", "MQTT connection closed");
    });

    // MQTT errors
    client.on("error", (error) => {
      reportError(
        `MQTT connection error: ${error.message || error}`
      );
    });

    // Incoming MQTT messages
    client.on("message", (topic, payload) => {
      let data;

      try {
        data = JSON.parse(payload.toString("utf8"));
      } catch {
        data = payload.toString("utf8");
      }

      broadcast("message", {
        topic,
        data,
        receivedAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    reportError(
      `Could not start MQTT client: ${error.message || error}`
    );
  }
});
