# objekt.my

All-in-one Cosmo tools for [MODHAUS](https://www.mod-haus.com/)' **[Cosmo: the Gate](https://play.google.com/store/apps/details?id=com.modhaus.cosmo)** collectors — trade matching, objekt design, poster generation, and more.

**objekt.my is not affiliated with, endorsed by, or supported by MODHAUS or its artists.**

## Tools

**[Objekt Trade](https://objekt.my/trades)** — Browse and match Cosmo objekt trades. Get auto-matched with other collectors and receive instant Discord notifications.

**[Objekt Maker](https://objekt.my/objekt-maker)** — Design custom Objekts with full front/back control. Add borders, text, logos, signatures, QR codes, then save presets and bulk export.

**[Proofshot](https://objekt.my/proofshot)** — Generate photocard proofshot images for trades and collections.

**[Collection](https://objekt.my/collection)** — Browse and track objekt collection progress by member and season.

**[Objekt Poster](https://objekt.my/post)** — Turn your trade list into a clean, shareable image.

## Stack

- Next.js 16, TypeScript
- Drizzle ORM, PostgreSQL, Redis
- Tailwind CSS 4, shadcn/ui
- Better Auth, Biome, Docker

## Testing & Security

- Node/integration tests: `npm run test:node`
- Component tests: `npm run test:unit`
- Browser smoke tests: `npm run test:e2e`
- Coverage: `npm run test:unit:coverage`

CI now runs validation, component tests, Playwright smoke tests, secret scanning, dependency/container scanning, and OpenGrep SAST before deploy.

See [docs/ci-testing-security.md](docs/ci-testing-security.md) for the GitHub Actions and VPS checklist.

## Acknowledgements

- [objekt-explorer](https://github.com/izrin96/objekt-explorer) for the Subsquid-based Objekt indexer, which powers collection progress lookups and transfer verification.
- [cosmo-web](https://apollo.cafe) for the approach used to proxy objekt images around Cosmo's CloudFront CORS cache poisoning.

## Contact

- Discord: `@sharkbean`
