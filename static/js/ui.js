// Shared VanJS DOM helpers for the static (build-free) controllers.
// Re-exported `van` so controllers import everything UI-related from one place.
// The broker-bound input builders (textIn/numIn/boundInput) take a
// multiBrokerState() `s` and bind an <input> two-way to `s[key]`: reading
// registers a VanJS dependency, writing broadcasts through the broker setter.

import van from "./van.js";

// Append a render result (node | string | array | null/false) to a parent.
export function appendAll(el, out) {
  if (out == null || out === false) return;
  if (Array.isArray(out)) for (const c of out) appendAll(el, c);
  else el.append(out);
}

// A container whose children are rebuilt from `render()` whenever any van state
// read inside it changes. Use for list regions driven by collections, and for
// any block that returns DOM nodes conditionally — VanJS stringifies arrays of
// nodes returned from a plain function child, so wrap them in live().
export function live(tag, props, render) {
  const el = tag(props);
  van.derive(() => { el.replaceChildren(); appendAll(el, render()); });
  return el;
}

// A <div> whose innerHTML follows an HTML-string state/derive.
export function htmlDiv(className, html$) {
  const el = van.tags.div({ class: className });
  van.derive(() => { el.innerHTML = html$.val ?? ""; });
  return el;
}

// A <select> kept in sync with a reactive getter. `optionSpecs` are plain
// { value, label } objects so each select builds its own fresh <option> nodes
// (sharing DOM <option> nodes between selects would empty the first one).
export function boundSelect(getValue, onchange, optionSpecs) {
  const { select, option } = van.tags;
  const el = select({ onchange }, optionSpecs.map(o => option({ value: o.value }, o.label)));
  van.derive(() => { el.value = String(getValue() ?? ""); });
  return el;
}

// Broker-bound <input> two-way bound to `s[key]`. The `value`/`oninput` binding
// is applied last so it always wins; `class` (default "form-control", matching
// the Bootstrap controllers that originally inlined this) and `type` defaults
// are pulled out of `rest` so a caller can still override either by passing
// `class:`/`type:` explicitly. Any other props (id, placeholder, min, max, …)
// pass straight through.
export function boundInput(s, key, { type = "text", class: cls = "form-control", ...rest } = {}) {
  const { input } = van.tags;
  return input({
    class: cls, type, ...rest,
    value: () => s[key],
    oninput: (e) => { s[key] = e.target.value; },
  });
}

// Convenience shortcuts for the common text / number cases.
export const textIn = (s, key, rest = {}) => boundInput(s, key, { type: "text", ...rest });
export const numIn  = (s, key, rest = {}) => boundInput(s, key, { type: "number", ...rest });

export { van };
