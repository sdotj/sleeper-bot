// Mirrors the SleepBot domain types the HTTP API returns (src/adapters/LeagueAdapter.ts).

export interface League {
  id: string;
  platform: string;
  sleeperLeagueId?: string;
}

export interface PlayerRef {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

export interface Roster {
  rosterId: number;
  ownerName: string;
  isYou: boolean;
  starters: PlayerRef[];
  bench: PlayerRef[];
  reserve: PlayerRef[];
  taxi: PlayerRef[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface StandingRow {
  rank: number;
  rosterId: number;
  ownerName: string;
  isYou: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface Matchup {
  week: number;
  matchupId: number;
  rosterId: number;
  ownerName: string;
  isYou: boolean;
  points: number;
  starters: PlayerRef[];
}

export interface AuthStatus {
  state: "ok" | "needs-reauth";
  user?: string;
  expiresAt?: number;
  secondsRemaining?: number;
}

export interface AuditEvent {
  id: string;
  actionId: string;
  leagueId: string;
  type: "proposed" | "executed" | "rejected" | "failed";
  actor: "user" | "rule" | "auto";
  at: number;
  summary: string;
}

// Settings: the editable leagues config (mirrors src/config/schema.ts) and the
// Sleeper write-token status (src/core/context.ts).

export interface LeagueConfig {
  id: string;
  platform: "sleeper" | "espn";
  sleeper?: { leagueId: string; username?: string };
  valueMode: "redraft" | "dynasty";
  agent?: { enabled: boolean; autonomy: "manual" | "auto" };
}

export interface SleepBotConfigDoc {
  leagues: LeagueConfig[];
}

export interface SleeperTokenStatus {
  state: "ok" | "needs-reauth";
  user?: string;
  expiresAt?: number;
  secondsRemaining?: number;
  source: "store" | "env" | "none";
  editable: boolean;
}

export interface Draft {
  draftId: string;
  status: string;
  type: string;
  season: string;
  rounds: number;
  teams: number;
  slotToRosterId: Record<string, number>;
  starterSlots: Record<string, number>;
}

export interface DraftPick {
  round: number;
  pickNo: number;
  slot: number;
  rosterId: number | null;
  playerName: string;
  position: string;
  team: string | null;
}

export interface DraftBoard {
  draft: Draft;
  pickCount: number;
  onTheClock: { pickNo: number; round: number; slot: number; rosterId: number | null } | null;
  recentPicks: DraftPick[];
  yourNextPickNo: number | null;
}

export interface DraftRecommendation {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
  reason: string;
}
