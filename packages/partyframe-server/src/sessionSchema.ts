/**
 * Network state shared by every game on the platform.
 *
 * This is the only state the shared screen and the phones synchronise through
 * Colyseus. It is a *projection*: the authoritative truth lives in plain server
 * objects, and this schema is what the wire sees. Keeping the two apart means a
 * game's rules never have to know that Colyseus exists.
 *
 * A session runs exactly one game for its whole lifetime, so each game supplies
 * its own root state class extending `SessionSchema`. That avoids polymorphic
 * schema fields entirely - the encoder always knows the concrete shape.
 */

import { MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") avatar = "";
  @type("string") color = "";
  @type("boolean") isBot = false;
  @type("boolean") isHost = false;
  @type("boolean") connected = true;
  @type("boolean") ready = false;
  @type("number") score = 0;
  @type("number") seat = 0;
  /**
   * False between the socket opening and the player submitting their profile.
   *
   * Unjoined rows still occupy a seat, which is what makes the capacity check
   * and reconnection work, but they are hidden from the lobby.
   */
  @type("boolean") joined = false;
}

export class SettingsSchema extends Schema {
  @type("number") maxPlayers = 8;
  @type("number") botCount = 0;
  @type("string") botDifficulty = "medium";
}

export class SessionSchema extends Schema {
  /** Human-readable code shown on the TV and encoded in the QR image. */
  @type("string") publicCode = "";
  /** One of `SessionStatus`. Stored as a string so adding a status is additive. */
  @type("string") status = "CREATED";
  @type("string") gameId = "";

  /**
   * Server time, refreshed on a slow beacon.
   *
   * Clients do not use this for countdowns - they use the round-trip offset from
   * `clock-ping` - but it gives a late joiner a usable clock before its first
   * probe completes.
   */
  @type("number") serverTime = 0;

  /** Keyed by player id, which for humans is their Colyseus session id. */
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();

  @type(SettingsSchema) settings = new SettingsSchema();

  /** The controller currently holding host powers, or "" when only the TV does. */
  @type("string") hostPlayerId = "";
  /** False while the shared screen is inside its reconnection grace period. */
  @type("boolean") hostConnected = false;

  /** Bumped whenever the game projection changes, for cheap change checks. */
  @type("number") gameRevision = 0;

  /**
   * The active game's public projection, serialised as JSON.
   *
   * This is the default transport for game state: a game returns plain data
   * from `getPublicState()` and the platform ships it, so nothing about
   * Colyseus reaches a game author. It is written only when the projection
   * actually changes, so an idle match produces no patches at all.
   *
   * A game that installs a `GameNetworkAdapter` gets field-level patches on its
   * own schema subclass instead and leaves this field empty.
   */
  @type("string") gameJson = "";
}

/** Assigns only when the value actually differs, keeping Colyseus patches minimal. */
export function setIfChanged<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
): void {
  if (target[key] !== value) target[key] = value;
}
