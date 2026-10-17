
import "./style.css";

const isLiveView =
  window.location.pathname.replace(/\/+$/, "") === "/liveview";

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://mqtt-aws-iot.onrender.com"
).replace(/\/+$/, "");

const apiUrl = (path) => `${apiBaseUrl}${path}`;

let totalMessages = 0;
let events = null;

// Build the live-view page.
if (isLiveView) {
  document.body.classList.add("liveview-page");

  document.querySelector(".shell").innerHTML = `
    <header class="topbar live-topbar">
      <a class="brand" href="/" aria-label="AWS IoT Monitor home">
        <span class="brand-mark">⌁</span>
        <span>AutoSol <b>EDGE MONITORING SYSTEM</b></span>
      </a>
      <div class="topbar-actions">
        <div class="live-connection">
          <span></span>
          <span id="live-status">Connecting to MQTT</span>
        </div>
        <a class="live-view-link" href="/">Back to monitor</a>
      </div>
    </header>

    <main class="live-main">
      <div class="live-breadcrumb">
        FACTORY 01 <span>/</span> PRODUCTION LINE 01
      </div>

      <section class="live-heading">
        <div>
          <h1>Motor <span>Overview</span></h1>
          <p>Real-time operating conditions and telemetry</p>
        </div>
        <div class="asset-card">
          <span class="asset-icon">ϟ</span>
          <span>
            <small>ASSET IDENTIFIER</small>
            <strong>MOTOR-01</strong>
          </span>
          <b id="state-chip">—</b>
        </div>
      </section>

      <section class="metric-grid" aria-label="Latest motor telemetry">
        <article class="metric-card temperature-card">
          <div class="metric-label">
            TEMPERATURE <span class="metric-icon">♨</span>
          </div>
          <div class="metric-value">
            <span id="temperature-value">—</span><small>°C</small>
          </div>
          <p><i></i> Motor casing</p>
          <div class="metric-footnote" id="temperature-updated">
            Waiting for telemetry
          </div>
        </article>

        <article class="metric-card rpm-card">
          <div class="metric-label">
            MOTOR RPM <span class="metric-icon">◴</span>
          </div>
          <div class="metric-value">
            <span id="rpm-value">—</span><small>RPM</small>
          </div>
          <p><i></i> Revolutions per minute</p>
          <div class="metric-footnote" id="rpm-updated">
            Waiting for telemetry
          </div>
        </article>

        <article class="metric-card state-card">
          <div class="metric-label">
            MOTOR STATE <span class="metric-icon">⌁</span>
          </div>
          <div class="state-value">
            <span class="state-symbol">◉</span>
            <strong id="motor-state-value">—</strong>
          </div>
          <p><i></i> State code from PLC</p>
          <div class="metric-footnote" id="state-updated">
            Waiting for telemetry
          </div>
        </article>
      </section>

      <section class="live-bottom">
        <div class="live-info-card">
          <small>SIGNAL SOURCE</small>
          <h2>Data connection</h2>
          <div class="broker-row">
            <span class="connection-light"></span>
            <span>
              <strong>MQTT Broker</strong>
              <small id="live-topic">Loading topic…</small>
            </span>
            <b id="broker-status">Connecting</b>
          </div>
          <div class="live-info-footer">
            Live MQTT stream <span id="latest-time">Waiting for data</span>
          </div>
        </div>

        <div class="live-info-card latest-card">
          <small>LATEST TELEMETRY</small>
          <h2>Most recent update</h2>
          <p id="latest-summary">Waiting for a motor data message…</p>
          <div class="live-info-footer">
            Latest values only <span>Auto refresh enabled</span>
          </div>
        </div>
      </section>

      <div class="notice" id="live-notice" role="alert" hidden></div>
    </main>

    <footer class="page-footer">
      AWS IoT Core <span>·</span> MQTT over TLS
    </footer>
  `;
} else {
  // Clear the main message feed.
  document.querySelector("#clear-button")?.addEventListener("click", () => {
    const messageList = document.querySelector("#message-list");
    if (!messageList) return;

    messageList.replaceChildren();
    totalMessages = 0;

    const count = document.querySelector("#message-count");
    const summary = document.querySelector("#feed-summary");

    if (count) count.textContent = "0";
    if (summary) {
      summary.textContent = "Messages will appear here in real time.";
    }

    const state = document.createElement("div");
    state.className = "empty-state";
    state.innerHTML = `
      <div class="empty-icon">⌁</div>
      <strong>Feed cleared</strong>
      <p>New messages will appear here when received.</p>
    `;

    messageList.append(state);
  });
}

// Load the configured MQTT topic.
async function loadConfig() {
  try {
    const response = await fetch(apiUrl("/api/config"));

    if (!response.ok) {
      throw new Error(`Config request failed: ${response.status}`);
    }

    const config = await response.json();

    const topic = document.querySelector(
      isLiveView ? "#live-topic" : "#topic-value"
    );

    if (topic) {
      topic.textContent = config.topic || "Not configured";
    }
  } catch (error) {
    console.error("Failed to load backend config:", error);

    const topic = document.querySelector(
      isLiveView ? "#live-topic" : "#topic-value"
    );

    if (topic) topic.textContent = "Dashboard service unavailable";
  }
}

loadConfig();

// Update connection indicators.
function setConnectionStatus(status, message) {
  const pill = document.querySelector("#status-pill");
  const statusText = document.querySelector("#status-text");

  if (pill) {
    pill.className = `status-pill ${status}`;

    if (statusText) {
      statusText.textContent = message || status;
    }
  }

  const liveStatus = document.querySelector("#live-status");

  if (liveStatus) {
    liveStatus.textContent = message || status;
    liveStatus.className = status;

    const brokerStatus = document.querySelector("#broker-status");
    if (brokerStatus) {
      brokerStatus.textContent =
        status === "connected"
          ? "Connected"
          : status === "error"
            ? "Connection issue"
            : "Connecting";
    }

    const notice = document.querySelector("#live-notice");

    if (notice) {
      if (status === "error") {
        notice.textContent = message || "Connection error";
        notice.hidden = false;
      } else {
        notice.hidden = true;
      }
    }
  } else {
    const notice = document.querySelector("#notice");

    if (notice) {
      notice.textContent = message || "Connection error";
      notice.hidden = status !== "error";
    }
  }
}

// Add an MQTT message to the main feed.
function addFeedMessage(message) {
  const messageList = document.querySelector("#message-list");
  if (!messageList) return;

  document.querySelector("#empty-state")?.remove();

  totalMessages += 1;

  const count = document.querySelector("#message-count");
  const summary = document.querySelector("#feed-summary");

  if (count) count.textContent = totalMessages.toLocaleString();

  if (summary) {
    summary.textContent =
      `${totalMessages.toLocaleString()} message` +
      `${totalMessages === 1 ? "" : "s"} received this session`;
  }

  const card = document.createElement("article");
  card.className = "message-card";

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const topic = document.createElement("span");
  topic.className = "message-topic";
  topic.textContent = message.topic || "Unknown topic";

  const time = document.createElement("time");
  const receivedAt = message.receivedAt || new Date().toISOString();

  time.dateTime = receivedAt;

  const parsedTime = new Date(receivedAt);
  time.textContent = Number.isNaN(parsedTime.getTime())
    ? new Date().toLocaleTimeString()
    : parsedTime.toLocaleTimeString();

  meta.append(topic, time);

  const body = document.createElement("pre");
  body.className = "message-body";

  body.textContent =
    typeof message.data === "string"
      ? message.data
      : JSON.stringify(message.data, null, 2);

  card.append(meta, body);
  messageList.prepend(card);
}

// Find motor values even if they are nested in the payload.
function extractMotorValues(payload) {
  let data = payload;

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return {};
    }
  }

  const result = {};

  const keyMap = {
    motor_state: "state",
    motor_rpm: "rpm",
    motor_temperature: "temperature",
  };

  function walk(value) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");

      for (const [suffix, metric] of Object.entries(keyMap)) {
        if (normalized === suffix || normalized.endsWith(suffix)) {
          result[metric] = child;
        }
      }

      walk(child);
    }
  }

  walk(data);
  return result;
}

// Update the motor dashboard with received values.
function updateLiveValues(values, receivedAt) {
  if (!values || !Object.keys(values).length) return;

  const parsedTime = new Date(receivedAt || Date.now());

  const timeLabel = Number.isNaN(parsedTime.getTime())
    ? new Date().toLocaleTimeString()
    : parsedTime.toLocaleTimeString();

  const formatValue = (value) =>
    value === null || value === undefined ? "—" : String(value);

  if (Object.hasOwn(values, "state")) {
    const value = formatValue(values.state);

    document.querySelector("#motor-state-value").textContent = value;
    document.querySelector("#state-chip").textContent = value;
    document.querySelector("#state-updated").textContent =
      `Updated ${timeLabel}`;
  }

  if (Object.hasOwn(values, "rpm")) {
    document.querySelector("#rpm-value").textContent =
      formatValue(values.rpm);

    document.querySelector("#rpm-updated").textContent =
      `Updated ${timeLabel}`;
  }

  if (Object.hasOwn(values, "temperature")) {
    document.querySelector("#temperature-value").textContent =
      formatValue(values.temperature);

    document.querySelector("#temperature-updated").textContent =
      `Updated ${timeLabel}`;
  }

  const parts = [];

  if (Object.hasOwn(values, "temperature")) {
    parts.push(`${formatValue(values.temperature)}°C`);
  }

  if (Object.hasOwn(values, "rpm")) {
    parts.push(`${formatValue(values.rpm)} RPM`);
  }

  if (Object.hasOwn(values, "state")) {
    parts.push(`State ${formatValue(values.state)}`);
  }

  if (parts.length) {
    document.querySelector("#latest-summary").textContent =
      parts.join(" · ");
  }

  document.querySelector("#latest-time").textContent = timeLabel;
}

// Handle incoming messages on the live-view page.
function addLiveViewMessage(message) {
  const values = extractMotorValues(message.data);

  if (Object.keys(values).length) {
    updateLiveValues(values, message.receivedAt);
  } else {
    console.debug(
      "MQTT message received, but no recognized motor fields were found:",
      message.data
    );
  }
}

// Connect to the Render backend's Server-Sent Events endpoint.
// Do not use fetch().json() for /api/events because it is an SSE stream.
events = new EventSource(apiUrl("/api/events"));

events.addEventListener("open", () => {
  console.log("Connected to Render SSE endpoint");
});

events.addEventListener("status", (event) => {
  try {
    const { status, message } = JSON.parse(event.data);

    setConnectionStatus(status, message);

    console.log("MQTT status:", status, message);
  } catch (error) {
    console.error("Invalid status event:", error);
  }
});

events.addEventListener("message", (event) => {
  try {
    const message = JSON.parse(event.data);

    console.log("MQTT message received:", message);

    if (isLiveView) {
      addLiveViewMessage(message);
    } else {
      addFeedMessage(message);
    }
  } catch (error) {
    console.error("Invalid MQTT message event:", error, event.data);
  }
});

events.addEventListener("error", (event) => {
  // Custom backend SSE error events may include JSON data.
  if (event.data) {
    try {
      const data = JSON.parse(event.data);

      setConnectionStatus(
        "error",
        data.message || data.error || "Backend error"
      );

      console.error("Backend SSE error:", data);
    } catch {
      console.error("Backend SSE error event:", event.data);
    }
  }
});

events.onerror = () => {
  // EventSource automatically attempts to reconnect.
  setConnectionStatus(
    "connecting",
    "Connection interrupted. Reconnecting…"
  );

  console.error("SSE connection interrupted; retrying automatically");
};
