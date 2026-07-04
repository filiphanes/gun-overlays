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
  }
  send(k, v) { this.channel.postMessage({ [k]: v }); }
}

class PutBroker {
  constructor(o) { this.prefix = o.put; }
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
  }
  send(k, v) { this.root.get(k).put(v); }
}

class MqttBroker {
  constructor(o) {
    this.options = o;
    if (!o.path.endsWith("/")) o.path += "/";
    this.client = window.mqtt.connect(o.mqtt);
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
    }
  };
  const send = (k, v) => { for (const b of brokers) b.send?.(k, v); };

  for (const key of Object.keys(init)) {
    Object.defineProperty(self, key, {
      enumerable: true,
      get() { return states[key].val; },
      set(v) { states[key].val = v; send(key, v); notify(key, v); },
    });
  }

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
