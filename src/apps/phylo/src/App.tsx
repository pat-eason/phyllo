import { useState } from "react";
import { play, stop } from "@phylo/engine";
import "./App.css";

const DEMO = 'note("c3 [e3,g3] a2 [f3,a3]").s("sawtooth").lpf(800).slow(2)';

function App() {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    try {
      setError(undefined);
      if (playing) {
        stop();
        setPlaying(false);
      } else {
        await play(DEMO);
        setPlaying(true);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="container">
      <h1>Phylo</h1>
      <button type="button" onClick={toggle}>
        {playing ? "Stop" : "Play"}
      </button>
      {error && <pre>{error}</pre>}
    </main>
  );
}

export default App;
