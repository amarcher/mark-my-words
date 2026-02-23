import { useState, useRef, useEffect } from 'react';

interface GuessInputProps {
  onSubmit: (word: string) => void;
  disabled?: boolean;
  error?: string;
}

export default function GuessInput({ onSubmit, disabled, error }: GuessInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const word = value.trim().toLowerCase();
    if (!word || disabled) return;
    onSubmit(word);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value.replace(/[^a-zA-Z]/g, ''))}
          placeholder="Type your guess..."
          disabled={disabled}
          maxLength={30}
          className="input-field w-full text-lg pr-20"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent hover:bg-accent/80 disabled:opacity-30 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-all"
        >
          Guess
        </button>
      </div>
      {error && <p className="text-rank-red text-sm mt-2 text-center">{error}</p>}
    </form>
  );
}
