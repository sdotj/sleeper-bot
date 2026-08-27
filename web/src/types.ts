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
