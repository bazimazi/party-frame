/**
 * The join panel: a QR code, the room code, and the URL as a last resort.
 *
 * This is the single most important element on the shared screen, so it is also
 * the most defensive one:
 *
 * - The QR is rendered at high error correction and painted on pure white with
 *   a quiet zone, because TV panels and phone cameras are both unforgiving.
 * - The room code is always shown, spaced out and in a large monospace face, so
 *   a phone with a broken camera can still join by typing four characters.
 * - If the shared screen is being viewed on `localhost`, the QR would encode an
 *   address that resolves to the *phone* rather than the laptop. That is called
 *   out explicitly instead of silently producing a code that cannot work.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "../i18n/I18nProvider.js";
import { buildJoinUrl, isLoopbackHost } from "../net/endpoint.js";

export function QrPanel({ roomCode, publicBaseUrl }: { roomCode: string; publicBaseUrl?: string }) {
  const t = useT();
  const [dataUrl, setDataUrl] = useState<string>("");
  const joinUrl = roomCode ? buildJoinUrl(roomCode, publicBaseUrl) : "";
  const loopback = !publicBaseUrl && isLoopbackHost();

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;

    void QRCode.toDataURL(joinUrl, {
      // "H" survives a camera at an angle across a room and a slightly dirty TV.
      errorCorrectionLevel: "H",
      margin: 2,
      width: 720,
      color: { dark: "#0b0913", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // The room code below is a complete fallback, so a failed render is a
        // degraded experience rather than a broken one.
        if (!cancelled) setDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  return (
    <aside className="qr-panel">
      <h2 className="qr-panel__title">{t("host.scanToJoin")}</h2>

      <div className="qr-panel__frame">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR code linking to ${joinUrl}`} width={360} height={360} />
        ) : (
          <div className="qr-panel__placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="qr-panel__code">
        <span className="qr-panel__code-label">{t("host.roomLabel")}</span>
        <strong className="qr-panel__code-value">{roomCode.split("").join(" ")}</strong>
      </div>

      <p className="qr-panel__url">
        <span className="qr-panel__url-label">{t("host.orVisit")}</span>
        <span className="qr-panel__url-value">{joinUrl.replace(/^https?:\/\//, "")}</span>
      </p>

      {loopback && (
        <p className="qr-panel__warning" role="note">
          This screen is on <code>localhost</code>, so the QR code will not work from a
          phone. Reopen it on this machine&apos;s network address (for example
          <code> http://192.168.1.5:5173/game</code>) and the code will point there.
        </p>
      )}
    </aside>
  );
}
