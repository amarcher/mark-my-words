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
import WordConnections from '../../components/WordConnections';
import GuessHistory from '../../components/GuessHistory';
import { socket } from '../../socket';

type ResultState = RoundRevealingState | RoundAccoladesState | RoundScoreboardState | GameOverState;

interface Props {
  state: ResultState;
  game: {
    lastGuessResult: GuessResult | null;
    playAgain: () => void;
    closeRoom: () => void;
    leaveRoom: () => void;
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

        {/* Word Connections */}
        {Object.keys(state.wordBridges).length > 0 && (
          <div className="w-full max-w-sm mb-6">
            <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">How It Connects</p>
            <div className="max-h-[40vh] overflow-y-auto rounded-lg">
              <WordConnections secretWord={state.secretWord} guesses={state.guessHistory} wordBridges={state.wordBridges} />
            </div>
          </div>
        )}

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
          <div className="flex flex-col items-center gap-3 mt-2">
            <button onClick={game.playAgain} className="btn-primary text-lg px-12">
              Play Again
            </button>
            <button onClick={game.closeRoom} className="text-white/30 hover:text-white/50 text-sm transition-colors">
              Close Room
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 mt-2">
            <p className="text-white/30 text-sm animate-pulse">
              Waiting for {leaderName || 'leader'}...
            </p>
            <button onClick={game.leaveRoom} className="text-white/30 hover:text-white/50 text-sm transition-colors">
              Leave Room
            </button>
          </div>
        )}
      </div>
    );
  }

  if (state.phase === 'ROUND_REVEALING') {
    const sortedGuesses = [...state.revealedGuesses].sort((a, b) => a.rank - b.rank);
    const hasMyGuess = sortedGuesses.some(g => g.playerId === playerId);

    return (
      <div className="min-h-screen flex flex-col items-center p-6">
        <h2 className="text-xl font-bold text-white/60 mb-4">Round Results</h2>

        <div className="w-full max-w-sm space-y-2">
          {sortedGuesses.map((guess, i) => {
            const isMe = guess.playerId === playerId;
            return (
              <div
                key={guess.playerId}
                className={`flex items-center gap-3 p-3 rounded-xl animate-slide-up ${
                  isMe
                    ? 'bg-accent/10 border border-accent/30'
                    : 'bg-bg-card/50 border border-white/5'
                }`}
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <RankBadge rank={guess.rank} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${isMe ? 'text-accent' : 'text-white/70'}`}>
                    {isMe ? 'You' : guess.playerName}
                  </p>
                  <p className="text-white/40 font-mono text-xs truncate">"{guess.word}"</p>
                </div>
                <span className="font-mono text-accent text-sm shrink-0">+{guess.points}</span>
              </div>
            );
          })}
        </div>

        {!hasMyGuess && (
          <p className="text-white/30 text-sm mt-4">You didn't submit a guess this round</p>
        )}
      </div>
    );
  }

  if (state.phase === 'ROUND_ACCOLADES') {
    const myAccolades = state.accolades.filter(a => a.playerId === playerId);
    const sortedGuesses = [...state.round.guesses].sort((a, b) => a.rank - b.rank);

    return (
      <div className="min-h-screen flex flex-col items-center p-6">
        <h2 className="text-xl font-bold text-white/60 mb-4">Awards</h2>

        <div className="w-full max-w-lg grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Round Results */}
          <div className="space-y-2">
            {sortedGuesses.map((guess, i) => {
              const isMe = guess.playerId === playerId;
              return (
                <div
                  key={guess.playerId}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    isMe
                      ? 'bg-accent/10 border border-accent/30'
                      : 'bg-bg-card/50 border border-white/5'
                  }`}
                >
                  <RankBadge rank={guess.rank} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${isMe ? 'text-accent' : 'text-white/70'}`}>
                      {isMe ? 'You' : guess.playerName}
                    </p>
                    <p className="text-white/40 font-mono text-xs truncate">"{guess.word}"</p>
                  </div>
                  <span className="font-mono text-accent text-sm shrink-0">+{guess.points}</span>
                </div>
              );
            })}
          </div>

          {/* Awards */}
          {myAccolades.length > 0 && (
            <div className="space-y-4">
              <p className="text-white/30 text-xs uppercase tracking-widest text-center">Your Awards</p>
              {myAccolades.map((a, i) => (
                <AccoladeCard key={a.type} accolade={a} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === 'ROUND_SCOREBOARD') {
    const sortedScoreboard = [...state.scoreboard].sort((a, b) => a.currentPosition - b.currentPosition);
    const myEntry = sortedScoreboard.find(e => e.playerId === playerId);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        {myEntry && (
          <div className="text-center mb-6 animate-scale-in">
            <p className="text-4xl font-bold text-accent">#{myEntry.currentPosition}</p>
            <p className="text-white/40 text-sm">{myEntry.totalScore.toLocaleString()} total points</p>
          </div>
        )}

        <Leaderboard scoreboard={sortedScoreboard} compact />
      </div>
    );
  }

  return null;
}
