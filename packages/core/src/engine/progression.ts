import type { GameState } from "../domain/gameState";
import type { GameSystem } from "../domain/scenario";

/** XP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(system: GameSystem, level: number): number {
  return Math.round(system.xpCurve.base * Math.pow(system.xpCurve.growth, level - 1));
}

export interface LevelUp {
  level: number;
  skillPoints: number;
  attributePoints: number;
}

/** Adds XP and resolves level-ups. Returns every level gained this call. */
export function grantXp(state: GameState, system: GameSystem, amount: number): LevelUp[] {
  if (!system.enabled || !system.modules.experience || amount <= 0) return [];
  const player = state.player;
  player.xp += Math.round(amount);
  const gained: LevelUp[] = [];
  if (!system.modules.levels) return gained;
  while (player.level < system.maxLevel && player.xp >= xpToNextLevel(system, player.level)) {
    player.xp -= xpToNextLevel(system, player.level);
    player.level += 1;
    const skillPoints = system.modules.skillPoints ? system.skillPointsPerLevel : 0;
    const attributePoints = system.modules.attributePoints ? system.attributePointsPerLevel : 0;
    player.skillPoints += skillPoints;
    player.attributePoints += attributePoints;
    gained.push({ level: player.level, skillPoints, attributePoints });
  }
  return gained;
}
