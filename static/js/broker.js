// Shared VanJS broker + reactive synced state, used by the static (build-free)
// controllers. Mirrors src/lib/broker.svelte.js + the transport classes, but
// built on VanJS state instead of Svelte 5 $state.
//
// Transport precedence (set in connect()): ws > mqtt > put > gun > broadcast.
// gun + mqtt are loaded on demand from a CDN.

import van from "./van.js";

const GLOBAL_SOURCES = {
  // local gun first (same dir as broker.js), then public CDN fallback.
  // Resolved against broker.js via import.meta.url so it works from pages at any depth.
  gun:  [new URL("./gun.min.js", import.meta.url).href, "https://cdn.jsdelivr.net/npm/gun/gun.js"],
  mqtt: ["https://cdn.jsdelivr.net/npm/mqtt@5/dist/mqtt.min.js"],
};
const _loadedScripts = {};
function loadScript(url) {
  return _loadedScripts[url] || (_loadedScripts[url] = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("script load failed: " + url));
    document.head.appendChild(el);
  }));
}
async function ensureGlobal(name, urls) {
  if (window[name]) return window[name];
  for (const url of (Array.isArray(urls) ? urls : [urls])) {
    try { await loadScript(url); } catch { /* try next source */ }
    if (window[name]) return window[name];
  }
  throw new Error("could not load global: " + name);
}

class WebsocketBroker {
  constructor(o) {
    this.socket = new WebSocket(o.ws + o.path);
    this.socket.addEventListener("open", () => o.status?.("connected"));
    this.socket.addEventListener("close", () => o.status?.("disconnected"));
    this.socket.addEventListener("error", () => o.status?.("disconnected"));
    if (o.update) this.socket.addEventListener("message", (e) => {
      for (const [k, v] of Object.entries(JSON.parse(e.data))) o.update(k, v);
    });
  }
  send(k, v) { this.socket.send(JSON.stringify({ [k]: v })); }
}

class BroadcastBroker {
  constructor(o) {
    this.channel = new BroadcastChannel(o.broadcast);
    if (o.update) this.channel.onmessage = (e) => {
      for (const [k, v] of Object.entries(e.data)) o.update(k, v);
    };
    o.status?.("connected");
  }
  send(k, v) { this.channel.postMessage({ [k]: v }); }
}

class PutBroker {
  constructor(o) { this.prefix = o.put; o.status?.("connected"); }
  send(k, v) {
    if (typeof v === "number") v = String(v);
    else if (typeof v !== "string") v = JSON.stringify(v);
    fetch(this.prefix + k + ".txt", { method: "PUT", headers: { "Content-Type": "text/plain" }, body: v });
  }
}

class GunBroker {
  constructor(o) {
    let root = window.Gun([o.gun]);
    for (const part of o.path.split("/")) if (part) root = root.get(part);
    this.root = root;
    if (o.update) this.root.map((data, key) => o.update(key, data));
    // Track reachable peers via the gun mesh events so the connection
    // indicator reflects real relay connectivity.
    let peers = 0;
    root.on("hi", () => { peers++; o.status?.("connected"); });
    root.on("bye", () => { peers = Math.max(0, peers - 1); if (peers === 0) o.status?.("disconnected"); });
  }
  send(k, v) { this.root.get(k).put(v); }
}

class MqttBroker {
  constructor(o) {
    this.options = o;
    if (!o.path.endsWith("/")) o.path += "/";
    this.client = window.mqtt.connect(o.mqtt);
    this.client.on("connect", () => o.status?.("connected"));
    this.client.on("close", () => o.status?.("disconnected"));
    this.client.on("offline", () => o.status?.("disconnected"));
    if (o.update) {
      this.client.subscribe(o.path + "+");
      this.client.on("message", (topic, message) => {
        if (!topic.startsWith(o.path)) return;
        o.update(topic.slice(o.path.length), JSON.parse(message.toString()));
      });
    }
  }
  send(k, v) { this.client.publish(this.options.path + k, JSON.stringify(v), { retain: true }); }
}

/* Reactive synced state: one van.state per key; getters/setters broadcast writes.
   `states` is intentionally private — reads go through the per-key getters
   (e.g. `s.show`), which still register VanJS dependencies since the getter
   dereferences `.val`. After connect() resolves, `self.root` holds the
   connected node when the transport exposes one (e.g. the gun room node), so
   callers that need direct collection access (songs/playlist maps) reuse the
   same connection. */
export function multiBrokerState(init) {
  const states = {};
  for (const [k, v] of Object.entries(init)) states[k] = van.state(v);
  // Connection status combines two independent signals:
  //   • transport report  — what the live transport (ws/gun/mqtt/...) says
  //     ("connecting" by default, "connected" once it confirms, "disconnected"
  //     on close/error). Gun's mesh events only fire after a peer handshake,
  //     so this alone can't detect an offline-at-startup case.
  //   • network online    — navigator.onLine, updated via window online/offline.
  // The overall status is the weaker of the two: offline always wins, while
  // online falls back to whatever the transport last reported. Surfaced via
  // self.connectionStatus + self.onStatus(cb); drives the #disconnected
  // indicator in the song dashboard.
  const conn = van.state("connecting");
  let transportStatus = "connecting";
  let netOnline = (typeof navigator !== "undefined") ? navigator.onLine : true;
  const statusSubs = new Set();
  const setStatus = (v) => { if (conn.val !== v) { conn.val = v; for (const cb of statusSubs) { try { cb(v); } catch (e) { console.error("[broker] status subscriber:", e); } } } };
  const compute = () => netOnline ? transportStatus : "disconnected";
  const setTransport = (v) => { if (v !== transportStatus) { transportStatus = v; setStatus(compute()); } };
  const setNet = (v) => { if (v !== netOnline) { netOnline = v; setStatus(compute()); } };
  const brokers = [];
  // Van-free subscriptions: subscribe(key, cb) fires cb once with the current
  // value and again on every later change (local write or remote update), so
  // thin clients (e.g. the overlay) can react without importing VanJS.
  const subs = {};
  const notify = (key, val) => {
    for (const cb of (subs[key] || [])) { try { cb(val); } catch (e) { console.error("[broker] subscriber:", e); } }
  };
  const self = { brokers };

  self.connect = async function connect(opts) {
    const o = {
      gun: "https://gun.filiphanes.sk/gun",
      mqtt: undefined, ws: undefined, broadcast: undefined, put: undefined,
      space: "demo", password: "demo", path: undefined,
      status: setTransport,
      update(k, v) { if (states[k]) { states[k].val = v; notify(k, v); } },
    };
    Object.assign(o, opts);
    o.path = o.path || `${o.space}/${o.password}`;
    try {
      let broker;
      if (o.ws)             broker = new WebsocketBroker(o);
      else if (o.mqtt)      { await ensureGlobal("mqtt", GLOBAL_SOURCES.mqtt); broker = new MqttBroker(o); }
      else if (o.put)       broker = new PutBroker(o);
      else if (o.gun)       { await ensureGlobal("Gun",  GLOBAL_SOURCES.gun);  broker = new GunBroker(o); }
      else if (o.broadcast) broker = new BroadcastBroker(o);
      if (broker) {
        brokers.push(broker);
        self.broker = broker;
        if (broker.root) self.root = broker.root;
      }
    } catch (e) {
      console.warn("[broker] running local-only:", e.message);
      setTransport("disconnected");
    }
    // navigator.onLine tracks the OS network reachability (wifi up/down).
    // Fires reliably on wifi toggle, which Gun's mesh events miss when the
    // link was never up.
    if (typeof window !== "undefined") {
      const syncNet = () => setNet(navigator.onLine);
      syncNet();
      window.addEventListener("online", syncNet);
      window.addEventListener("offline", syncNet);
    }
  };
  const send = (k, v) => { for (const b of brokers) b.send?.(k, v); };

  // Convenience wrapper around connect() for the project-wide URL convention:
  // the broker room/password comes from location.hash (e.g. scoreboard/#live →
  // password "live", defaulting to "demo") and any transport overrides come
  // from location.search (e.g. ?ws=wss://…). Callers pass their module defaults
  // (space + an optional transport like ws/gun/mqtt); URL search params, being
  // the end-user's runtime choice, win over those defaults — same as the
  // hand-written block this replaces.
  self.connectFromUrl = function ({ space, ...rest } = {}) {
    return self.connect({
      ...rest,
      space,
      password: location.hash.slice(1) || "demo",
      ...Object.fromEntries(new URLSearchParams(location.search)),
    });
  };

  for (const key of Object.keys(init)) {
    Object.defineProperty(self, key, {
      enumerable: true,
      get() { return states[key].val; },
      set(v) { states[key].val = v; send(key, v); notify(key, v); },
    });
  }

  // Transport connection status: "connecting" → "connected" / "disconnected".
  self.connectionStatus = () => conn.val;
  self.onStatus = (cb) => { statusSubs.add(cb); cb(conn.val); return () => statusSubs.delete(cb); };

  // Subscribe to a key: cb fires once immediately (current value) and on every
  // change thereafter. Returns an unsubscribe function. van.derive still works
  // too — this is the dependency-free alternative for simple listeners.
  self.subscribe = (key, cb) => {
    (subs[key] ??= new Set()).add(cb);
    cb(states[key].val);
    return () => subs[key].delete(cb);
  };

  return self;
}
