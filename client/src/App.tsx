import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './screens/Home';
import HostScreen from './screens/host/HostScreen';
import PlayerScreen from './screens/player/PlayerScreen';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host" element={<HostScreen />} />
          <Route path="/play" element={<PlayerScreen />} />
          <Route path="/play/:roomCode" element={<PlayerScreen />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
