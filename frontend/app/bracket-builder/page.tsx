"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Trophy, Zap, RotateCcw, ChevronDown, Loader2, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, BracketResponse, BracketGameOut, MatchupResponse, ProfileOut } from "@/lib/api";
import { ProfileWeightBars } from "@/components/ui/profile-weight-bars";
import { BracketView } from "@/components/bracket/BracketView";
import { MatchupDrawer } from "@/components/matchup/MatchupDrawer";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILES = [
  { value: "balanced",      label: "Balanced"      },
  { value: "offense-heavy", label: "Offense-Heavy"  },
  { value: "defense-heavy", label: "Defense-Heavy"  },
  { value: "upset-hunter",  label: "Upset Hunter"   },
];

const ROUND_SHORT: Record<string, string> = {
  "First Four":    "First Four",
  "Round of 64":   "R64",
  "Round of 32":   "R32",
  "Sweet Sixteen": "Sweet 16",
  "Elite Eight":   "Elite 8",
  "Final Four":    "Final Four",
  "Championship":  "Championship",
};

const CONFIDENCE_VARIANT: Record<string, "slate" | "blue" | "amber" | "green"> = {
  "toss-up":        "slate",
  "slight edge":    "blue",
  "moderate edge":  "amber",
  "clear favorite": "green",
  "heavy favorite": "green",
};

type BracketTeam = BracketGameOut["team_a"];
type EditableBracketGame = BracketGameOut & {
  suggestedWinnerId: number | null;
};
type EditableBracketRound = Omit<BracketResponse["rounds"][number], "games"> & {
  games: EditableBracketGame[];
};
type EditableBracket = Omit<BracketResponse, "rounds"> & {
  rounds: EditableBracketRound[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUpset(game: BracketGameOut): boolean {
  if (!game.winner || !game.loser) return false;
  return (game.winner.seed ?? 99) > (game.loser.seed ?? 99);
}

function allGames(bracket: BracketResponse): BracketGameOut[] {
  return bracket.rounds.flatMap((r) => r.games);
}

function cloneTeam(team: BracketTeam): BracketTeam {
  return team ? { ...team } : null;
}

function cloneGame(game: EditableBracketGame): EditableBracketGame {
  return {
    ...game,
    team_a: cloneTeam(game.team_a),
    team_b: cloneTeam(game.team_b),
    winner: cloneTeam(game.winner),
    loser: cloneTeam(game.loser),
    top_reasons: [...game.top_reasons],
    category_edges: game.category_edges.map((edge) => ({ ...edge })),
  };
}

function cloneBracket(bracket: EditableBracket): EditableBracket {
  return {
    ...bracket,
    champion: cloneTeam(bracket.champion),
    rounds: bracket.rounds.map((round) => ({
      ...round,
      games: round.games.map(cloneGame),
    })),
  };
}

function toEditableBracket(bracket: BracketResponse): EditableBracket {
  return {
    ...bracket,
    champion: null, // no champion until user fills all rounds
    rounds: bracket.rounds.map((round) => ({
      ...round,
      games: round.games.map((game) => {
        // R64 (round 1) and First Four (round 0) have fixed seedings — keep teams
        const isEarlyRound = game.round_num <= 1;
        // If either team is TBD (First Four not yet played), suppress all simulation data
        const hasTBD = !game.team_a || !game.team_b;
        return {
          ...game,
          // Strip teams from later rounds — they earn their spot via picks
          team_a: isEarlyRound ? game.team_a : null,
          team_b: isEarlyRound ? game.team_b : null,
          // No suggestion for TBD games — First Four hasn't been played yet
          suggestedWinnerId: hasTBD ? null : (game.winner?.team_id ?? null),
          winner: null,
          loser: null,
          winner_march_score: null,
          loser_march_score: null,
          // Keep pre-computed matchup data only for R64 games with both teams known
          score_gap: (isEarlyRound && !hasTBD) ? game.score_gap : null,
          confidence: (isEarlyRound && !hasTBD) ? game.confidence : null,
          top_reasons: (isEarlyRound && !hasTBD) ? game.top_reasons : [],
          explanation: (isEarlyRound && !hasTBD) ? game.explanation : "",
        };
      }),
    })),
  };
}

function teamsMatch(a: BracketTeam, b: BracketTeam): boolean {
  return (a?.team_id ?? null) === (b?.team_id ?? null);
}

function participantsMatch(
  teamA: BracketTeam,
  teamB: BracketTeam,
  game: BracketGameOut,
): boolean {
  return teamsMatch(teamA, game.team_a) && teamsMatch(teamB, game.team_b);
}

function scoreBySide(game: BracketGameOut) {
  if (!game.team_a || !game.team_b) {
    return { teamAScore: null, teamBScore: null };
  }

  const winnerId = game.winner?.team_id;
  if (winnerId === game.team_a.team_id) {
    return {
      teamAScore: game.winner_march_score,
      teamBScore: game.loser_march_score,
    };
  }
  if (winnerId === game.team_b.team_id) {
    return {
      teamAScore: game.loser_march_score,
      teamBScore: game.winner_march_score,
    };
  }

  return { teamAScore: null, teamBScore: null };
}

function applyWinnerChoice(
  game: EditableBracketGame,
  winnerId: number,
): EditableBracketGame {
  if (!game.team_a || !game.team_b) return game;

  const { teamAScore, teamBScore } = scoreBySide(game);
  const winnerIsTeamA = game.team_a.team_id === winnerId;
  const winner = winnerIsTeamA ? cloneTeam(game.team_a) : cloneTeam(game.team_b);
  const loser = winnerIsTeamA ? cloneTeam(game.team_b) : cloneTeam(game.team_a);

  return {
    ...game,
    winner,
    loser,
    winner_march_score: winnerIsTeamA ? teamAScore : teamBScore,
    loser_march_score: winnerIsTeamA ? teamBScore : teamAScore,
  };
}

function firstFourFeedSlot(seed: number | null | undefined): number | null {
  if (seed === 16) return 1;
  if (seed === 11) return 5;
  return null;
}

function findGameById(
  bracket: EditableBracket | null,
  gameId: number | null,
): EditableBracketGame | null {
  if (!bracket || gameId == null) return null;
  for (const round of bracket.rounds) {
    const match = round.games.find((game) => game.game_id === gameId);
    if (match) return match;
  }
  return null;
}

function buildSuggestedGame(
  baseGame: EditableBracketGame,
  teamA: NonNullable<BracketTeam>,
  teamB: NonNullable<BracketTeam>,
  matchup: MatchupResponse,
): EditableBracketGame {
  const suggestedWinnerIsA = matchup.winner.team_id === teamA.team_id;
  const teamAScore = suggestedWinnerIsA ? matchup.winner.march_score : matchup.loser.march_score;
  const teamBScore = suggestedWinnerIsA ? matchup.loser.march_score : matchup.winner.march_score;

  return {
    ...baseGame,
    team_a: cloneTeam(teamA),
    team_b: cloneTeam(teamB),
    winner: suggestedWinnerIsA ? cloneTeam(teamA) : cloneTeam(teamB),
    loser: suggestedWinnerIsA ? cloneTeam(teamB) : cloneTeam(teamA),
    suggestedWinnerId: matchup.winner.team_id,
    winner_march_score: suggestedWinnerIsA ? teamAScore : teamBScore,
    loser_march_score: suggestedWinnerIsA ? teamBScore : teamAScore,
    score_gap: matchup.score_gap,
    confidence: matchup.confidence,
    top_reasons: [...matchup.top_reasons],
    explanation: matchup.explanation,
    category_edges: matchup.category_edges.map((edge) => ({ ...edge })),
  };
}

async function rebuildBracket(
  baseBracket: EditableBracket,
  overrides: Record<number, number>,
  getMatchup: (teamAId: number, teamBId: number) => Promise<MatchupResponse>,
  applyUnpickedSuggestions = false,
): Promise<EditableBracket> {
  const next = cloneBracket(baseBracket);
  const roundsByNumber = new Map(next.rounds.map((round) => [round.round_num, round]));

  const roundZero = roundsByNumber.get(0);
  const playInWinners = new Map<string, BracketTeam>();
  if (roundZero) {
    roundZero.games = roundZero.games
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((game) => {
        const winnerId = overrides[game.game_id] ?? (applyUnpickedSuggestions ? game.suggestedWinnerId ?? undefined : undefined);
        const resolved = winnerId ? applyWinnerChoice(game, winnerId) : { ...game, winner: null, loser: null };
        if (resolved.region && resolved.winner?.seed != null) {
          playInWinners.set(`${resolved.region}:${resolved.winner.seed}`, cloneTeam(resolved.winner));
        }
        return resolved;
      });
  }

  for (const round of next.rounds.slice().sort((a, b) => a.round_num - b.round_num)) {
    if (round.round_num === 0) continue;

    const baseRound = baseBracket.rounds.find((entry) => entry.round_num === round.round_num);
    if (!baseRound) continue;

    const sortedBaseGames = baseRound.games.slice().sort((a, b) => a.slot - b.slot);
    const sortedGames = round.games.slice().sort((a, b) => a.slot - b.slot);

    if (round.round_num === 1) {
      round.games = await Promise.all(sortedGames.map(async (game, index) => {
        const baseGame = sortedBaseGames[index];
        const teamASeed = baseGame.team_a?.seed;
        const teamBSeed = baseGame.team_b?.seed;
        const playInA = firstFourFeedSlot(teamASeed)
          ? playInWinners.get(`${baseGame.region}:${teamASeed}`)
          : null;
        const playInB = firstFourFeedSlot(teamBSeed)
          ? playInWinners.get(`${baseGame.region}:${teamBSeed}`)
          : null;
        const teamA = cloneTeam(playInA ?? baseGame.team_a);
        const teamB = cloneTeam(playInB ?? baseGame.team_b);

        if (!teamA || !teamB) return baseGame;

        const suggestedGame = participantsMatch(teamA, teamB, baseGame)
          ? cloneGame(baseGame)
          : buildSuggestedGame(baseGame, teamA, teamB, await getMatchup(teamA.team_id, teamB.team_id));

        const winnerId = overrides[game.game_id] ?? (applyUnpickedSuggestions ? suggestedGame.suggestedWinnerId ?? undefined : undefined);
        if (winnerId && [teamA.team_id, teamB.team_id].includes(winnerId)) {
          return applyWinnerChoice(suggestedGame, winnerId);
        }
        return { ...suggestedGame, winner: null, loser: null };
      }));
      continue;
    }

    if (round.round_num >= 2 && round.round_num <= 4) {
      const previousRound = roundsByNumber.get(round.round_num - 1);
      round.games = await Promise.all(sortedGames.map(async (game, index) => {
        const baseGame = sortedBaseGames[index];
        const prevGames = previousRound?.games
          .filter((entry) => entry.region === game.region)
          .sort((a, b) => a.slot - b.slot) ?? [];
        const teamA = cloneTeam(prevGames[(game.slot - 1) * 2]?.winner ?? null);
        const teamB = cloneTeam(prevGames[(game.slot - 1) * 2 + 1]?.winner ?? null);

        if (!teamA || !teamB) return baseGame;

        const suggestedGame = participantsMatch(teamA, teamB, baseGame)
          ? cloneGame(baseGame)
          : buildSuggestedGame(baseGame, teamA, teamB, await getMatchup(teamA.team_id, teamB.team_id));

        const winnerId = overrides[game.game_id] ?? (applyUnpickedSuggestions ? suggestedGame.suggestedWinnerId ?? undefined : undefined);
        if (winnerId && [teamA.team_id, teamB.team_id].includes(winnerId)) {
          return applyWinnerChoice(suggestedGame, winnerId);
        }
        return { ...suggestedGame, winner: null, loser: null };
      }));
      continue;
    }

    if (round.round_num === 5) {
      const eliteEight = roundsByNumber.get(4);
      const regionChamps = new Map(
        eliteEight?.games.map((game) => [game.region, cloneTeam(game.winner)]) ?? [],
      );

      round.games = await Promise.all(sortedGames.map(async (game, index) => {
        const baseGame = sortedBaseGames[index];
        const pairing = game.slot === 1
          ? [regionChamps.get("East") ?? null, regionChamps.get("West") ?? null]
          : [regionChamps.get("South") ?? null, regionChamps.get("Midwest") ?? null];
        const [teamA, teamB] = pairing;

        if (!teamA || !teamB) return baseGame;

        const suggestedGame = participantsMatch(teamA, teamB, baseGame)
          ? cloneGame(baseGame)
          : buildSuggestedGame(baseGame, teamA, teamB, await getMatchup(teamA.team_id, teamB.team_id));

        const winnerId = overrides[game.game_id] ?? (applyUnpickedSuggestions ? suggestedGame.suggestedWinnerId ?? undefined : undefined);
        if (winnerId && [teamA.team_id, teamB.team_id].includes(winnerId)) {
          return applyWinnerChoice(suggestedGame, winnerId);
        }
        return { ...suggestedGame, winner: null, loser: null };
      }));
      continue;
    }

    if (round.round_num === 6) {
      const finalFour = roundsByNumber.get(5);
      const ffGames = finalFour?.games.slice().sort((a, b) => a.slot - b.slot) ?? [];
      const baseGame = sortedBaseGames[0];
      const teamA = cloneTeam(ffGames[0]?.winner ?? null);
      const teamB = cloneTeam(ffGames[1]?.winner ?? null);

      if (!teamA || !teamB) {
        round.games = [baseGame];
        continue;
      }

      const suggestedGame = participantsMatch(teamA, teamB, baseGame)
        ? cloneGame(baseGame)
        : buildSuggestedGame(baseGame, teamA, teamB, await getMatchup(teamA.team_id, teamB.team_id));

      const winnerId = overrides[baseGame.game_id] ?? (applyUnpickedSuggestions ? suggestedGame.suggestedWinnerId ?? undefined : undefined);
      round.games = [
        winnerId && [teamA.team_id, teamB.team_id].includes(winnerId)
          ? applyWinnerChoice(suggestedGame, winnerId)
          : { ...suggestedGame, winner: null, loser: null },
      ];
    }
  }

  const championship = roundsByNumber.get(6)?.games[0] ?? null;
  next.champion = cloneTeam(championship?.winner ?? null);
  return next;
}

// ─── Champion path strip ──────────────────────────────────────────────────────

function ChampionPath({
  bracket,
  champion,
  onGameClick,
}: {
  bracket:     EditableBracket;
  champion:    BracketTeam | null;
  onGameClick: (g: BracketGameOut) => void;
}) {
  if (!champion) return null;

  const path = bracket.rounds
    .flatMap((r) => r.games)
    .filter((g) => g.winner?.team_id === champion.team_id)
    .sort((a, b) => a.round_num - b.round_num);

  if (path.length === 0) return null;

  return (
    <SectionCard
      title="Champion's Path"
      description={`${champion.team_name} · ${path.length} wins`}
    >
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {path.map((game) => {
          const opp = game.winner?.team_id === game.team_a?.team_id ? game.team_b : game.team_a;
          const upset = isUpset(game);
          return (
            <button
              key={game.game_id}
              onClick={() => onGameClick(game)}
              className="shrink-0 w-40 rounded-xl border border-surface-border bg-surface-overlay p-3 space-y-1.5 text-left hover:border-brand/40 hover:bg-surface-card transition-colors focus:outline-none focus:ring-1 focus:ring-brand/40"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-2xs text-slate-500 font-medium truncate">
                  {ROUND_SHORT[game.round_name] ?? game.round_name}
                </span>
                {game.score_gap != null && (
                  <span className="text-2xs font-mono text-slate-600">+{game.score_gap.toFixed(1)}</span>
                )}
              </div>
              <div className="space-y-px">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-brand-light font-mono text-2xs">W</span>
                  <span className="text-white font-medium truncate">
                    {champion.team_name.split(" ").at(-1)}
                  </span>
                </div>
                {opp && (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-700 font-mono text-2xs">L</span>
                    <span className="text-slate-500 truncate">
                      #{opp.seed} {opp.team_name.split(" ").at(-1)}
                    </span>
                  </div>
                )}
              </div>
              {game.confidence && (
                <Badge variant={CONFIDENCE_VARIANT[game.confidence] ?? "slate"} className="text-2xs w-full justify-center">
                  {game.confidence}
                  {upset && " · upset"}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function BracketSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 px-5 py-4 flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="rounded-xl border border-surface-border bg-surface-card p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          {Array.from({ length: 9 }).map((_, col) => (
            <div key={col} className="flex flex-col gap-2" style={{ width: 168 }}>
              <Skeleton className="h-4 w-20 mx-auto" />
              {Array.from({ length: col === 4 ? 3 : 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

function BracketBuilderContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlProfile   = searchParams.get("profile") ?? "balanced";
  const urlSeason    = Number(searchParams.get("season")) || 2026;

  const [profile, setProfile]     = useState(urlProfile);
  const season                    = urlSeason;
  const [baseBracket, setBaseBracket] = useState<EditableBracket | null>(null);
  const [bracket, setBracket]     = useState<EditableBracket | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const [pickedWinners, setPickedWinners] = useState<Record<number, number>>({});
  const [activeGameId, setActiveGameId] = useState<number | null>(null);
  const [profilesData, setProfilesData] = useState<ProfileOut[]>([]);
  const matchupCacheRef = useRef<Map<string, MatchupResponse>>(new Map());

  useEffect(() => {
    api.profiles().then((r) => setProfilesData(r.profiles)).catch(() => {});
  }, []);

  const activeProfileWeights = profilesData.find((p) => p.name === profile)?.weights ?? {};

  const activeGame = useMemo(
    () => findGameById(bracket, activeGameId),
    [activeGameId, bracket],
  );

  async function getMatchup(teamAId: number, teamBId: number, currentProfile = profile) {
    const key = `${currentProfile}:${teamAId}:${teamBId}`;
    const cached = matchupCacheRef.current.get(key);
    if (cached) return cached;

    const result = await api.matchup(teamAId, teamBId, currentProfile);
    matchupCacheRef.current.set(key, result);
    return result;
  }

  async function fetchBracket(p = profile) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.bracket(season, p);
      const editable = toEditableBracket(data);
      setBaseBracket(editable);
      setBracket(editable);
      setPickedWinners({});
      setActiveGameId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function autoFillBracket() {
    if (!baseBracket) return;
    setLoading(true);
    setError(null);
    try {
      const rebuilt = await rebuildBracket(
        baseBracket,
        pickedWinners,
        (teamAId, teamBId) => getMatchup(teamAId, teamBId, profile),
        true, // fill unpicked games with suggestions
      );
      // Persist the auto-filled picks so subsequent manual changes don't wipe them
      const allFilled: Record<number, number> = {};
      for (const round of rebuilt.rounds) {
        for (const game of round.games) {
          if (game.winner) allFilled[game.game_id] = game.winner.team_id;
        }
      }
      setPickedWinners(allFilled);
      setBracket(rebuilt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchBracket(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changeProfile(p: string) {
    setProfile(p);
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", p);
    router.replace(`/bracket-builder?${params}`, { scroll: false });
    matchupCacheRef.current.clear(); // clear cache so drawer re-fetches with new profile
  }

  function reset() {
    fetchBracket(profile);
  }

  async function updatePick(gameId: number, winnerId: number | null) {
    if (!baseBracket) return;

    const nextOverrides = { ...pickedWinners };
    if (winnerId == null) delete nextOverrides[gameId];
    else nextOverrides[gameId] = winnerId;

    setLoading(true);
    setPickedWinners(nextOverrides);
    try {
      const rebuilt = await rebuildBracket(baseBracket, nextOverrides, (teamAId, teamBId) => getMatchup(teamAId, teamBId, profile));
      setBracket(rebuilt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    if (!bracket) return null;
    const games  = allGames(bracket);
    const upsets = games.filter(isUpset);
    const biggestUpset = upsets.reduce<BracketGameOut | null>((best, g) => {
      if (!g.winner?.seed) return best;
      if (!best?.winner?.seed) return g;
      return g.winner.seed > best.winner.seed ? g : best;
    }, null);
    const played  = games.filter((g) => g.winner != null);
    const avgGap  = played.length > 0
      ? played.reduce((s, g) => s + (g.score_gap ?? 0), 0) / played.length
      : 0;
    // Derive champion from the championship game winner (user-picked)
    const champGame = bracket.rounds.find((r) => r.round_name === "Championship")?.games?.[0];
    const champion = champGame?.winner ?? null;
    return {
      upsets: upsets.length,
      biggestUpset,
      avgGap,
      pickedGames: played.length,
      totalGames: games.length,
      champion,
    };
  }, [bracket]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Bracket Builder"
        subtitle={`Click any matchup to see stats & a suggestion · profile: ${profile}`}
        badge={<Badge variant="amber" dot>{season} NCAA Tournament</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                className="appearance-none bg-surface-card border border-surface-border text-slate-300 text-xs rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/50"
                value={profile}
                onChange={(e) => changeProfile(e.target.value)}
              >
                {PROFILES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>
            <button
              onClick={reset}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card hover:bg-surface-overlay border border-surface-border text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button
              onClick={autoFillBracket}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {loading ? "Simulating…" : "Auto-Fill"}
            </button>
          </div>
        }
      />

      {/* ── Active profile weight breakdown ────────────────────────────────── */}
      {Object.keys(activeProfileWeights).length > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {PROFILES.find((p) => p.value === profile)?.label ?? profile} — stat weights
            </span>
          </div>
          <ProfileWeightBars weights={activeProfileWeights} />
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error} — is the backend running?
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {loading && !bracket && <BracketSkeleton />}

      {/* ── Loaded bracket ─────────────────────────────────────────────────── */}
      {bracket && (
        <div className="space-y-5">

          {/* Champion callout */}
          <div className="rounded-xl border border-amber-900/40 bg-amber-950/15 px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-900/40 border border-amber-800/40 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-2xs text-amber-500/80 uppercase tracking-widest font-semibold">
                {stats?.champion ? "Your Champion" : "Champion"}
              </p>
              {stats?.champion
                ? <>
                    <p className="text-lg font-bold text-white mt-0.5 truncate">{stats.champion.team_name}</p>
                    <p className="text-xs text-slate-400">
                      #{stats.champion.seed} {stats.champion.region} · {bracket.profile} profile
                    </p>
                  </>
                : <p className="text-sm text-slate-500 mt-0.5 italic">Fill out the bracket to crown a champion</p>
              }
            </div>
            {stats && (
              <div className="ml-auto hidden sm:flex items-center gap-5 text-xs text-slate-500 shrink-0">
                <div className="text-center">
                  <p className="text-base font-bold text-slate-300 font-mono">{stats.pickedGames}<span className="text-xs text-slate-600">/{stats.totalGames}</span></p>
                  <p className="text-2xs">picked</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-base font-bold font-mono", stats.upsets > 0 ? "text-orange-400" : "text-slate-300")}>
                    {stats.upsets}
                  </p>
                  <p className="text-2xs">upsets</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-300 font-mono">{stats.avgGap.toFixed(1)}</p>
                  <p className="text-2xs">avg gap</p>
                </div>
              </div>
            )}
          </div>

          {/* Biggest upset banner */}
          {stats?.biggestUpset && (
            <div className="rounded-lg border border-orange-900/40 bg-orange-950/10 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-xs text-slate-400">
                <span className="text-orange-300 font-semibold">Biggest upset: </span>
                #{stats.biggestUpset.winner?.seed} {stats.biggestUpset.winner?.team_name.split(" ").at(-1)} over
                #{stats.biggestUpset.loser?.seed} {stats.biggestUpset.loser?.team_name.split(" ").at(-1)} — {stats.biggestUpset.round_name}
              </p>
            </div>
          )}

          {/* Champion path */}
          <ChampionPath bracket={bracket} champion={stats?.champion ?? null} onGameClick={(game) => setActiveGameId(game.game_id)} />

          {/* Bracket hint */}
          <p className="text-2xs text-slate-600 text-center">
            Click any matchup node to open analysis and choose your winner
          </p>

          {/* Visual bracket */}
          <SectionCard padded={false}>
            <div className="p-4">
              <BracketView bracket={bracket} onGameClick={(game) => setActiveGameId(game.game_id)} />
            </div>
          </SectionCard>

        </div>
      )}

      {/* ── Matchup drawer ─────────────────────────────────────────────────── */}
      <MatchupDrawer
        game={activeGame}
        profile={profile}
        currentWinnerId={activeGame?.winner?.team_id ?? null}
        suggestedWinnerId={activeGame?.suggestedWinnerId ?? null}
        onPickWinner={(winnerId) => {
          if (activeGame) void updatePick(activeGame.game_id, winnerId);
        }}
        onUseSuggestion={() => {
          if (activeGame) void updatePick(activeGame.game_id, null);
        }}
        onClose={() => setActiveGameId(null)}
      />

    </div>
  );
}

export default function BracketBuilderPage() {
  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <Suspense>
        <BracketBuilderContent />
      </Suspense>
    </div>
  );
}
