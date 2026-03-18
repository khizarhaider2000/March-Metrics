// ─── API client ───────────────────────────────────────────────────────────────
// All requests go through the Next.js proxy: /api/* → http://localhost:8000/api/*

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const search = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await fetch(`/api${path}${search}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TeamBase {
  team_id: number;
  team_name: string;
  seed: number | null;
  region: string | null;
  conference: string | null;
  record_wins: number;
  record_losses: number;
  record: string; // computed by backend: "W-L"
}

// ─── /profiles ────────────────────────────────────────────────────────────────

export interface ProfileOut {
  name: string;
  description: string | null;
  is_custom: boolean;
  weights: Record<string, number>;
}

export interface ProfilesResponse {
  count: number;
  profiles: ProfileOut[];
}

// ─── /teams ───────────────────────────────────────────────────────────────────

export interface TeamOut extends TeamBase {
  season: number;
}

export interface TeamsResponse {
  season: number;
  count: number;
  teams: TeamOut[];
}

// ─── /rankings ────────────────────────────────────────────────────────────────

export interface RankedTeam extends TeamBase {
  season: number;
  rank: number;
  march_score: number;
  metric_percentiles: Record<string, number>;
  raw_metrics: Record<string, number | null>;
}

export interface RankingsResponse {
  profile: string;
  season: number;
  count: number;
  teams: RankedTeam[];
}

// ─── /matchup ─────────────────────────────────────────────────────────────────

export interface MatchupTeamOut extends TeamBase {
  march_score: number;
}

export interface CategoryEdgeOut {
  category: string;
  label: string;
  team_a_score: number;
  team_b_score: number;
  gap: number;
  edge_strength: string;
  winner_name: string | null;
}

export interface MatchupResponse {
  profile: string;
  winner: MatchupTeamOut;
  loser: MatchupTeamOut;
  score_gap: number;
  confidence: string;
  top_reasons: string[];
  explanation: string;
  category_edges: CategoryEdgeOut[];
}

// ─── /bracket ─────────────────────────────────────────────────────────────────

export interface BracketTeamOut extends TeamBase {}

export interface BracketGameOut {
  game_id: number;
  round_num: number;
  round_name: string;
  region: string | null;
  slot: number;
  team_a: BracketTeamOut | null;
  team_b: BracketTeamOut | null;
  winner: BracketTeamOut | null;
  loser: BracketTeamOut | null;
  winner_march_score: number | null;
  loser_march_score: number | null;
  score_gap: number | null;
  confidence: string | null;
  top_reasons: string[];
  explanation: string;
  category_edges: Record<string, unknown>[];
}

export interface BracketRoundOut {
  round_num: number;
  round_name: string;
  games: BracketGameOut[];
}

export interface BracketResponse {
  profile: string;
  season: number;
  bracket_size: number;
  champion: BracketTeamOut | null;
  rounds: BracketRoundOut[];
}

// ─── /teams/{team_id} ─────────────────────────────────────────────────────────

export interface MetricsDict {
  adj_em:      number | null;
  adj_o:       number | null;
  adj_d:       number | null;
  efg_pct:     number | null;
  opp_efg_pct: number | null;
  to_pct:      number | null;
  opp_to_pct:  number | null;
  orb_pct:     number | null;
  drb_pct:     number | null;
  ft_rate:     number | null;
  tempo:       number | null;
  sos:         number | null;
}

export interface TeamDetailOut extends TeamBase {
  season: number;
  metrics: MetricsDict;
}

// ─── API functions ────────────────────────────────────────────────────────────

export const api = {
  profiles: () =>
    get<ProfilesResponse>("/profiles"),

  teams: (season: number) =>
    get<TeamsResponse>("/teams", { season: String(season) }),

  teamById: (id: number) =>
    get<TeamDetailOut>(`/teams/${id}`),

  rankings: (season: number, profile: string) =>
    get<RankingsResponse>("/rankings", { season: String(season), profile }),

  matchup: (teamAId: number, teamBId: number, profile: string) =>
    get<MatchupResponse>("/matchup", {
      team_a_id: String(teamAId),
      team_b_id: String(teamBId),
      profile,
    }),

  bracket: (season: number, profile: string) =>
    get<BracketResponse>("/bracket", { season: String(season), profile }),
};
