/**
 * Message channels and payload schemas for the client -> server direction.
 *
 * Two separate channels keep the platform generic: `session-action` is owned by
 * the platform and is identical for every game, while `game-action` is opaque to
 * the platform and validated by whichever game plugin is loaded.
 */

import { z } from "zod";
import {
  ABSOLUTE_MAX_PLAYERS,
  AVATARS,
  PLAYER_COLORS,
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./constants.js";
import type { ClientRole } from "./session.js";

/** Named message channels. Using constants avoids typo-driven silent drops. */
export const MSG = {
  /** client -> server: platform-level intent (ready, start, rematch, ...). */
  SESSION_ACTION: "session-action",
  /** client -> server: game-specific intent, shape defined by the game plugin. */
  GAME_ACTION: "game-action",
  /** client -> server: clock synchronisation probe. */
  CLOCK_PING: "clock-ping",

  /** server -> client: reply to `CLOCK_PING`. */
  CLOCK_PONG: "clock-pong",
  /** server -> client: identity assigned at join time. */
  WELCOME: "welcome",
  /** server -> single client: the phone's current controller projection. */
  CONTROLLER_STATE: "controller-state",
  /** server -> all: transient, non-authoritative presentation cue. */
  GAME_EVENT: "game-event",
  /** server -> single client: recoverable failure. */
  ERROR: "error",
} as const;

/**
 * Characters removed from user-supplied text before validation: C0/C1 controls,
 * zero-width and bidi-override marks, line separators and the BOM. These can
 * spoof or break layout on the shared screen, and no legitimate display name
 * needs them.
 */
const UNSAFE_TEXT = new RegExp(
  "[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C" +
    "\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]",
  "gu",
);

/** Room code as it appears in a join URL. Normalised to upper case. */
export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`), "invalid room code");

/**
 * Player display name.
 *
 * Unsafe characters are stripped rather than rejected, so a paste from a phone
 * keyboard does not produce a confusing validation error. Whatever survives must
 * still be a non-empty name of sane length.
 */
export const PlayerNameSchema = z
  .string()
  .transform((value) => value.replace(UNSAFE_TEXT, "").trim())
  .pipe(z.string().min(PLAYER_NAME_MIN).max(PLAYER_NAME_MAX));

export const AvatarSchema = z.enum(AVATARS);
export const ColorSchema = z.enum(PLAYER_COLORS);
export const BotDifficultySchema = z.enum(["easy", "medium", "hard"]);

/** Options accepted by the room on join. */
export const JoinOptionsSchema = z.object({
  role: z.enum(["host", "controller"]),
  /** Present when the host creates a session; ignored for controllers. */
  gameId: z.string().min(1).max(40).optional(),
});
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

export const SessionSettingsPatchSchema = z.object({
  maxPlayers: z.number().int().min(1).max(ABSOLUTE_MAX_PLAYERS).optional(),
  botCount: z.number().int().min(0).max(ABSOLUTE_MAX_PLAYERS).optional(),
  botDifficulty: BotDifficultySchema.optional(),
  gameOptions: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Platform-level actions.
 *
 * Membership in this union only means the payload is well formed. Every variant
 * is separately authorised server-side against the sender and session status.
 */
export const SessionActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set-profile"),
    name: PlayerNameSchema,
    avatar: AvatarSchema,
    color: ColorSchema,
  }),
  z.object({ type: z.literal("set-ready"), ready: z.boolean() }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("start-game") }),
  z.object({ type: z.literal("rematch") }),
  z.object({ type: z.literal("return-to-lobby") }),
  z.object({ type: z.literal("update-settings"), settings: SessionSettingsPatchSchema }),
  z.object({ type: z.literal("kick-player"), playerId: z.string().min(1).max(64) }),
  /** Developer-mode only; rejected outright when the server is in production. */
  z.object({
    type: z.literal("dev-command"),
    command: z.string().min(1).max(40),
    value: z.number().finite().optional(),
  }),
]);
export type SessionAction = z.infer<typeof SessionActionSchema>;

export const ClockPingSchema = z.object({ t0: z.number().finite() });

export interface ClockPong {
  /** Client's own send timestamp, echoed back untouched. */
  t0: number;
  /** Server time when the probe was handled. */
  t1: number;
}

/** Payload of `MSG.WELCOME`. */
export interface WelcomePayload {
  playerId: string;
  role: ClientRole;
  roomId: string;
  roomCode: string;
  reconnectionToken: string;
  gameId: string;
  serverTime: number;
}

/** Presentation-only cue. Never a substitute for authoritative state. */
export interface GameEventMessage {
  /** Stable identifier, e.g. `player-joined` or `bomb-exploded`. */
  kind: string;
  /** i18n key for the shared-screen event feed. */
  messageKey?: string;
  /** Interpolation values for `messageKey`, plus event-specific extras. */
  params?: Record<string, string | number>;
  /** Player this event is about, when applicable. */
  playerId?: string;
  at: number;
}
