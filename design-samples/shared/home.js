// Home-screen behaviour shared by every direction: a row of tiles, one
// selected at a time, driving the hero above it. Arrow keys move, Enter
// opens, Q/E move between the top tabs, hover selects on a mouse and a tap
// selects on touch (a second tap, or the hero button, opens).
(() => {
  const { tools } = window.SAMPLE;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  let active = 0;
  let tiles = [];

  function buildTiles() {
    const row = document.querySelector("[data-tiles]");
    const tpl = document.querySelector("#tile-tpl");
    if (!row || !tpl) return;
    tools.forEach((tool, index) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.index = String(index);
      node.setAttribute("aria-label", `${tool.short}: ${tool.desc}`);
      for (const el of node.querySelectorAll("[data-f]")) {
        const field = el.dataset.f;
        if (field === "img") el.src = tool.tile;
        else if (field === "num") el.textContent = String(index + 1).padStart(2, "0");
        else el.textContent = tool[field] ?? "";
      }
      row.append(node);
    });
    tiles = [...row.children];
  }

  function fillHero(tool, index) {
    for (const el of document.querySelectorAll("[data-h]")) {
      const field = el.dataset.h;
      if (field === "pos") {
        el.textContent = `${String(index + 1).padStart(2, "0")} / ${String(tools.length).padStart(2, "0")}`;
      } else if (field === "img") {
        el.src = tool.tile;
      } else {
        el.textContent = tool[field] ?? "";
      }
    }
  }

  let swapTimer;
  function select(index, { scroll = true, first = false } = {}) {
    index = (index + tools.length) % tools.length;
    if (index === active && !first) return;
    active = index;
    const tool = tools[index];
    tiles.forEach((tile, i) => {
      const on = i === index;
      tile.classList.toggle("is-active", on);
      tile.setAttribute("aria-current", on ? "true" : "false");
    });
    document.documentElement.dataset.tool = tool.id;

    const hero = document.querySelector("[data-hero]");
    clearTimeout(swapTimer);
    if (hero && !reduce && !first) {
      hero.classList.add("is-out");
      swapTimer = setTimeout(() => {
        fillHero(tool, index);
        hero.classList.remove("is-out");
      }, 140);
    } else {
      fillHero(tool, index);
    }

    // On a phone the tiles are a scrolling strip; keep the pick in view.
    const strip = tiles[index]?.parentElement;
    if (scroll && strip && strip.scrollWidth > strip.clientWidth + 4) {
      tiles[index].scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
    }
    document.dispatchEvent(
      new CustomEvent("toolchange", { detail: { tool, index, first } }),
    );
  }

  function open(index = active) {
    const tool = tools[index];
    if (tool.id === "match") {
      location.href = "match.html";
      return;
    }
    window.UI.toast(`${tool.short} isn't part of this sample. Try Match.`);
  }

  function moveTab(step) {
    const tabs = [...document.querySelectorAll("[data-tab]")];
    if (!tabs.length) return;
    const current = tabs.findIndex((t) => t.classList.contains("is-active"));
    const next = (current + step + tabs.length) % tabs.length;
    tabs.forEach((t, i) => {
      t.classList.toggle("is-active", i === next);
      if (i === next) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildTiles();
    select(0, { scroll: false, first: true });

    tiles.forEach((tile, index) => {
      if (canHover) {
        tile.addEventListener("mouseenter", () => select(index, { scroll: false }));
      }
      // Keyboard focus selects; a tap's focus must not, or the same tap's
      // click would then open the tile it only meant to select.
      tile.addEventListener("focus", () => {
        if (tile.matches(":focus-visible")) select(index);
      });
      tile.addEventListener("click", () => {
        if (canHover || index === active) open(index);
        else select(index);
      });
    });

    for (const el of document.querySelectorAll("[data-open]")) {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        open();
      });
    }
    for (const el of document.querySelectorAll("[data-secondary]")) {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        window.UI.toast(`"${tools[active].cta2}" isn't part of this sample.`);
      });
    }
    for (const el of document.querySelectorAll("[data-step]")) {
      el.addEventListener("click", () => select(active + Number(el.dataset.step)));
    }

    document.addEventListener("keydown", (event) => {
      if (event.target.closest("input, select, textarea")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === "ArrowRight" || key === "d" || key === "D") {
        select(active + 1);
        tiles[active]?.focus({ preventScroll: true });
      } else if (key === "ArrowLeft" || key === "a" || key === "A") {
        select(active - 1);
        tiles[active]?.focus({ preventScroll: true });
      } else if (key === "Enter" && !event.target.closest("a, button")) {
        event.preventDefault();
        open();
      } else if (key === "q" || key === "Q") {
        moveTab(-1);
      } else if (key === "e" || key === "E") {
        moveTab(1);
      } else return;
      event.preventDefault();
    });
  });
})();
