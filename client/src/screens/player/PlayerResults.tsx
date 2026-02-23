import type {
  RoundRevealingState,
  RoundAccoladesState,
  RoundScoreboardState,
  GameOverState,
  GuessResult,
} from '@mmw/shared';
import RankBadge from '../../components/RankBadge';
import AccoladeCard from '../../components/AccoladeCard';
import Leaderboard from '../../components/Leaderboard';
import GuessHistory from '../../components/GuessHistory';
import { socket } from '../../socket';

type ResultState = RoundRevealingState | RoundAccoladesState | RoundScoreboardState | GameOverState;

interface Props {
  state: ResultState;
  game: {
    lastGuessResult: GuessResult | null;
    playAgain: () => void;
    notifications: string[];
  };
}

export default function PlayerResults({ state, game }: Props) {
  const playerId = socket.id || '';
  const isLeader = playerId === state.leaderId;
  const leaderName = state.players.find(p => p.id === state.leaderId)?.name;

  if (state.phase === 'GAME_OVER') {
    const winner = state.scoreboard[0];

    return (
      <div className="min-h-screen flex flex-col items-center p-6">
        <h1 className="text-xl font-bold mb-4 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
          Mark My Words
        </h1>
        <div className="text-center mb-4 animate-scale-in">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-2">The Secret Word Was</p>
          <h1 className="text-4xl font-bold text-accent">{state.secretWord}</h1>
        </div>

        {/* Winner */}
        {winner && (
          <div className="text-center mb-6 animate-bounce-in">
            <p className="text-2xl mb-1">👑</p>
            <p className="text-lg font-bold text-gold">{winner.playerName}</p>
            <p className="text-white/40 text-sm">{winner.totalScore.toLocaleString()} pts</p>
          </div>
        )}

        {/* Final Standings */}
        <div className="w-full max-w-sm mb-6">
          <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">Final Standings</p>
          <Leaderboard scoreboard={state.scoreboard} showRoundScore={false} players={state.players} compact />
        </div>

        {/* All Guesses */}
        {state.guessHistory.length > 0 && (
          <div className="w-full max-w-sm mb-6">
            <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">All Guesses</p>
            <div className="max-h-[40vh] overflow-y-auto rounded-lg">
              <GuessHistory guesses={state.guessHistory} players={state.players} />
            </div>
          </div>
        )}

        {isLeader ? (
          <button onClick={game.playAgain} className="btn-primary text-lg px-12 mt-2">
            Play Again
          </button>
        ) : (
          <p className="text-white/30 text-sm mt-2 animate-pulse">
            Waiting for {leaderName || 'leader'}...
          </p>
        )}
      </div>
    );
  }

  if (state.phase === 'ROUND_REVEALING') {
    const myGuess = state.revealedGuesses.find(g => g.playerId === playerId);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-bold text-white/60 mb-6">Revealing results...</h2>

        {myGuess && (
          <div className="text-center animate-scale-in">
            <p className="text-white/40 text-sm mb-2">Your guess</p>
            <p className="text-xl font-mono font-bold mb-2">"{myGuess.word}"</p>
            <RankBadge rank={myGuess.rank} />
            <p className="text-accent font-mono mt-2">+{myGuess.points}</p>
          </div>
        )}

        {!myGuess && (
          <p className="text-white/30 animate-pulse">You didn't submit a guess this round</p>
        )}
      </div>
    );
  }

  if (state.phase === 'ROUND_ACCOLADES') {
    const myAccolades = state.accolades.filter(a => a.playerId === playerId);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-bold text-white/60 mb-6">Awards</h2>

        {myAccolades.length > 0 ? (
          <div className="space-y-4">
            {myAccolades.map((a, i) => (
              <AccoladeCard key={a.type} accolade={a} index={i} />
            ))}
          </div>
        ) : (
          <p className="text-white/30">No awards for you this round</p>
        )}
      </div>
    );
  }

  if (state.phase === 'ROUND_SCOREBOARD') {
    const myEntry = state.scoreboard.find(e => e.playerId === playerId);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        {myEntry && (
          <div className="text-center mb-6 animate-scale-in">
            <p className="text-4xl font-bold text-accent">#{myEntry.currentPosition}</p>
            <p className="text-white/40 text-sm">{myEntry.totalScore.toLocaleString()} total points</p>
          </div>
        )}

        <Leaderboard scoreboard={state.scoreboard} compact />
      </div>
    );
  }

  return null;
}
