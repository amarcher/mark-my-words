import { useNavigate } from 'react-router-dom';
import AdBanner from '../components/AdBanner';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12 animate-fade-in">
        <h1 className="text-6xl font-bold mb-3 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
          Mark My Words
        </h1>
        <p className="text-xl text-white/40">Multiplayer Word Guessing</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs animate-slide-up">
        <button onClick={() => navigate('/host')} className="btn-primary text-lg py-4">
          Host a Game
        </button>
        <button onClick={() => navigate('/play')} className="btn-secondary text-lg py-4">
          Join a Game
        </button>
      </div>

      <div className="mt-16 text-center text-white/20 text-sm max-w-md animate-fade-in">
        <p>
          Guess the secret word! Words are ranked by semantic similarity —
          the closer your guess, the lower the rank. Can you find the #1 word?
        </p>
      </div>

      <div className="mt-8 w-full max-w-2xl">
        <AdBanner slot="HOME_BOTTOM" />
      </div>
    </div>
  );
}
