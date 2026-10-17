const allowedOrigins = (process.env.FRONTEND_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);

export default function handler(request, response) {
  const origin = request.headers.origin;
  if (!allowedOrigins.length) response.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && allowedOrigins.includes(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });

  return response.status(200).json({
    host: process.env.AWS_IOT_HOST || "",
    port: Number(process.env.AWS_IOT_PORT || 8883),
    topic: process.env.AWS_IOT_TOPIC || "",
  });
}
