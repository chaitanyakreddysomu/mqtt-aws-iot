import { readLatestMotorValues } from "../lib/mqttSnapshot.js";

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);

function cors(request, response) {
  const origin = request.headers.origin;
  if (!allowedOrigins.length) response.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && allowedOrigins.includes(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export const config = { maxDuration: 20 };

export default async function handler(request, response) {
  cors(request, response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });

  try {
    const snapshot = await readLatestMotorValues();
    return response.status(200).json(snapshot);
  } catch (error) {
    console.error("MQTT live view request failed:", error.message || error);
    return response.status(502).json({ status: "error", message: "Could not read AWS IoT telemetry. Check backend secrets, endpoint, certificate policy, and topic." });
  }
}
