# Contributing

This is an npm workspaces monorepo. Only `@bazimazi/partyframe-server` and
`@bazimazi/partyframe-client` are published. `protocol`, `game-core`, and `i18n` stay
private and are bundled into those two.

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

## Publishing

The first publish of a new package requires **account 2FA and an OTP**. A
granular token can update packages that already exist; it cannot create these
two names. Tokens in `.env.local` are ignored.

1. On the **bazimazi** account, enable [two-factor authentication](https://www.npmjs.com/settings/~/tfa) (authenticator app or Windows Hello).
2. From the repo root:

```powershell
npm login
npm whoami
```

`npm whoami` must print `bazimazi`.
3. Publish with a fresh authenticator code each time:

```powershell
npm test
npm run build
npm publish -w @bazimazi/partyframe-server --access public --otp=123456
npm publish -w @bazimazi/partyframe-client --access public --otp=123456
```

Do not publish `protocol`, `game-core`, `i18n`, the root workspace, or the
example. Those three are `bundleDependencies` of the server and client packages,
so they ship inside those tarballs and never get their own npm pages.
