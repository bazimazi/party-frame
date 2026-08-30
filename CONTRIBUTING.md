# Contributing

This is an npm workspaces monorepo. Published packages live in `packages/*`.
The runnable sample is `examples/minimal`.

## Develop

```bash
npm install
npm test
npm run build
npm run example
```

`npm run example` builds the packages, then starts the Colyseus server on port
2567 and the Vite app on port 5173. Open the TV at
`http://<this-machine>:5173/game` — not `localhost`, or phones cannot scan the
QR code.

## Package roles

Hosts install `@party-frame/runtime` on the server and `@party-frame/kit` in
the web app. Game authors write against `@party-frame/game-core`.
`@party-frame/protocol` and `@party-frame/i18n` are implementation packages.

## Publishing

1. Create the `@party-frame` org on npm.
2. Set `"private": false` on the packages you are releasing.
3. Publish with a changeset/release workflow, or from each `packages/*`
   directory. `publishConfig.access` is already `public`.
4. Internal deps are pinned to real versions (`0.1.0`), not `*`.
