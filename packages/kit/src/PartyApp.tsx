/**
 * Default host + join shell.
 *
 * A host app that only needs the built-in routes can render `<PartyApp />`
 * after `bindKit()`. Apps with their own router should render `<PartyRoutes />`
 * inside it instead.
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { HostRoute } from "./shared-screen/HostRoute.js";
import { JoinLanding } from "./controller/JoinLanding.js";
import { JoinRoute } from "./controller/JoinRoute.js";
import { I18nProvider } from "./i18n/I18nProvider.js";

export function PartyRoutes() {
  return (
    <I18nProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/game" replace />} />
        <Route path="/game" element={<HostRoute />} />
        <Route path="/join" element={<JoinLanding />} />
        <Route path="/join/:code" element={<JoinRoute />} />
      </Routes>
    </I18nProvider>
  );
}

export function PartyApp() {
  return (
    <BrowserRouter>
      <PartyRoutes />
    </BrowserRouter>
  );
}
