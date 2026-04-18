const HELPER_URL = "http://127.0.0.1:8765/state";
const POLL_INTERVAL_MS = 2000;
const FETCH_TIMEOUT_MS = 1200;

let lastSignature = "";

async function fetchHelperState() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(HELPER_URL, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return {
      autoConfigUrl: payload.autoConfigUrl || "",
      checkedAt: new Date().toISOString(),
      error: "",
      helperVersion: payload.helperVersion || "",
      proxyServer: payload.proxyServer || "",
      reachable: true,
      source: payload.source || "helper",
      systemProxyEnabled: Boolean(payload.systemProxyEnabled)
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      error: String(error),
      reachable: false,
      source: "helper",
      systemProxyEnabled: false
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function signatureForState(state) {
  return JSON.stringify({
    autoConfigUrl: state.autoConfigUrl || "",
    error: state.error || "",
    proxyServer: state.proxyServer || "",
    reachable: Boolean(state.reachable),
    systemProxyEnabled: Boolean(state.systemProxyEnabled)
  });
}

async function publishState(force = false) {
  const state = await fetchHelperState();
  const signature = signatureForState(state);

  if (!force && signature === lastSignature) {
    return;
  }

  lastSignature = signature;
  try {
    await chrome.runtime.sendMessage({
      type: "helper-state-update",
      payload: state
    });
  } catch (_error) {
    // Ignore send failures; the service worker may be asleep and will wake on the next message.
  }
}

void publishState(true);
setInterval(() => {
  void publishState(false);
}, POLL_INTERVAL_MS);
