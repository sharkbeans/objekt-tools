// Sample data shared by every design direction. All of it is made up for the
// mockups except the card art, which is real objekt thumbnails.
(() => {
  const CARD_DIR = "../assets/objekts/";
  const TILE_DIR = "../assets/tiles/";

  const cards = [
    "SeoYeon D2 501Z",
    "HyeRin D2 501Z",
    "JiWoo D2 501Z",
    "ChaeYeon D2 501Z",
    "YooYeon D2 501Z",
    "SooMin D2 501Z",
    "NaKyoung D2 501Z",
    "YuBin D2 501Z",
    "Kaede D2 501Z",
    "DaHyun D2 501Z",
    "Kotone D2 501Z",
    "YeonJi D2 501Z",
    "Nien D2 402Z",
    "SoHyun D2 305Z",
    "Xinyu D2 305Z",
    "Mayu D2 305Z",
    "Lynn D2 402Z",
    "JooBin D2 402Z",
    "HaYeon D2 402Z",
    "ShiOn D2 402Z",
    "ChaeWon D2 402Z",
    "Sullin D2 100Z",
    "SeoAh D2 305Z",
    "JiYeon D2 305Z",
    "HeeJin A2 360Z",
    "HaSeul A2 371Z",
    "KimLip A2 371Z",
    "JinSoul A2 360Z",
    "Choerry A2 360Z",
  ].map((label, index) => {
    const [member, season, number] = label.split(" ");
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      index,
      key,
      label,
      member,
      code: `${season} ${number}`,
      img: `${CARD_DIR}${key}.webp`,
    };
  });

  const tools = [
    {
      id: "collection",
      label: "Collection",
      short: "Your grids",
      desc: "See every FCO you're missing.",
      overline: "Collection",
      title: "Every grid, one screen",
      body: "Link your Cosmo and see how close each grid is across tripleS, ARTMS and idntt, with every first-class objekt you're still missing.",
      cta: "Open collection",
      cta2: "Link Cosmo",
      hint: "Select to see what your grids are missing",
      tile: `${TILE_DIR}collection.webp`,
      deal: [0, 1, 2, 3, 4],
      lit: [15, 16, 17, 18, 25, 26, 27, 28],
    },
    {
      id: "match",
      label: "Match",
      short: "Match on Discord",
      desc: "Match the trade posts you scroll past.",
      overline: "Objekt Match",
      title: "Find who has what you're missing",
      body: "The Objekt Match extension reads the Discord trade channels you already scroll and lines every WTT, WTB and WTS post up against your collection.",
      cta: "Open matcher",
      cta2: "Get the extension",
      hint: "Select to match your Discord trade posts",
      tile: `${TILE_DIR}trades.webp`,
      deal: [13, 15, 5, 18, 20],
      lit: [13, 16, 27, 46],
    },
    {
      id: "lists",
      label: "Lists",
      short: "Lists",
      desc: "Turn a tradelist into a page.",
      overline: "Lists",
      title: "Your tradelist, as a link",
      body: "Paste the haves and wants from your Discord post and get a clean page you can share in any server.",
      cta: "Make a list",
      cta2: "See an example",
      hint: "Select to turn a tradelist into a shareable page",
      tile: `${TILE_DIR}lists.webp`,
      deal: [24, 25, 26, 27, 28],
      lit: [2, 12, 22, 32, 42, 52],
    },
    {
      id: "objektify",
      label: "Objektify",
      short: "Objektify",
      desc: "Create custom objekt cards.",
      overline: "Objektify",
      title: "Make your own objekt",
      body: "Turn any photo into a custom objekt card with your own border, text and back side.",
      cta: "Start a card",
      cta2: "Browse presets",
      hint: "Select to create a custom objekt card",
      tile: `${TILE_DIR}objektify.webp`,
      deal: [10, 11, 7, 8, 9],
      lit: [27],
    },
    {
      id: "proofshot",
      label: "Proofshot",
      short: "Proofshot",
      desc: "Generate proofshot images.",
      overline: "Proofshot",
      title: "Proofshots in seconds",
      body: "Drop an objekt into a real photo to make a proofshot for a trade or a giveaway.",
      cta: "Make a proofshot",
      cta2: "How it works",
      hint: "Select to generate a proofshot image",
      tile: `${TILE_DIR}proofshot.webp`,
      deal: [16, 17, 19, 21, 22],
      lit: [14, 15],
    },
    {
      id: "spin",
      label: "Spin",
      short: "Spin",
      desc: "Random draw.",
      overline: "Spin simulator",
      title: "Leave it to the draw",
      body: "Pick a set and draw a random objekt. It's for fun, nothing is spent and nothing is kept.",
      cta: "Spin",
      cta2: "Pick a set",
      hint: "Select to run a random draw",
      tile: `${TILE_DIR}spin.webp`,
      deal: [12, 6, 14, 23, 28],
      lit: [5, 17, 29, 41, 53],
    },
  ];

  // Your haves: the first 13 cards. Their cards: the other 16.
  const mine = cards.slice(0, 13);
  const theirs = cards.slice(13);

  // Each post: who, when, which of your cards they want, what they offer.
  const posts = [
    ["haerin.exe", "Today 3:44 PM", [0, 3, 7], [13, 15, 18, 21]],
    ["sooyoung_", "Today 2:51 PM", [0, 1], [14, 13, 20]],
    ["kaede.grid", "Today 1:02 PM", [2, 8], [22, 23, 13, 16]],
    ["yubinsmile", "Today 11:37 AM", [0, 4, 5], [17, 19]],
    ["lunar.objekts", "Yesterday 11:20 PM", [1, 6], [24, 25, 26]],
    ["jiwooprint", "Yesterday 9:05 PM", [3], [13, 27, 28, 15]],
    ["nakyoung.fan", "Yesterday 6:48 PM", [0, 9, 10], [14, 18]],
    ["fco.hunter", "Nov 26", [2, 11], [16, 20, 21, 13]],
    ["seoah.wav", "Nov 26", [5, 7], [19, 23]],
    ["mintchoco.s", "Nov 25", [1, 12], [15, 22, 25]],
  ].map(([author, time, wants, offers], i) => ({
    id: `p${i}`,
    author,
    time,
    wants: wants.map((n) => cards[n].key),
    offers: offers.map((n) => cards[n].key),
  }));

  // Asking prices for WTB mode, in USD as most trade posts write them.
  const prices = {};
  theirs.forEach((card, i) => {
    prices[card.key] = 3 + ((i * 7) % 10);
  });

  const modes = [
    {
      id: "wtt",
      label: "WTT",
      icon: "arrowLeftRight",
      hint: "Choose what you can give or what you want. The other side shows cards connected through the same trader.",
    },
    {
      id: "wtb",
      label: "WTB",
      icon: "bag",
      hint: "Pick cards for sale on the right, compare sellers below, then copy a Discord name to contact them.",
    },
    {
      id: "wts",
      label: "WTS",
      icon: "tag",
      hint: "Pick your cards on the left to see who is looking to buy them, with bids where stated.",
    },
  ];

  const byKey = new Map(cards.map((card) => [card.key, card]));

  window.SAMPLE = { cards, byKey, tools, mine, theirs, posts, prices, modes };
})();
