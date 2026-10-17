import mqtt from "mqtt";

function getPem(rawName, base64Name) {
  if (process.env[base64Name]) return Buffer.from(process.env[base64Name], "base64");
  const value = process.env[rawName];
  return value ? Buffer.from(value.replace(/\\n/g, "\n")) : undefined;
}

function extractMotorValues(payload) {
  let data;
  try {
    data = JSON.parse(payload.toString("utf8"));
  } catch {
    return {};
  }

  const values = {};
  const aliases = { motor_state: "state", motor_rpm: "rpm", motor_temperature: "temperature" };
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      for (const [suffix, name] of Object.entries(aliases)) {
        if (normalized === suffix || normalized.endsWith(suffix)) values[name] = child;
      }
      visit(child);
    }
  }
  visit(data);
  return values;
}

export function readLatestMotorValues() {
  const host = process.env.AWS_IOT_HOST;
  const port = Number(process.env.AWS_IOT_PORT || 8883);
  const topic = process.env.AWS_IOT_TOPIC;
  const cert = getPem("AWS_IOT_CERTIFICATE", "AWS_IOT_CERTIFICATE_BASE64");
  const key = getPem("AWS_IOT_PRIVATE_KEY", "AWS_IOT_PRIVATE_KEY_BASE64");

  if (!host || !topic || !cert || !key) {
    throw new Error("Configure AWS_IOT_HOST, AWS_IOT_TOPIC, and the certificate/private-key secret variables.");
  }

  const captureMs = Math.min(Math.max(Number(process.env.MQTT_CAPTURE_MS || 5000), 1000), 15000);
  const client = mqtt.connect({
    protocol: "mqtts",
    host,
    port,
    cert,
    key,
    rejectUnauthorized: true,
    clientId: `vercel-motor-${Math.random().toString(16).slice(2, 18)}`,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 0,
    keepalive: 15,
  });

  return new Promise((resolve, reject) => {
    const values = {};
    let connected = false;
    let receivedAt = null;
    let settled = false;
    const timer = setTimeout(() => finish(), captureMs);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end(true);
      if (error) return reject(error);
      const hasValues = Object.keys(values).length > 0;
      resolve({
        status: connected ? "connected" : "no-data",
        message: !connected ? "Timed out before connecting to AWS IoT" : hasValues ? "Latest MQTT values sampled" : "Connected, but no telemetry arrived during the sample window",
        values,
        receivedAt,
      });
    }

    client.once("connect", () => {
      connected = true;
      client.subscribe(topic, { qos: 1 }, (error) => {
        if (error) finish(error);
      });
    });
    client.on("message", (_topic, payload) => {
      Object.assign(values, extractMotorValues(payload));
      receivedAt = new Date().toISOString();
      if (values.state !== undefined && values.rpm !== undefined && values.temperature !== undefined) finish();
    });
    client.on("error", finish);
  });
}
