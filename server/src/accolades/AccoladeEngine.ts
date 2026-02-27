import type { Accolade, AccoladeType, GuessResult } from '@mmw/shared';

interface PlayerHistory {
  bestRankByRound: number[];
}

const WORST_TEMPLATES = [
  `"{word}" — rank #{rank}`,
  `"{word}" at #{rank}`,
];

const EXPLORER_TEMPLATES = [
  `"{word}" — rank #{rank}`,
  `"{word}" at #{rank}. Uncharted territory.`,
];

const CLOSEST_TEMPLATES = [
  `"{word}" — rank #{rank}`,
  `"{word}" at #{rank}`,
];

const GALAXY_TEMPLATES = [
  `"{word}" — rank #{rank}!`,
  `"{word}" at #{rank}!`,
];

function pickTemplate(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)];
}

function fillTemplate(template: string, data: { player: string; word: string; rank: number }): string {
  return template
    .replace(/\{player\}/g, data.player)
    .replace(/\{word\}/g, data.word)
    .replace(/\{rank\}/g, String(data.rank));
}

export class AccoladeEngine {
  private playerHistories: Map<string, PlayerHistory> = new Map();

  reset(): void {
    this.playerHistories.clear();
  }

  rekeyPlayer(oldId: string, newId: string): void {
    const history = this.playerHistories.get(oldId);
    if (history) {
      this.playerHistories.delete(oldId);
      this.playerHistories.set(newId, history);
    }
  }

  recordRound(guesses: GuessResult[]): void {
    for (const guess of guesses) {
      let history = this.playerHistories.get(guess.playerId);
      if (!history) {
        history = { bestRankByRound: [] };
        this.playerHistories.set(guess.playerId, history);
      }
      history.bestRankByRound.push(guess.rank);
    }
  }

  generateAccolades(guesses: GuessResult[], roundNumber: number, prevTeamBest?: number): Accolade[] {
    if (guesses.length === 0) return [];

    const accolades: Accolade[] = [];
    const sorted = [...guesses].sort((a, b) => a.rank - b.rank);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Closest This Round
    accolades.push({
      type: 'closest',
      playerId: best.playerId,
      playerName: best.playerName,
      title: 'Closest This Round',
      description: fillTemplate(pickTemplate(CLOSEST_TEMPLATES), {
        player: best.playerName,
        word: best.word,
        rank: best.rank,
      }),
      icon: '🎯',
      isPositive: true,
    });

    // Galaxy Brain (top 10)
    if (best.rank <= 10 && best.rank > 1) {
      accolades.push({
        type: 'galaxy_brain',
        playerId: best.playerId,
        playerName: best.playerName,
        title: 'Galaxy Brain',
        description: fillTemplate(pickTemplate(GALAXY_TEMPLATES), {
          player: best.playerName,
          word: best.word,
          rank: best.rank,
        }),
        icon: '🧠',
        isPositive: true,
      });
    }

    // Biggest Leap
    if (roundNumber > 1) {
      let biggestLeap = -Infinity;
      let leapPlayer: GuessResult | null = null;

      for (const guess of guesses) {
        const history = this.playerHistories.get(guess.playerId);
        if (history && history.bestRankByRound.length >= 2) {
          const prevBest = history.bestRankByRound[history.bestRankByRound.length - 2];
          const leap = prevBest - guess.rank;
          if (leap > biggestLeap && leap > 0) {
            biggestLeap = leap;
            leapPlayer = guess;
          }
        }
      }

      // Only award if the guess actually beat the team's previous best rank
      const beatTeamBest = leapPlayer && prevTeamBest !== undefined
        ? leapPlayer.rank < prevTeamBest
        : true; // no teamBest info → allow (backwards compat)
      if (leapPlayer && biggestLeap > 50 && beatTeamBest) {
        accolades.push({
          type: 'biggest_leap',
          playerId: leapPlayer.playerId,
          playerName: leapPlayer.playerName,
          title: 'Biggest Leap',
          description: `Improved by ${biggestLeap} ranks`,
          icon: '🚀',
          isPositive: true,
        });
      }

      // On Fire (improved 3+ rounds in a row)
      for (const guess of guesses) {
        const history = this.playerHistories.get(guess.playerId);
        if (history && history.bestRankByRound.length >= 3) {
          const recent = history.bestRankByRound.slice(-3);
          if (recent[0] > recent[1] && recent[1] > recent[2]) {
            accolades.push({
              type: 'on_fire',
              playerId: guess.playerId,
              playerName: guess.playerName,
              title: 'On Fire',
              description: `3 rounds improving in a row`,
              icon: '🔥',
              isPositive: true,
            });
            break;
          }
        }
      }

      // Ice Cold (got worse 3+ rounds in a row)
      for (const guess of guesses) {
        const history = this.playerHistories.get(guess.playerId);
        if (history && history.bestRankByRound.length >= 3) {
          const recent = history.bestRankByRound.slice(-3);
          if (recent[0] < recent[1] && recent[1] < recent[2]) {
            accolades.push({
              type: 'ice_cold',
              playerId: guess.playerId,
              playerName: guess.playerName,
              title: 'Ice Cold',
              description: `3 rounds getting colder`,
              icon: '🥶',
              isPositive: false,
            });
            break;
          }
        }
      }
    }

    // Worst This Round (only if more than 1 player and worst != best)
    if (guesses.length > 1 && worst.playerId !== best.playerId) {
      accolades.push({
        type: 'worst',
        playerId: worst.playerId,
        playerName: worst.playerName,
        title: 'Worst This Round',
        description: fillTemplate(pickTemplate(WORST_TEMPLATES), {
          player: worst.playerName,
          word: worst.word,
          rank: worst.rank,
        }),
        icon: '💀',
        isPositive: false,
      });
    }

    // Brave Explorer (rank > 10000)
    if (worst.rank > 10000) {
      const existing = accolades.find(a => a.type === 'worst' && a.playerId === worst.playerId);
      if (!existing || accolades.length < 4) {
        accolades.push({
          type: 'brave_explorer',
          playerId: worst.playerId,
          playerName: worst.playerName,
          title: 'Brave Explorer',
          description: fillTemplate(pickTemplate(EXPLORER_TEMPLATES), {
            player: worst.playerName,
            word: worst.word,
            rank: worst.rank,
          }),
          icon: '🧭',
          isPositive: false,
        });
      }
    }

    // Return 2-3 accolades, prioritizing variety
    return this.selectBestAccolades(accolades);
  }

  private selectBestAccolades(accolades: Accolade[]): Accolade[] {
    if (accolades.length <= 3) return accolades;

    // Ensure at least 1 positive and 1 negative if available
    const positive = accolades.filter(a => a.isPositive);
    const negative = accolades.filter(a => !a.isPositive);
    const selected: Accolade[] = [];

    if (positive.length > 0) selected.push(positive[0]);
    if (negative.length > 0) selected.push(negative[0]);

    // Fill remaining slot(s)
    const remaining = accolades.filter(a => !selected.includes(a));
    while (selected.length < 3 && remaining.length > 0) {
      selected.push(remaining.shift()!);
    }

    return selected;
  }
}
