// Font switch for the Freemode 2 sample: a thin row under the sample strip.
// The choice is remembered per browser so home and match stay in sync.
(() => {
  const KEY = "fm2-type";
  const SETS = [
    ["geist", "Geist"],
    ["barlow", "Barlow Semi Condensed"],
    ["manrope", "Manrope"],
  ];
  const root = document.documentElement;
  const read = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  const valid = (id) => SETS.some(([s]) => s === id);
  // Applied in <head> too, before first paint; this is the fallback.
  const stored = read();
  if (valid(stored)) root.dataset.type = stored;

  function apply(id) {
    root.dataset.type = id;
    try {
      localStorage.setItem(KEY, id);
    } catch {}
    for (const b of document.querySelectorAll(".type-bar button")) {
      b.setAttribute("aria-pressed", String(b.dataset.set === id));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.className = "type-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Font");
    const current = root.dataset.type || "geist";
    bar.innerHTML =
      `<span class="type-bar-label">Font</span>` +
      SETS.map(
        ([id, name]) =>
          `<button type="button" data-set="${id}" aria-pressed="${id === current}">${name}</button>`,
      ).join("");
    bar.addEventListener("click", (event) => {
      const b = event.target.closest("button[data-set]");
      if (b) apply(b.dataset.set);
    });
    const strip = document.querySelector(".sample-bar");
    if (strip) strip.after(bar);
    else document.body.prepend(bar);
  });
})();
