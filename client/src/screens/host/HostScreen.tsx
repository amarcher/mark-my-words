import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSocket, useGameState } from '../../socket';
import HostLobby from './HostLobby';
import HostGame from './HostGame';
import HostRoundResults from './HostRoundResults';
import HostGameOver from './HostGameOver';
import PauseOverlay from '../../components/PauseOverlay';
import RoomClosedModal from '../../components/RoomClosedModal';
import SessionConflictModal from '../../components/SessionConflictModal';
import { useHostAudio } from '../../audio/useHostAudio';
import AudioControls from '../../audio/AudioControls';
import TTSSettingsModal from '../../audio/TTSSettingsModal';
import { useNarrator } from '../../hooks/useNarrator';

export default function HostScreen() {
  const { connected, reconnecting, sessionConflict, acceptSessionTakeover, cancelSessionTakeover } = useSocket();
  const game = useGameState();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const {
    muted, toggleMute, unlockAudio,
    ttsSettings, updateTTSSettings, voices,
    settingsOpen, openSettings, closeSettings,
    narratorAvailable, narratorActive,
  } = useHostAudio(game.gameState);

  const { narratorConnected, narratorError } = useNarrator(game.gameState, {
    narratorEngine: ttsSettings.narratorEngine,
    muted,
    voiceName: ttsSettings.voiceName,
    rate: ttsSettings.rate,
    pitch: ttsSettings.pitch,
    elevenLabsVoiceId: ttsSettings.elevenLabsVoiceId,
  });

  const handleCreate = async () => {
    unlockAudio();
    setCreating(true);
    setError('');
    const result = await game.createRoom();
    setCreating(false);
    if (!result.success) {
      setError(result.error || 'Failed to create room');
    }
  };

  if (sessionConflict) {
    return (
      <SessionConflictModal
        roomCode={sessionConflict.roomCode}
        onTakeOver={acceptSessionTakeover}
        onCancel={cancelSessionTakeover}
      />
    );
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 animate-pulse">Connecting to server...</p>
      </div>
    );
  }

  if (reconnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 animate-pulse">Reconnecting...</p>
      </div>
    );
  }

  // Not yet in a room — show create button
  if (!game.gameState) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
            Mark My Words
          </h1>
          <div className="w-full max-w-xs space-y-4">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary w-full"
            >
              {creating ? 'Creating...' : 'Create Room'}
            </button>
            {error && <p className="text-rank-red text-sm text-center">{error}</p>}
          </div>
        </div>
        {game.roomClosedMessage && (
          <RoomClosedModal message={game.roomClosedMessage} onDismiss={game.dismissRoomClosed} />
        )}
      </>
    );
  }

  const { gameState } = game;
  const showPauseOverlay = gameState.phase !== 'LOBBY';

  return (
    <>
      {showPauseOverlay && (
        <PauseOverlay
          paused={gameState.paused}
          afkCountdown={gameState.afkCountdown}
          onPause={game.pause}
          onResume={game.resume}
          onLeave={game.closeRoom}
          onEndGame={game.endGame}
          extraControls={<AudioControls muted={muted} onToggle={toggleMute} onOpenSettings={openSettings} />}
        />
      )}

      {(() => {
        switch (gameState.phase) {
          case 'LOBBY':
            return (
              <>
                <div className="fixed top-4 right-4 z-50">
                  <AudioControls muted={muted} onToggle={toggleMute} onOpenSettings={openSettings} />
                </div>
                <HostLobby state={gameState} game={game} />
              </>
            );
          case 'ROUND_ACTIVE':
            return <HostGame state={gameState} game={game} />;
          case 'ROUND_REVEALING':
          case 'ROUND_HINT_REVEAL':
          case 'ROUND_SCOREBOARD':
            return <HostRoundResults state={gameState} game={game} narratorActive={narratorActive} />;
          case 'GAME_OVER':
            return <HostGameOver state={gameState} game={game} />;
        }
      })()}

      {/* Small QR code for late joiners — visible in top bar during all non-lobby phases */}
      {gameState.phase !== 'LOBBY' && (
        <div className="fixed top-3 left-3 bg-white/10 backdrop-blur-sm rounded-lg p-2 flex items-center gap-2">
          <QRCodeSVG
            value={`${window.location.origin}/play/${gameState.roomCode}`}
            size={48}
            bgColor="transparent"
            fgColor="white"
            level="L"
          />
          <span className="text-white/60 text-xs font-mono">{gameState.roomCode}</span>
        </div>
      )}

      <TTSSettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        voices={voices}
        settings={ttsSettings}
        onSettingsChange={updateTTSSettings}
        narratorAvailable={narratorAvailable}
        narratorConnected={narratorConnected}
        narratorError={narratorError}
      />
    </>
  );
}
