import { useRef, useEffect, useCallback } from 'react';
import Matter from 'matter-js';
import type { GuessResult } from '@mmw/shared';
import { getRankColor, RANK_ZONES } from '@mmw/shared';

// --- Physics tuning constants ---
const GRAVITY_BASE = 0.0005;
const TANGENTIAL_FACTOR = 0.3;
const FRICTION_AIR = 0.015;
const LAUNCH_SPEED = 8;
const CAPTURE_SPEED_THRESHOLD = 0.5;
const ENTRY_STAGGER_MS = 300;
const ESCAPE_DISTANCE_FACTOR = 1.5;
const MAX_BODIES = 30;
const MIN_ORBIT_RADIUS = 40;

// --- Rank → color tier ---
type Tier = 'win' | 'green' | 'orange' | 'red';

function getTier(rank: number): Tier {
  if (rank <= 1) return 'win';
  if (rank <= 300) return 'green';
  if (rank <= 1500) return 'orange';
  return 'red';
}

function getColor(rank: number): string {
  if (rank <= 1) return RANK_ZONES.WIN.color;
  return getRankColor(rank);
}

// --- Font size from rank ---
const LOG_MAX = Math.log10(50000);
const MIN_FONT = 14;
const MAX_FONT = 42;

function getFontSize(rank: number): number {
  const t = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(rank, 1)) / LOG_MAX));
  return MIN_FONT + (MAX_FONT - MIN_FONT) * t;
}

// --- Body metadata ---
interface WordMeta {
  word: string;
  rank: number;
  color: string;
  fontSize: number;
  tier: Tier;
  entryTime: number;
  captured: boolean;
}

// --- Capture flash effect ---
interface CaptureFlash {
  x: number;
  y: number;
  startTime: number;
  color: string;
  duration: number;
}

// --- Rank → equilibrium radius from center ---
function rankToRadius(rank: number, maxRadius: number): number {
  const t = Math.log10(Math.max(rank, 1)) / Math.log10(50000);
  return MIN_ORBIT_RADIUS + (maxRadius - MIN_ORBIT_RADIUS) * t;
}

interface Props {
  guesses: GuessResult[];
  teamBest: number;
  paused: boolean;
}

export default function PhysicsWordCloud({ guesses, teamBest, paused }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PhysicsEngine | null>(null);

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = new PhysicsEngine(canvas, container);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Sync guesses into physics world
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.syncGuesses(guesses);
  }, [guesses]);

  // Sync pause state
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.paused = paused;
  }, [paused]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// =====================================================
// PhysicsEngine — imperative class managing matter.js
// =====================================================

class PhysicsEngine {
  private engine: Matter.Engine;
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver;
  private bodyMap = new Map<string, Matter.Body>(); // word → body
  private flashes: CaptureFlash[] = [];
  private lastTime = 0;
  private centerX = 0;
  private centerY = 0;
  private containerW = 0;
  private containerH = 0;
  private staggerQueue: { guess: GuessResult; launchAt: number }[] = [];
  private fontsReady = false;
  paused = false;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas;
    this.container = container;
    this.ctx = canvas.getContext('2d')!;
    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });

    // Check font readiness
    document.fonts.ready.then(() => { this.fontsReady = true; });
    this.fontsReady = document.fonts.check('16px "Space Grotesk"');

    // ResizeObserver
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.containerW = rect.width;
    this.containerH = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.centerX = rect.width / 2;
    this.centerY = rect.height / 2;
  }

  start() {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(now - this.lastTime, 32); // cap at ~30fps min
      this.lastTime = now;
      this.update(dt);
      this.draw(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    Matter.Engine.clear(this.engine);
  }

  // --- Sync guesses from React ---
  syncGuesses(guesses: GuessResult[]) {
    const now = performance.now();
    const incomingWords = new Set(guesses.map(g => g.word));

    // Remove bodies no longer in guesses
    for (const [word, body] of this.bodyMap) {
      if (!incomingWords.has(word)) {
        Matter.World.remove(this.engine.world, body);
        this.bodyMap.delete(word);
      }
    }

    // Find new guesses (not already in bodyMap or stagger queue)
    const queuedWords = new Set(this.staggerQueue.map(q => q.guess.word));
    const newGuesses = guesses.filter(g => !this.bodyMap.has(g.word) && !queuedWords.has(g.word));

    // Sort new guesses by rank (best first) for dramatic ordering
    newGuesses.sort((a, b) => a.rank - b.rank);

    // Stagger launches
    newGuesses.forEach((guess, i) => {
      this.staggerQueue.push({ guess, launchAt: now + i * ENTRY_STAGGER_MS });
    });

    // Enforce max bodies — remove worst rank bodies if needed
    this.enforceMaxBodies();
  }

  private enforceMaxBodies() {
    if (this.bodyMap.size <= MAX_BODIES) return;
    const sorted = [...this.bodyMap.entries()]
      .sort((a, b) => {
        const metaA = a[1].plugin as unknown as WordMeta;
        const metaB = b[1].plugin as unknown as WordMeta;
        return metaB.rank - metaA.rank; // worst rank first
      });
    while (this.bodyMap.size > MAX_BODIES && sorted.length > 0) {
      const [word, body] = sorted.shift()!;
      Matter.World.remove(this.engine.world, body);
      this.bodyMap.delete(word);
    }
  }

  // --- Add a single word body ---
  private addWord(guess: GuessResult) {
    if (this.bodyMap.has(guess.word)) return;

    const fontSize = getFontSize(guess.rank);
    const font = this.fontsReady ? `bold ${fontSize}px "Space Grotesk"` : `bold ${fontSize}px sans-serif`;
    this.ctx.font = font;
    const textWidth = this.ctx.measureText(guess.word).width;
    const textHeight = fontSize * 1.2;
    const padding = 8;

    // Launch from random edge
    const { x, y, vx, vy } = this.randomEdgeLaunch();

    const body = Matter.Bodies.rectangle(x, y, textWidth + padding, textHeight + padding, {
      frictionAir: FRICTION_AIR,
      friction: 0,
      restitution: 0.5,
      inertia: Infinity, // prevent rotation
      inverseInertia: 0,
      angle: 0,
      plugin: {
        word: guess.word,
        rank: guess.rank,
        color: getColor(guess.rank),
        fontSize,
        tier: getTier(guess.rank),
        entryTime: performance.now(),
        captured: false,
      } as unknown as Record<string, unknown>,
    });

    Matter.Body.setVelocity(body, { x: vx, y: vy });
    Matter.World.add(this.engine.world, body);
    this.bodyMap.set(guess.word, body);
    this.enforceMaxBodies();
  }

  private randomEdgeLaunch(): { x: number; y: number; vx: number; vy: number } {
    const w = this.containerW;
    const h = this.containerH;
    const side = Math.floor(Math.random() * 4);
    let x: number, y: number;

    switch (side) {
      case 0: x = Math.random() * w; y = -20; break;     // top
      case 1: x = w + 20; y = Math.random() * h; break;  // right
      case 2: x = Math.random() * w; y = h + 20; break;  // bottom
      default: x = -20; y = Math.random() * h; break;    // left
    }

    // Velocity aimed toward center with some randomness
    const dx = this.centerX - x;
    const dy = this.centerY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spread = 0.15; // angular spread
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * spread;
    const speed = LAUNCH_SPEED + (Math.random() - 0.5) * 2;

    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  }

  // --- Physics update ---
  private update(dt: number) {
    // Process stagger queue
    const now = performance.now();
    while (this.staggerQueue.length > 0 && this.staggerQueue[0].launchAt <= now) {
      const entry = this.staggerQueue.shift()!;
      this.addWord(entry.guess);
    }

    if (this.paused) return;

    // Apply forces
    this.applyForces();

    // Step engine
    Matter.Engine.update(this.engine, dt);

    // Remove escaped bodies
    this.removeEscaped();
  }

  private applyForces() {
    const maxRadius = Math.min(this.containerW, this.containerH) * 0.4;

    for (const [, body] of this.bodyMap) {
      const meta = body.plugin as unknown as WordMeta;
      const dx = this.centerX - body.position.x;
      const dy = this.centerY - body.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;

      // Gravity force: stronger for closer rank words
      const gravityStrength = GRAVITY_BASE / Math.log10(Math.max(meta.rank, 2));

      // Radial force toward center
      const nx = dx / dist;
      const ny = dy / dist;
      const radialForce = gravityStrength * body.mass;

      // Tangential force for orbital motion (perpendicular to radial)
      const tx = -ny;
      const ty = nx;
      const tangentialForce = radialForce * TANGENTIAL_FACTOR;

      Matter.Body.applyForce(body, body.position, {
        x: nx * radialForce + tx * tangentialForce,
        y: ny * radialForce + ty * tangentialForce,
      });

      // Equilibrium radius — push away from center if too close
      const eqRadius = rankToRadius(meta.rank, maxRadius);
      if (dist < eqRadius * 0.4 && meta.tier !== 'red') {
        const pushStrength = gravityStrength * 0.5 * (1 - dist / (eqRadius * 0.4));
        Matter.Body.applyForce(body, body.position, {
          x: -nx * pushStrength * body.mass,
          y: -ny * pushStrength * body.mass,
        });
      }

      // Check capture for green/orange words
      if (!meta.captured && (meta.tier === 'green' || meta.tier === 'orange' || meta.tier === 'win')) {
        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
        const timeSinceEntry = performance.now() - meta.entryTime;
        if (speed < CAPTURE_SPEED_THRESHOLD && timeSinceEntry > 500) {
          meta.captured = true;
          this.flashes.push({
            x: body.position.x,
            y: body.position.y,
            startTime: performance.now(),
            color: meta.color,
            duration: 500,
          });
        }
      }

      // Keep angle at 0 (belt-and-suspenders with inertia: Infinity)
      Matter.Body.setAngle(body, 0);
    }
  }

  private removeEscaped() {
    const halfDiag = Math.sqrt(this.containerW ** 2 + this.containerH ** 2) / 2;
    const escapeR = halfDiag * ESCAPE_DISTANCE_FACTOR;

    for (const [word, body] of this.bodyMap) {
      const meta = body.plugin as unknown as WordMeta;
      // Only remove red-tier escaping bodies (green/orange should stay)
      if (meta.tier !== 'red') continue;

      const dx = body.position.x - this.centerX;
      const dy = body.position.y - this.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > escapeR) {
        Matter.World.remove(this.engine.world, body);
        this.bodyMap.delete(word);
      }
    }
  }

  // --- Drawing ---
  private draw(now: number) {
    const ctx = this.ctx;
    const w = this.containerW;
    const h = this.containerH;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw zone rings (faint dashed circles)
    this.drawZoneRings(ctx, w, h);

    // Draw center glow
    this.drawCenterGlow(ctx, now);

    // Draw capture flashes
    this.drawFlashes(ctx, now);

    // Draw word bodies
    this.drawWords(ctx, now);
  }

  private drawZoneRings(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const maxRadius = Math.min(w, h) * 0.4;
    const zones = [
      { rank: 300, color: RANK_ZONES.GREEN.color },
      { rank: 1500, color: RANK_ZONES.ORANGE.color },
    ];

    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1;

    for (const zone of zones) {
      const r = rankToRadius(zone.rank, maxRadius);
      ctx.strokeStyle = zone.color + '20'; // very faint
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawCenterGlow(ctx: CanvasRenderingContext2D, now: number) {
    const pulse = 0.5 + 0.3 * Math.sin(now / 1500);
    const r = 30;
    const gradient = ctx.createRadialGradient(
      this.centerX, this.centerY, 0,
      this.centerX, this.centerY, r
    );
    gradient.addColorStop(0, `rgba(251, 191, 36, ${0.3 * pulse})`);
    gradient.addColorStop(0.5, `rgba(251, 191, 36, ${0.1 * pulse})`);
    gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, r, 0, Math.PI * 2);
    ctx.fill();

    // "?" label
    ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * pulse})`;
    ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', this.centerX, this.centerY);
  }

  private drawFlashes(ctx: CanvasRenderingContext2D, now: number) {
    this.flashes = this.flashes.filter(f => {
      const elapsed = now - f.startTime;
      if (elapsed > f.duration) return false;

      const t = elapsed / f.duration;
      const radius = 20 + t * 40;
      const alpha = 0.5 * (1 - t);

      ctx.save();
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      return true;
    });
  }

  private drawWords(ctx: CanvasRenderingContext2D, now: number) {
    for (const [, body] of this.bodyMap) {
      const meta = body.plugin as unknown as WordMeta;
      const { x, y } = body.position;

      // Fade in
      const timeSinceEntry = now - meta.entryTime;
      const fadeIn = Math.min(1, timeSinceEntry / 400);

      // Red-tier words get a slight scale wobble
      let scale = 1;
      if (meta.tier === 'red' && !meta.captured) {
        scale = 1 + 0.03 * Math.sin(now / 200 + meta.rank);
      }

      const font = this.fontsReady ? 'Space Grotesk' : 'sans-serif';
      const fontSize = meta.fontSize * scale;
      ctx.font = `bold ${fontSize}px "${font}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Glow for win/close words
      if (meta.tier === 'win' || (meta.tier === 'green' && meta.rank <= 10)) {
        ctx.save();
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = meta.color;
        ctx.globalAlpha = fadeIn * 0.9;
        ctx.fillText(meta.word, x, y);
        ctx.restore();
      }

      // Main text
      const baseOpacity = meta.tier === 'red' ? 0.6 : 0.85;
      ctx.fillStyle = meta.color;
      ctx.globalAlpha = fadeIn * baseOpacity;
      ctx.fillText(meta.word, x, y);
      ctx.globalAlpha = 1;
    }
  }
}
