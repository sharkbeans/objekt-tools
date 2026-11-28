// The match desk, built from sample data into <main data-match>. Every
// direction renders this same markup and restyles it, the way the real
// revamp would swap tokens and component styles under the same React tree.
(() => {
  const S = window.SAMPLE;
  const icon = (...a) => window.UI.icon(...a);
  const PAGE_SIZE = 4;
  const mineKeys = new Set(S.mine.map((c) => c.key));
  const theirKeys = new Set(S.theirs.map((c) => c.key));

  const state = {
    mode: "wtt",
    cols: 6,
    give: new Set(),
    get: new Set(),
    qMine: "",
    qTheirs: "",
    sort: "popular",
    page: 0,
    handled: new Set(),
  };

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const price = (key) => `$${S.prices[key]}`;

  function live(posts) {
    return posts.filter((p) => !state.handled.has(p.id));
  }
  // Posts narrowed by one side's picks only; the other side reads from these.
  function byGet() {
    return live(S.posts).filter((p) => state.get.size === 0 || p.offers.some((k) => state.get.has(k)));
  }
  function byGive() {
    return live(S.posts).filter((p) => state.give.size === 0 || p.wants.some((k) => state.give.has(k)));
  }
  function relevant() {
    return live(S.posts).filter((p) => {
      const giveOk = state.give.size === 0 || p.wants.some((k) => state.give.has(k));
      const getOk = state.get.size === 0 || p.offers.some((k) => state.get.has(k));
      if (state.mode === "wtb") return getOk;
      if (state.mode === "wts") return giveOk && p.wants.some((k) => mineKeys.has(k));
      return giveOk && getOk && p.wants.some((k) => mineKeys.has(k));
    });
  }

  function matches(card, q) {
    const hay = `${card.member} ${card.code}`.toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((t) => hay.includes(t));
  }

  function sortCards(list, count) {
    return [...list].sort((a, b) =>
      state.sort === "member"
        ? a.member.localeCompare(b.member)
        : count(b) - count(a) || a.member.localeCompare(b.member),
    );
  }

  function mineCards() {
    const posts = byGet();
    const count = (c) => posts.filter((p) => p.wants.includes(c.key)).length;
    let list = S.mine;
    if (state.get.size && state.mode === "wtt") {
      list = list.filter((c) => count(c) > 0 || state.give.has(c.key));
    }
    list = list.filter((c) => matches(c, state.qMine));
    return sortCards(list, count).map((c) => ({ card: c, n: count(c) }));
  }

  function theirCards() {
    const posts = state.mode === "wtb" ? live(S.posts) : byGive();
    const count = (c) => posts.filter((p) => p.offers.includes(c.key)).length;
    let list = S.theirs.filter((c) => count(c) > 0 || state.get.has(c.key));
    list = list.filter((c) => matches(c, state.qTheirs));
    return sortCards(list, count).map((c) => ({ card: c, n: count(c) }));
  }

  function cardHTML({ card, n }, side) {
    const chosen = (side === "mine" ? state.give : state.get).has(card.key);
    const wtb = side === "theirs" && state.mode === "wtb";
    const letter = side === "mine" ? "W" : "H";
    const who = side === "mine" ? (state.mode === "wts" ? "buyer" : "trader") : "trader";
    const full =
      side === "mine"
        ? `${plural(n, who)} ${n === 1 ? "wants" : "want"} this`
        : `${plural(n, "trader")} ${n === 1 ? "has" : "have"} this`;
    const badge = wtb
      ? ""
      : `<span class="badge badge-${side}${n === 0 ? " is-zero" : ""}" title="${full}" aria-hidden="true">${n}${letter}</span>`;
    return `<button type="button" class="card" data-side="${side}" data-key="${card.key}" aria-pressed="${chosen}" aria-label="${side === "mine" ? "My" : "Their"} ${esc(card.label)}, ${wtb ? `from ${price(card.key)}` : full}">
      <span class="card-media">
        <img src="${card.img}" alt="" loading="lazy" decoding="async" width="582" height="900">
        ${badge}
        <span class="card-check" aria-hidden="true">${icon("check", 14, 3)}</span>
      </span>
      <span class="card-cap">
        <span class="card-member">${esc(card.member)}</span>
        <span class="card-code">${esc(card.code)}</span>
        ${wtb ? `<span class="card-note">from ${price(card.key)}</span>` : ""}
      </span>
    </button>`;
  }

  function thumbsHTML(keys, { focus, caption } = {}) {
    return keys
      .map((key) => {
        const card = S.byKey.get(key);
        const on = focus?.(key);
        return `<figure class="thumb${on ? " is-focus" : ""}">
          <img src="${card.img}" alt="${esc(card.label)}" loading="lazy" decoding="async" width="582" height="900">
          <figcaption><span>${esc(card.member)}</span> <span class="thumb-code">${esc(caption ? caption(key) : card.code.split(" ")[1])}</span></figcaption>
        </figure>`;
      })
      .join("");
  }

  function contactHTML(post) {
    const mode = state.mode;
    const theirWants = post.wants.filter((k) => mineKeys.has(k) && (state.give.size === 0 || state.give.has(k)));
    const offers = [...post.offers].sort((a, b) => Number(state.get.has(b)) - Number(state.get.has(a)));
    const sub =
      mode === "wtb"
        ? `${plural(offers.length, "listed card")} for sale`
        : theirWants.length === 1
          ? `Wants your ${S.byKey.get(theirWants[0]).label}`
          : `${theirWants.length} of your cards on their want list`;
    const focus = state.get.size ? (k) => state.get.has(k) : undefined;
    const wantsBlock =
      mode === "wtb"
        ? ""
        : `<div class="gallery gallery-wants"><p class="gallery-title">Your cards they want</p><div class="thumbs">${thumbsHTML(theirWants, {
            caption: mode === "wts" ? () => "Ask for bid" : undefined,
          })}</div></div>`;
    const offersBlock =
      mode === "wts"
        ? ""
        : `<div class="gallery gallery-offers"><p class="gallery-title">${mode === "wtb" ? "Cards for sale" : "Their cards you could get"}</p><div class="thumbs">${thumbsHTML(offers, {
            focus,
            caption: mode === "wtb" ? price : undefined,
          })}</div></div>`;
    const review = mode === "wtb" ? "Review prices & post" : mode === "wts" ? "Review buyer’s post" : "Review trade";
    return `<article class="contact" data-testid="trader-result">
      <header class="contact-head">
        <div class="contact-who">
          <span class="avatar" aria-hidden="true">${esc(post.author[0].toUpperCase())}</span>
          <div class="contact-id"><p class="contact-name">${esc(post.author)}</p><p class="contact-sub">${esc(sub)}</p></div>
        </div>
        <div class="contact-meta">
          <span class="contact-time">${esc(post.time)}</span>
          <a class="btn btn-ghost btn-sm" href="#" data-jump>${icon("external", 14)}<span>Jump to message</span></a>
        </div>
      </header>
      <div class="contact-body${wantsBlock && offersBlock ? " is-split" : ""}">${wantsBlock}${offersBlock}</div>
      <footer class="contact-foot">
        <button type="button" class="btn btn-primary btn-sm" data-review>${review}</button>
        <button type="button" class="btn btn-outline btn-sm" data-copy="${esc(post.author)}">${icon("copy", 14)}<span>Copy name</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-review>Check inventory</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-handled="${post.id}" title="Hide this post from the desk">${icon("checkCheck", 14)}<span>Handled</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-mute title="Hide every post by ${esc(post.author)}">${icon("bellOff", 14)}<span>Mute</span></button>
      </footer>
    </article>`;
  }

  function contactsHTML(posts) {
    if (!posts.length) {
      return `<div class="empty">${
        state.mode === "wtb"
          ? "No seller in your captures lists all of these cards. Remove a selection or capture more WTS posts."
          : state.mode === "wts"
            ? "No cash buyer in your captures matches these cards. Try WTT to find people who want a swap."
            : "No single WTT post connects these selections. Remove a card or capture more posts to find another offer."
      }</div>`;
    }
    const pages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
    const page = Math.min(state.page, pages - 1);
    const slice = posts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const pager =
      pages > 1
        ? `<div class="pager"><button type="button" class="btn btn-outline btn-icon" data-page="-1" aria-label="Previous results"${page === 0 ? " disabled" : ""}>${icon("chevronLeft")}</button><span>Page ${page + 1} of ${pages}</span><button type="button" class="btn btn-outline btn-icon" data-page="1" aria-label="Next results"${page >= pages - 1 ? " disabled" : ""}>${icon("chevronRight")}</button></div>`
        : "";
    return `<div class="contacts">${slice.map(contactHTML).join("")}</div>${pager}`;
  }

  function skeleton() {
    const modes = S.modes
      .map(
        (m) =>
          `<button type="button" class="seg-btn" data-mode="${m.id}" aria-pressed="${m.id === state.mode}">${icon(m.icon)}<span>${m.label}</span></button>`,
      )
      .join("");
    const cols = [4, 5, 6, 7, 8, 9, 10]
      .map((n) => `<option value="${n}"${n === state.cols ? " selected" : ""}>${n}</option>`)
      .join("");
    return `<div class="m-wrap">
      <header class="m-head">
        <div class="m-title">
          <p class="m-eyebrow"><span>Objekt Match</span><span class="m-sample">Sample data</span></p>
          <h1>Find your next trade</h1>
          <p class="m-sub">Capture your Discord trade channels to see who has what you’re missing.</p>
        </div>
        <div class="m-actions">
          <button type="button" class="btn btn-ghost">${icon("target")}<span>My hunts</span>${icon("chevronDown", 14)}</button>
          <button type="button" class="btn btn-outline">My objekts</button>
          <button type="button" class="btn btn-outline">${icon("images")}<span>Captures</span><span class="count">3</span></button>
          <button type="button" class="btn btn-primary">${icon("plus")}<span>New capture</span></button>
        </div>
      </header>

      <section class="m-modebar" aria-label="Trading mode">
        <div class="seg" role="group" aria-label="Choose WTT, WTB or WTS">${modes}</div>
        <div class="m-meta">
          <label class="m-cols" for="desk-columns">Per row <select id="desk-columns" class="select">${cols}</select></label>
          <span class="m-posts">262 posts</span>
          <button type="button" class="link" data-clear-posts>Clear posts</button>
        </div>
      </section>
      <p class="m-hint" data-m="hint"></p>

      <div class="m-summary" aria-live="polite">
        <div class="m-summary-text" data-m="summary"></div>
        <button type="button" class="btn btn-outline btn-sm" data-m="see" data-scroll-results></button>
      </div>
      <div class="m-tray" data-m="tray" hidden></div>

      <div class="desk">
        <section class="panel panel-mine" aria-label="My objekts">
          <div class="panel-head">
            <div><p class="panel-eyebrow" data-m="mineEyebrow">Your side</p><h2 class="panel-title" data-m="mineTitle">My objekts</h2></div>
            <button type="button" class="btn btn-outline btn-sm" data-m="cosmo">${icon("pencil", 14)}<span>Change Cosmo</span></button>
          </div>
          <label class="search" data-m="mineSearch">${icon("search")}<input id="search-mine" type="search" autocomplete="off" placeholder="Search member or code · e.g. seoyeon 501z"></label>
          <div class="grid" data-m="mineGrid"></div>
          <div class="note" data-m="wtbNote" hidden>
            <p>You don’t need to offer any objekts to buy.</p>
            <p>Compare the prices under each seller, then use their Discord name button to copy their username and arrange the purchase.</p>
            <button type="button" class="btn btn-outline btn-sm">Use my saved wants</button>
          </div>
        </section>
        <section class="panel panel-theirs" aria-label="Their objekts">
          <div class="panel-head">
            <div><p class="panel-eyebrow">From your captures</p><h2 class="panel-title" data-m="theirTitle">Their objekts</h2></div>
            <select class="select" id="sort-theirs" aria-label="Sort their objekts" data-m="sort">
              <option value="popular">Most haves</option>
              <option value="member">Member</option>
            </select>
          </div>
          <label class="search" data-m="theirSearch">${icon("search")}<input id="search-theirs" type="search" autocomplete="off" placeholder="Search or paste your wants · e.g. sy cc117-120"></label>
          <div class="grid" data-m="theirGrid"></div>
          <div class="buyers" data-m="buyers" hidden></div>
          <div class="linked" data-m="linked">
            <div><p class="linked-title">2 linked lists</p><p class="linked-body">Found public Objekt.top and Apollo.cafe lists in these posts. Load them to include the cards traders list there and surface more possible matches.</p></div>
            <button type="button" class="btn btn-primary btn-sm" data-load-lists>Load all 2 lists</button>
          </div>
        </section>
      </div>

      <div class="m-float" data-m="float" hidden><button type="button" class="btn btn-primary btn-lg" data-m="floatBtn" data-scroll-results></button></div>

      <section class="results" data-m="results" aria-label="Traders">
        <div class="results-head">
          <h2 class="results-title" data-m="resultsTitle"></h2>
          <p class="results-sub" data-m="resultsSub"></p>
        </div>
        <div data-m="contacts"></div>
      </section>

      <p class="m-disclaimer">Fan-made Discord trade-matching tool · not affiliated with or endorsed by MODHAUS, COSMO or Discord · no real objekts are distributed</p>
    </div>`;
  }

  let $ = {};
  function render() {
    const mode = state.mode;
    const focused = document.activeElement?.closest?.(".card");
    const refocus = focused ? { side: focused.dataset.side, key: focused.dataset.key } : null;

    for (const btn of document.querySelectorAll("[data-mode]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
    }
    $.hint.textContent = S.modes.find((m) => m.id === mode).hint;

    const posts = relevant();
    const picks = state.give.size + state.get.size;
    const kind = mode === "wtb" ? "WTS" : mode === "wts" ? "WTB" : "WTT";
    const rest = picks
      ? " match your selections."
      : mode === "wtb"
        ? " with cards for sale."
        : " want cards you have.";
    $.summary.innerHTML = `<p><strong>${plural(posts.length, `${kind} post`)}</strong>${rest}${
      state.give.size && state.get.size ? ` <span class="muted">Each post matches at least one selected card on each side.</span>` : ""
    }</p>`;
    $.see.hidden = mode === "wts" || picks > 0;
    $.see.innerHTML = `<span>See ${mode === "wtb" ? "sellers" : "traders"}</span>${icon("arrowDown", 14)}`;

    // Selection tray
    if (picks) {
      const chip = (k) => `<img src="${S.byKey.get(k).img}" alt="${esc(S.byKey.get(k).label)}" title="${esc(S.byKey.get(k).label)}">`;
      const give = state.give.size ? `<span class="tray-group"><span class="tray-label">Giving</span>${[...state.give].map(chip).join("")}</span>` : "";
      const get = state.get.size ? `<span class="tray-group"><span class="tray-label">${mode === "wtb" ? "Buying" : "Getting"}</span>${[...state.get].map(chip).join("")}</span>` : "";
      $.tray.innerHTML = `${give}${get}<button type="button" class="link" data-clear-picks>Clear selection</button>`;
      $.tray.hidden = false;
    } else {
      $.tray.hidden = true;
    }

    // Left panel
    $.mineEyebrow.textContent = mode === "wtb" ? "Your selection" : "Your side";
    $.mineTitle.textContent = mode === "wtb" ? "I want to buy" : mode === "wts" ? "I want to sell" : "My objekts";
    $.cosmo.hidden = mode === "wtb";
    $.wtbNote.hidden = mode !== "wtb";
    $.mineSearch.hidden = mode === "wtb";
    $.mineGrid.hidden = mode === "wtb";
    if (mode !== "wtb") {
      const list = mineCards();
      $.mineGrid.innerHTML = list.length
        ? list.map((c) => cardHTML(c, "mine")).join("")
        : `<p class="empty">None of your cards match these traders’ wants. Remove a selection on the right to see your collection again.</p>`;
    }

    // Right panel
    $.theirTitle.textContent = mode === "wts" ? `Cash buyers (${posts.length})` : mode === "wtb" ? "Objekts for sale" : "Their objekts";
    $.sort.hidden = mode === "wts";
    $.theirSearch.hidden = mode === "wts";
    $.theirGrid.hidden = mode === "wts";
    $.linked.hidden = mode === "wts";
    $.buyers.hidden = mode !== "wts";
    if (mode === "wts") {
      $.buyers.innerHTML = `<p class="muted">Cash buyers only. Copy a name to contact them in Discord.</p>${contactsHTML(posts)}`;
    } else {
      const list = theirCards();
      $.theirGrid.innerHTML = list.length
        ? list.map((c) => cardHTML(c, "theirs")).join("")
        : `<p class="empty">No offers connect these selections yet. Remove a card or capture more posts.</p>`;
    }
    for (const grid of [$.mineGrid, $.theirGrid]) grid.style.setProperty("--cols", String(state.cols));

    // Floating next step
    const showFloat = mode !== "wts" && picks > 0;
    $.float.hidden = !showFloat;
    if (showFloat) {
      $.floatBtn.disabled = posts.length === 0;
      $.floatBtn.innerHTML = posts.length
        ? `<span>See ${plural(posts.length, `matching ${mode === "wtb" ? "seller" : "trader"}`)}</span>${icon("arrowDown")}`
        : `<span>No ${mode === "wtb" ? "seller" : "trader"} matches yet</span>`;
    }

    // Results
    $.results.hidden = mode === "wts";
    if (mode !== "wts") {
      const title = mode === "wtb" ? "Sellers" : "Traders";
      $.resultsTitle.innerHTML = `${title} <span class="muted">(${posts.length})</span>`;
      $.resultsSub.textContent =
        mode === "wtb"
          ? "Prices belong to each seller. Copy their name to arrange the purchase in Discord."
          : "See what they want from you and browse what you could get. Review the post for ratios and conditions.";
      $.contacts.innerHTML = contactsHTML(posts);
    }

    if (refocus) {
      document.querySelector(`.card[data-side="${refocus.side}"][data-key="${refocus.key}"]`)?.focus({ preventScroll: true });
    }
  }

  function scrollToResults() {
    const target = state.mode === "wts" ? $.buyers : $.results;
    target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const main = document.querySelector("[data-match]");
    main.innerHTML = skeleton();
    $ = {};
    for (const el of main.querySelectorAll("[data-m]")) $[el.dataset.m] = el;

    main.addEventListener("click", async (event) => {
      const t = event.target;
      const card = t.closest(".card");
      if (card) {
        const set = card.dataset.side === "mine" ? state.give : state.get;
        set.has(card.dataset.key) ? set.delete(card.dataset.key) : set.add(card.dataset.key);
        state.page = 0;
        render();
        return;
      }
      const mode = t.closest("[data-mode]");
      if (mode) {
        if (mode.dataset.mode !== state.mode) {
          state.mode = mode.dataset.mode;
          state.give.clear();
          state.get.clear();
          state.page = 0;
          render();
        }
        return;
      }
      const page = t.closest("[data-page]");
      if (page) {
        state.page = Math.max(0, state.page + Number(page.dataset.page));
        render();
        (state.mode === "wts" ? $.buyers : $.results).scrollIntoView({ block: "start" });
        return;
      }
      if (t.closest("[data-scroll-results]")) return scrollToResults();
      if (t.closest("[data-clear-picks]")) {
        state.give.clear();
        state.get.clear();
        return render();
      }
      const handled = t.closest("[data-handled]");
      if (handled) {
        state.handled.add(handled.dataset.handled);
        window.UI.toast("Post hidden from the desk.");
        return render();
      }
      const copy = t.closest("[data-copy]");
      if (copy) {
        const name = copy.dataset.copy;
        try {
          await navigator.clipboard.writeText(name);
          window.UI.toast(`Copied ${name}`);
        } catch {
          window.UI.toast(`Discord name: ${name}`);
        }
        return;
      }
      if (t.closest("[data-jump]")) {
        event.preventDefault();
        return window.UI.toast("In the app this jumps to the post in Discord.");
      }
      if (t.closest("[data-review], [data-mute], [data-load-lists], [data-clear-posts]") || t.closest(".m-actions .btn") || t.closest("[data-m='cosmo']")) {
        window.UI.toast("That control isn't wired up in this sample.");
      }
    });

    main.querySelector("#search-mine").addEventListener("input", (e) => {
      state.qMine = e.target.value;
      render();
    });
    main.querySelector("#search-theirs").addEventListener("input", (e) => {
      state.qTheirs = e.target.value;
      render();
    });
    main.querySelector("#desk-columns").addEventListener("change", (e) => {
      state.cols = Number(e.target.value);
      render();
    });
    main.querySelector("#sort-theirs").addEventListener("change", (e) => {
      state.sort = e.target.value;
      render();
    });

    // Start in a realistic working state: one of your cards picked, so the
    // selected style, the tray and the narrowed results all show.
    state.give.add(S.mine[0].key);
    render();
  });
})();
