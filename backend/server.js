import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mqtt from "mqtt";
import { awsIotConfig } from "./awsConfig.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverPort = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3001);
const clients = new Set();
let currentStatus = { status: "connecting", message: "Starting MQTT connection…" };
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (!allowedOrigins.length) response.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && allowedOrigins.includes(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function send(client, event, payload) {
  client.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(event, payload) {
  for (const client of clients) send(client, event, payload);
}

function publishStatus(status, message) {
  currentStatus = { status, message };
  broadcast("status", currentStatus);
}

const httpServer = http.createServer((request, response) => {
  setCorsHeaders(request, response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    response.write(": connected\n\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    send(response, "status", currentStatus);
    return;
  }

  if (request.url === "/api/config") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ host: awsIotConfig.host, port: awsIotConfig.port, topic: awsIotConfig.topic }));
    return;
  }

  if (request.url === "/api/status") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(currentStatus));
    return;
  }

  response.writeHead(404);
  response.end("Not found");
});

httpServer.listen(serverPort, "0.0.0.0", () => {
  console.log(`AWS IoT dashboard service listening on port ${serverPort}`);
  if (!awsIotConfig.host || !awsIotConfig.topic) {
    publishStatus("error", "Set the AWS IoT host and topic in awsConfig.js or environment variables.");
    return;
  }

  if (!awsIotConfig.certificatePath || !awsIotConfig.privateKeyPath) {
    publishStatus("error", "Set the certificate and private key paths in awsConfig.js.");
    return;
  }

  try {
    const cert = readFileSync(path.resolve(backendDirectory, awsIotConfig.certificatePath));
    const key = readFileSync(path.resolve(backendDirectory, awsIotConfig.privateKeyPath));
    const client = mqtt.connect({
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

    client.on("connect", () => {
      publishStatus("connected", "Connected — subscribing…");
      client.subscribe(awsIotConfig.topic, { qos: 1 }, (error) => {
        if (error) publishStatus("error", `Subscribe failed: ${error.message || error}`);
        else publishStatus("connected", "Connected and subscribed");
      });
    });
    client.on("reconnect", () => publishStatus("connecting", "MQTT disconnected; reconnecting…"));
    client.on("error", (error) => publishStatus("error", `MQTT connection error: ${error.message || error}`));
    client.on("message", (topic, payload) => {
      let data;
      try { data = JSON.parse(payload.toString("utf8")); } catch { data = payload.toString("utf8"); }
      broadcast("message", { topic, data, receivedAt: new Date().toISOString() });
    });
  } catch (error) {
    publishStatus("error", `Could not start MQTT client: ${error.message || error}`);
  }
});
