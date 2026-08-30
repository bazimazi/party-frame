/**
 * Public room codes.
 *
 * A room code is the only thing standing between a passer-by and someone else's
 * game, so it is drawn from a CSPRNG rather than `Math.random`. It is also
 * completely decoupled from the internal Colyseus room id, so the code exposes
 * no information about how many sessions exist or in what order they were made.
 */

import { randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@party-frame/protocol";

/** Draws one candidate code. Uniform over the alphabet, no modulo bias. */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Draws a code that is not already taken.
 *
 * With a 25-character alphabet and length 4 there are 390 625 codes, so
 * collisions are vanishingly rare at party scale, but a retry loop costs
 * nothing and turns "vanishingly rare" into "impossible".
 *
 * Throws rather than returning a duplicate: two live sessions sharing a code
 * would send players to the wrong game, which is worse than a failed create.
 */
export async function generateUniqueRoomCode(
  isTaken: (code: string) => Promise<boolean>,
  attempts = 12,
): Promise<string> {
  for (let i = 0; i < attempts; i += 1) {
    const code = generateRoomCode();
    if (!(await isTaken(code))) return code;
  }
  throw new Error(`Could not find a free room code after ${attempts} attempts`);
}

/** True when a string could be a room code. Cheap pre-check before a lookup. */
export function isRoomCodeShaped(value: string): boolean {
  if (value.length !== ROOM_CODE_LENGTH) return false;
  for (const char of value) {
    if (!ROOM_CODE_ALPHABET.includes(char)) return false;
  }
  return true;
}
