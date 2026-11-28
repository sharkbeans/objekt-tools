// Helpers every sample page uses: icons, the logo, the KST clock, a toast,
// and the strip that switches between samples.
(() => {
  // Lucide icon paths (the set the app already uses), inlined so the samples
  // load nothing but fonts.
  const PATHS = {
    arrowLeftRight:
      '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    pencil:
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    external:
      '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    checkCheck: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
    bellOff:
      '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    images:
      '<path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/>',
    target:
      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    logIn:
      '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    enter: '<path d="m9 10-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  };

  function icon(name, size = 16, stroke = 2) {
    const body = PATHS[name];
    if (!body) return "";
    return `<svg class="i i-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  // The objekt.my mark: two cut-corner cards, the front one hollow.
  function logo(size = 28) {
    return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <polygon fill="currentColor" points="43.04,18 80,18 80,54.96 72.96,62 36,62 36,25.04"/>
      <polygon fill="currentColor" points="26.4,40 60,40 60,72.8 52.8,80 20,80 20,46.4"/>
      <polygon fill="var(--logo-cut, #000)" points="29.46,44.5 55.5,44.5 55.5,69.92 49.92,75.5 24.5,75.5 24.5,49.46"/>
    </svg>`;
  }

  function hydrateIcons(root = document) {
    for (const el of root.querySelectorAll("[data-icon]")) {
      const size = Number(el.dataset.size || 16);
      const stroke = Number(el.dataset.stroke || 2);
      el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon, size, stroke));
      el.removeAttribute("data-icon");
    }
    for (const el of root.querySelectorAll("[data-logo]")) {
      el.insertAdjacentHTML("afterbegin", logo(Number(el.dataset.logo || 28)));
      el.removeAttribute("data-logo");
    }
  }

  // Cosmo drops run on Seoul time, so the corner shows KST.
  function startClock() {
    const els = document.querySelectorAll("[data-clock]");
    if (!els.length) return;
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
    });
    const tick = () => {
      const text = fmt.format(new Date());
      for (const el of els) el.textContent = text;
    };
    tick();
    setInterval(tick, 15000);
  }

  let toastTimer;
  function toast(message) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  // A slim strip above each sample for jumping between them.
  const DIRECTIONS = [
    ["freemode-3", "A3", "Freemode 3"],
    ["freemode-2", "A2", "Freemode 2"],
    ["a-freemode", "A", "Freemode"],
    ["b-studio", "B", "Studio"],
    ["c-expanded", "C", "Expanded"],
  ];
  function sampleBar() {
    const here = location.pathname.split("/").filter(Boolean);
    const page = (here.at(-1) || "home.html").replace(".html", "");
    const dir = here.at(-2) || "";
    const bar = document.createElement("nav");
    bar.className = "sample-bar";
    bar.setAttribute("aria-label", "Design samples");
    const links = DIRECTIONS.map(
      ([slug, letter, name]) =>
        `<a href="../${slug}/${page}.html"${slug === dir ? ' aria-current="page"' : ""}>${name}</a>`,
    ).join("");
    const other = page === "home" ? "match" : "home";
    bar.innerHTML = `<a class="sb-all" href="../index.html">All samples</a><span class="sb-dirs">${links}</span><a class="sb-page" href="${other}.html">${other === "match" ? "Match page" : "Home page"} ${icon("arrowRight", 12)}</a>`;
    document.body.prepend(bar);
  }

  window.UI = { icon, logo, hydrateIcons, startClock, toast, sampleBar };

  document.addEventListener("DOMContentLoaded", () => {
    sampleBar();
    hydrateIcons();
    startClock();
  });
})();
