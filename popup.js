const BLOCKED_DOMAINS = ["anthropic.com", "claude.ai", "claude.com"];

const pill = document.getElementById("pill");
const mode = document.getElementById("mode");
const systemProxy = document.getElementById("system-proxy");
const decision = document.getElementById("decision");
const updated = document.getElementById("updated");
const reason = document.getElementById("reason");
const refresh = document.getElementById("refresh");
const domains = document.getElementById("domains");
const proxyErrorCard = document.getElementById("proxy-error-card");
const proxyErrorText = document.getElementById("proxy-error-text");

function setPill(text, className) {
  pill.textContent = text;
  pill.className = `pill ${className}`;
}

function renderDomains() {
  domains.replaceChildren(
    ...BLOCKED_DOMAINS.map((domain) => {
      const item = document.createElement("li");
      item.textContent = domain;
      return item;
    })
  );
}

function formatTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function renderState(state) {
  if (!state || state.error) {
    setPill("Error", "pill-block");
    mode.textContent = "-";
    systemProxy.textContent = "-";
    decision.textContent = "Unknown";
    updated.textContent = "-";
    reason.textContent = state?.error || "Could not read extension state.";
    proxyErrorCard.classList.add("hidden");
    return;
  }

  const proxyMode = state.mode || "unknown";
  const blocking = Boolean(state.shouldBlock);
  const helper = state.helper || {};

  setPill(blocking ? "Blocking" : "Allowed", blocking ? "pill-block" : "pill-allow");
  mode.textContent = proxyMode;
  if (proxyMode === "system") {
    if (helper.reachable) {
      systemProxy.textContent = helper.systemProxyEnabled ? "Enabled" : "Disabled";
    } else {
      systemProxy.textContent = "Unknown (helper offline)";
    }
  } else {
    systemProxy.textContent = "Not needed";
  }
  decision.textContent = blocking ? "Blocked while direct" : "Allowed while proxied";
  updated.textContent = formatTime(state.lastSyncedAt);
  reason.textContent = state.reason || "-";

  if (state.proxyError) {
    const details = [
      state.proxyError.error || "Unknown proxy error",
      state.proxyError.fatal ? "(fatal)" : "(direct fallback possible)",
      formatTime(state.proxyError.at)
    ]
      .filter(Boolean)
      .join(" ");

    proxyErrorText.textContent = details;
    proxyErrorCard.classList.remove("hidden");
  } else {
    proxyErrorCard.classList.add("hidden");
  }
}

async function sendMessage(type) {
  return chrome.runtime.sendMessage({ type });
}

async function loadState() {
  try {
    const current = await sendMessage("get-state");
    if (current && Object.keys(current).length > 0) {
      renderState(current);
      return;
    }
  } catch (_error) {
    // Ignore and fall through to a forced refresh.
  }

  await refreshState();
}

async function refreshState() {
  setPill("Checking", "pill-idle");
  reason.textContent = "Refreshing proxy state...";

  try {
    const state = await sendMessage("refresh-state");
    renderState(state);
  } catch (error) {
    renderState({ error: String(error) });
  }
}

refresh.addEventListener("click", () => {
  void refreshState();
});

renderDomains();
void loadState();
