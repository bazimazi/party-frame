/**
 * Player setup, the first thing a phone shows after scanning.
 *
 * Everything here is optimised for the twenty seconds between "scanned the code"
 * and "in the game": the name field is focused and pre-filled from the last
 * session, avatar and colour have working defaults, and the join button is
 * always reachable with one thumb.
 */

import { useEffect, useRef, useState } from "react";
import { AVATARS, PLAYER_COLORS, PLAYER_NAME_MAX } from "@partyframe/protocol";
import { haptic, sfx } from "../sfx.js";
import { useT } from "../i18n/I18nProvider.js";
import { loadProfile, saveProfile } from "../net/storage.js";

export interface Profile {
  name: string;
  avatar: (typeof AVATARS)[number];
  color: (typeof PLAYER_COLORS)[number];
}

export function SetupPanel({
  roomCode,
  suggested,
  busy,
  onJoin,
}: {
  roomCode: string;
  /** Server-assigned defaults, used when this phone has no saved profile. */
  suggested: { avatar: string; color: string };
  busy: boolean;
  onJoin: (profile: Profile) => void;
}) {
  const t = useT();
  const stored = useRef(loadProfile()).current;

  const [name, setName] = useState(stored?.name ?? "");
  const [avatar, setAvatar] = useState<(typeof AVATARS)[number]>(
    pickFrom(AVATARS, stored?.avatar ?? suggested.avatar),
  );
  const [color, setColor] = useState<(typeof PLAYER_COLORS)[number]>(
    pickFrom(PLAYER_COLORS, stored?.color ?? suggested.color),
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Set once the player touches a swatch, so their choice is never overwritten. */
  const chosen = useRef({ avatar: Boolean(stored?.avatar), color: Boolean(stored?.color) });

  /**
   * Adopts the server's suggestions when they arrive.
   *
   * The server picks an avatar and colour that nobody else in the room has, but
   * that assignment lands a moment after the socket opens. Without this, three
   * phones opening the form before their rows exist would all default to the
   * same first swatch and everyone would show up on the TV in identical red.
   */
  useEffect(() => {
    if (!chosen.current.avatar && suggested.avatar) {
      setAvatar(pickFrom(AVATARS, suggested.avatar));
    }
    if (!chosen.current.color && suggested.color) {
      setColor(pickFrom(PLAYER_COLORS, suggested.color));
    }
  }, [suggested.avatar, suggested.color]);

  useEffect(() => {
    // Autofocus only when there is nothing to keep: pushing the keyboard up over
    // a pre-filled form makes a returning player scroll to find the button.
    if (!stored?.name) inputRef.current?.focus();
  }, [stored?.name]);

  const trimmed = name.trim();
  const canJoin = trimmed.length > 0 && !busy;

  return (
    <form
      className="setup"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canJoin) return;
        // The first tap is also the gesture that unlocks audio on this phone.
        sfx.unlock();
        haptic(15);
        const profile: Profile = { name: trimmed, avatar, color };
        saveProfile(profile);
        onJoin(profile);
      }}
    >
      <p className="setup__room">{t("join.roomLabel", { code: roomCode })}</p>

      <label className="field">
        <span className="field__label">{t("join.yourName")}</span>
        <input
          ref={inputRef}
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("join.namePlaceholder")}
          maxLength={PLAYER_NAME_MAX}
          autoComplete="nickname"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </label>

      <fieldset className="field setup__group">
        <legend className="field__label">{t("join.chooseAvatar")}</legend>
        <div className="chip-row">
          {AVATARS.map((option) => (
            <button
              key={option}
              type="button"
              className="chip"
              aria-pressed={avatar === option}
              aria-label={option}
              onClick={() => {
                chosen.current.avatar = true;
                setAvatar(option);
                haptic(8);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field setup__group">
        <legend className="field__label">{t("join.chooseColor")}</legend>
        <div className="chip-row">
          {PLAYER_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              className="chip chip--color"
              style={{ background: option }}
              aria-pressed={color === option}
              aria-label={option}
              onClick={() => {
                chosen.current.color = true;
                setColor(option);
                haptic(8);
              }}
            >
              {color === option ? "✓" : ""}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="btn btn--primary btn--big btn--block" disabled={!canJoin}>
        {busy ? t("join.joining") : t("join.joinGame")}
      </button>
    </form>
  );
}

/** Narrows a stored string back into the allowed set, falling back to the first. */
function pickFrom<T extends readonly string[]>(options: T, value: string): T[number] {
  return (options as readonly string[]).includes(value) ? (value as T[number]) : (options[0] as T[number]);
}
