# Minimal host

The smallest app that uses partyframe: one server, one web bundle, one game
(Tap Race — first to 10 taps).

```bash
# from the repo root, after npm install
npm run example
```

Then open `http://<this-machine>:5173/game` on the shared screen. If port 2567
is already taken, set `PORT` and `VITE_SERVER_PORT` to a free port.
