import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mqtt5, iot } from "aws-iot-device-sdk-v2";
import { awsIotConfig } from "./awsConfig.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverPort = Number(process.env.DASHBOARD_PORT || 3001);
const clients = new Set();
let currentStatus = { status: "connecting", message: "Starting MQTT connection…" };

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
  if (request.url === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
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

httpServer.listen(serverPort, "127.0.0.1", () => {
  console.log(`AWS IoT dashboard service listening on http://127.0.0.1:${serverPort}`);
  if (!awsIotConfig.host || awsIotConfig.host.startsWith("xxx") || !awsIotConfig.topic) {
    publishStatus("error", "Set the AWS IoT host and topic in awsConfig.js.");
    return;
  }
  if (!awsIotConfig.certificatePath || !awsIotConfig.privateKeyPath) {
    publishStatus("error", "Set the certificate and private key file paths in awsConfig.js.");
    return;
  }

  try {
    const builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
      awsIotConfig.host,
      path.resolve(backendDirectory, awsIotConfig.certificatePath),
      path.resolve(backendDirectory, awsIotConfig.privateKeyPath),
    );
    builder.withPort(Number(awsIotConfig.port || 8883));
    builder.withConnectProperties({ clientId: `mqtt-monitor-${randomUUID()}`, keepAliveIntervalSeconds: 60 });

    const client = new mqtt5.Mqtt5Client(builder.build());
    client.on("connectionSuccess", async () => {
      publishStatus("connected", "Connected — subscribing…");
      try {
        await client.subscribe({ subscriptions: [{ qos: mqtt5.QoS.AtLeastOnce, topicFilter: awsIotConfig.topic }] });
        publishStatus("connected", "Connected and subscribed");
      } catch (error) {
        publishStatus("error", `Subscribe failed: ${error.message || error}`);
      }
    });
    client.on("connectionFailure", (event) => {
      publishStatus("error", `MQTT connection failed: ${event.error?.message || "check host, port, certificate, key, and IoT policy"}`);
    });
    client.on("disconnection", (event) => {
      publishStatus("connecting", event.error?.message || "MQTT disconnected; reconnecting…");
    });
    client.on("error", (error) => publishStatus("error", `MQTT error: ${error.message || error}`));
    client.on("messageReceived", ({ message }) => {
      const text = new TextDecoder().decode(message.payload);
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      broadcast("message", { topic: message.topicName, data, receivedAt: new Date().toISOString() });
    });
    client.start();
  } catch (error) {
    publishStatus("error", `Could not start MQTT client: ${error.message || error}`);
  }
});
