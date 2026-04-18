const BLOCKED_DOMAINS = ["anthropic.com", "claude.ai", "claude.com"];
const BLOCK_RULE_IDS = [1001, 1002, 1003];
const STATE_KEY = "proxy_guard_state";
const REFRESH_ALARM = "proxy-guard-refresh";
const ERROR_HOLD_MS = 60 * 1000;
const HELPER_URL = "http://127.0.0.1:8765/state";
const HELPER_TIMEOUT_MS = 1500;
const HELPER_STALE_MS = 5000;
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

let syncQueue = Promise.resolve();
let creatingOffscreenDocument;
let latestHelperState = null;

function buildBlockRules() {
  return BLOCKED_DOMAINS.map((domain, index) => ({
    id: BLOCK_RULE_IDS[index],
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "websocket"]
    }
  }));
}

function shouldBlockForMode(mode) {
  return mode === "direct" || mode === "auto_detect" || mode === "unknown";
}

function describeMode(mode) {
  switch (mode) {
    case "direct":
      return "direct mode";
    case "auto_detect":
      return "auto-detect mode";
    case "fixed_servers":
      return "fixed proxy mode";
    case "pac_script":
      return "PAC mode";
    case "system":
      return "system proxy mode";
    default:
      return "unknown proxy mode";
  }
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(REFRESH_ALARM);
  if (!existing) {
    await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1 });
  }
}

async function hasOffscreenDocument(path) {
  if (!chrome.runtime.getContexts) {
    return false;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument(path) {
  if (await hasOffscreenDocument(path)) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: path,
    reasons: ["WORKERS"],
    justification: "Continuously monitor the local Windows proxy helper and update blocking rules."
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function getStoredState() {
  const result = await chrome.storage.local.get(STATE_KEY);
  return result[STATE_KEY] || {};
}

async function getProxySnapshot() {
  const config = await chrome.proxy.settings.get({ incognito: false });
  return {
    mode: config?.value?.mode || "unknown",
    levelOfControl: config?.levelOfControl || "unknown"
  };
}

async function getHelperState() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HELPER_TIMEOUT_MS);

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
      helperVersion: payload.helperVersion || "",
      proxyServer: payload.proxyServer || "",
      reachable: true,
      source: payload.source || "helper",
      systemProxyEnabled: Boolean(payload.systemProxyEnabled)
    };
  } catch (error) {
    return {
      error: String(error),
      reachable: false,
      source: "helper",
      systemProxyEnabled: false
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isFreshHelperState(state) {
  if (!state?.checkedAt) {
    return false;
  }

  const checkedAt = Date.parse(state.checkedAt);
  if (Number.isNaN(checkedAt)) {
    return false;
  }

  return Date.now() - checkedAt <= HELPER_STALE_MS;
}

async function applyBlockingRules(shouldBlock) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: BLOCK_RULE_IDS,
    addRules: shouldBlock ? buildBlockRules() : []
  });
}

async function updateBadge(shouldBlock) {
  if (shouldBlock) {
    await chrome.action.setBadgeText({ text: "STOP" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b3261e" });
    return;
  }

  await chrome.action.setBadgeText({ text: "" });
}

async function syncState(context) {
  const previous = await getStoredState();
  const forcedBlockUntil = Number(previous.forcedBlockUntil || 0);
  const now = Date.now();
  const proxy = await getProxySnapshot();
  let helper = { reachable: false, skipped: true, source: "helper", checkedAt: new Date().toISOString() };

  if (proxy.mode === "system") {
    if (isFreshHelperState(latestHelperState)) {
      helper = latestHelperState;
    } else if (isFreshHelperState(previous.helper)) {
      helper = previous.helper;
      latestHelperState = previous.helper;
    } else {
      helper = await getHelperState();
      latestHelperState = helper;
    }
  }

  let shouldBlock = shouldBlockForMode(proxy.mode);
  let reason = `${describeMode(proxy.mode)} is treated as proxied`;

  if (shouldBlock) {
    reason = `${describeMode(proxy.mode)} is treated as direct`;
  }

  if (proxy.mode === "system") {
    if (helper.reachable) {
      shouldBlock = !helper.systemProxyEnabled;
      reason = helper.systemProxyEnabled
        ? "Windows system proxy is enabled via local helper"
        : "Windows system proxy is disabled via local helper";
    } else {
      shouldBlock = true;
      reason = `Chrome reports system mode but the local helper is unavailable: ${helper.error || "unknown error"}`;
    }
  }

  if (forcedBlockUntil > now) {
    shouldBlock = true;
    reason = `blocking after a proxy error until ${new Date(forcedBlockUntil).toLocaleTimeString()}`;
  }

  await applyBlockingRules(shouldBlock);
  await updateBadge(shouldBlock);

  const nextState = {
    blockedDomains: BLOCKED_DOMAINS,
    context,
    forcedBlockUntil: forcedBlockUntil > now ? forcedBlockUntil : 0,
    helper,
    lastSyncedAt: new Date().toISOString(),
    levelOfControl: proxy.levelOfControl,
    mode: proxy.mode,
    reason,
    shouldBlock
  };

  if (previous.proxyError) {
    nextState.proxyError = previous.proxyError;
  }

  await chrome.storage.local.set({ [STATE_KEY]: nextState });
  return nextState;
}

function enqueueSync(context) {
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(() => syncState(context));
  return syncQueue;
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  void ensureOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
  void enqueueSync("installed");
});

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm();
  void ensureOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
  void enqueueSync("startup");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    void ensureOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    void enqueueSync("alarm");
  }
});

chrome.proxy.settings.onChange.addListener(() => {
  void enqueueSync("proxy_change");
});

chrome.proxy.onProxyError.addListener(async (details) => {
  const previous = await getStoredState();
  const forcedBlockUntil = Date.now() + ERROR_HOLD_MS;

  await chrome.storage.local.set({
    [STATE_KEY]: {
      ...previous,
      forcedBlockUntil,
      proxyError: {
        at: new Date().toISOString(),
        details: details?.details || "",
        error: details?.error || "Unknown proxy error",
        fatal: Boolean(details?.fatal)
      }
    }
  });

  void enqueueSync("proxy_error");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "helper-state-update") {
    latestHelperState = {
      ...message.payload,
      checkedAt: message.payload?.checkedAt || new Date().toISOString()
    };
    enqueueSync("helper_update").catch(() => undefined);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "refresh-state") {
    enqueueSync("popup_refresh")
      .then((state) => sendResponse(state))
      .catch((error) => sendResponse({ error: String(error) }));
    return true;
  }

  if (message?.type === "get-state") {
    getStoredState()
      .then((state) => sendResponse(state))
      .catch((error) => sendResponse({ error: String(error) }));
    return true;
  }

  return false;
});

void ensureAlarm();
void ensureOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
void enqueueSync("service_worker_start");
