import React, { useEffect, useRef, useState } from 'react';
import { ClawPhysics, SCALE } from '../utils/physics';
import { soundManager } from '../utils/audio';
import * as planck from 'planck';
import confetti from 'canvas-confetti';
import { Coins, RefreshCw, AlertCircle } from 'lucide-react';

const GAME_WIDTH = 600;
const GAME_HEIGHT = 800;

type GameState = 'START' | 'IDLE' | 'DROPPING' | 'GRABBING' | 'PULLING' | 'RETURNING' | 'SETTLING' | 'GAME_OVER';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const physicsRef = useRef<ClawPhysics | null>(null);
  const requestRef = useRef<number>();
  
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState<number>(0);
  
  const [tensionActive, setTensionActive] = useState(false);
  const [safeZoneWidth, setSafeZoneWidth] = useState(40);
  
  const [caughtToy, setCaughtToy] = useState<{ emoji: string, rarity: string, score: number } | null>(null);
  const [showCaught, setShowCaught] = useState(false);
  
  const stateRef = useRef(gameState);
  const tensionActiveRef = useRef(false);
  const catchProgressRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const stateTimerRef = useRef(0);
  const lastStateChangeTimeRef = useRef(Date.now());
  
  const clawDropSpeed = 25;
  const clawPullSpeed = 3.5; // Increased from 1.2
  const clawAngleRef = useRef(0);
  const ropeLengthRef = useRef(2);
  const pivot = { x: GAME_WIDTH / 2 / SCALE, y: 1 };
  
  const sessionRef = useRef(0);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(true);
  
  const changeState = (newState: GameState) => {
    if (stateRef.current !== newState) {
      console.log(`State Transition: ${stateRef.current} -> ${newState}`);
      stateRef.current = newState;
      setGameState(newState);
      stateTimerRef.current = 0; // Reset timer on state change
      lastStateChangeTimeRef.current = Date.now();
      // Increment session to invalidate any lingering logic
      sessionRef.current++;
    }
  };

  const setTension = (active: boolean) => {
    tensionActiveRef.current = active;
    setTensionActive(active);
  };

  const spawnTreasures = (physics: ClawPhysics) => {
    physics.clearToys();
    
    // Fill more space horizontally and vertically
    for (let i = 0; i < 20; i++) {
      physics.spawnTreasure(Math.random() * GAME_WIDTH, GAME_HEIGHT - 30 - Math.random() * 200, 'White');
    }
    for (let i = 0; i < 15; i++) {
      physics.spawnTreasure(Math.random() * GAME_WIDTH, GAME_HEIGHT - 40 - Math.random() * 200, 'Green');
    }
    for (let i = 0; i < 10; i++) {
      physics.spawnTreasure(Math.random() * GAME_WIDTH, GAME_HEIGHT - 50 - Math.random() * 200, 'Blue');
    }
    for (let i = 0; i < 6; i++) {
      physics.spawnTreasure(Math.random() * GAME_WIDTH, GAME_HEIGHT - 70 - Math.random() * 180, 'Purple');
    }
    for (let i = 0; i < 3; i++) {
      physics.spawnTreasure(Math.random() * GAME_WIDTH, GAME_HEIGHT - 100 - Math.random() * 150, 'Gold');
    }
    for (let i = 0; i < 1; i++) {
      physics.spawnTreasure(Math.random() * GAME_WIDTH, GAME_HEIGHT - 120 - Math.random() * 100, 'Red');
    }
  };

  const startGame = (isContinue = false) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    
    console.log('Starting Game...', isContinue ? '(Continue)' : '(New)');
    if (!isContinue) {
      setScore(0);
    }
    setCoins(c => Math.max(0, c - 1));
    soundManager.resume();
    
    // Reset all game state refs
    ropeLengthRef.current = 2;
    clawAngleRef.current = 0;
    catchProgressRef.current = 0;
    setTension(false);
    
    if (physicsRef.current) {
      try {
        const p = physicsRef.current;
        p.releaseToy();
        // Reset claw position to safe start
        p.clawBody.setPosition(planck.Vec2(pivot.x, pivot.y + 2));
        p.clawBody.setLinearVelocity(planck.Vec2(0, 0));
        p.clawBody.setAngularVelocity(0);
        p.clawBody.setAngle(0);
        
        // Only spawn if board is empty or it's a fresh start
        let toysLeft = 0;
        for (const [body, bdata] of p.bodies.entries()) {
          if (bdata.type === 'toy') toysLeft++;
        }
        
        if (toysLeft === 0 || !isContinue) {
          spawnTreasures(p);
        }
      } catch (e) {
        console.error('Error during startGame physics reset:', e);
      }
    }
    changeState('IDLE');
    
    // Allow starting again after a short delay
    setTimeout(() => {
      isStartingRef.current = false;
    }, 500);
  };

  const addCoin = () => {
    setCoins(c => c + 1);
    soundManager.playThrow();
    
    // Stuck detection: if we've been in the same state for more than 15 seconds (and it's not IDLE/START)
    const timeInState = Date.now() - lastStateChangeTimeRef.current;
    const isStuck = (stateRef.current !== 'IDLE' && stateRef.current !== 'START') && timeInState > 15000;

    // If we are on the start or game over screen, or if we are stuck, start immediately
    if (stateRef.current === 'START' || stateRef.current === 'GAME_OVER' || stateRef.current === 'SETTLING' || isStuck) {
      if (isStuck) {
        console.warn('Game appears stuck, forcing restart...');
      }
      isStartingRef.current = false; // Force unlock
      // Small delay to let the coin state update and avoid UI flicker
      const isContinue = stateRef.current === 'GAME_OVER' || stateRef.current === 'SETTLING';
      setTimeout(() => {
        startGame(isContinue);
      }, 50);
    }
  };

  useEffect(() => {
    const physics = new ClawPhysics(GAME_WIDTH, GAME_HEIGHT);
    physicsRef.current = physics;
    spawnTreasures(physics);
    
    let lastTime = performance.now();
    let accumulator = 0;
    const fixedTimeStep = 1 / 60;
    
    const update = (time: number) => {
      if (!isMountedRef.current) return;
      // Always request next frame first to ensure loop continues
      requestRef.current = requestAnimationFrame(update);
      
      if (!physicsRef.current) return;
      
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;
      
      const physics = physicsRef.current;

      // Watchdog: if we've been in the same state for too long, force reset
      const timeInState = Date.now() - lastStateChangeTimeRef.current;
      if (stateRef.current !== 'IDLE' && stateRef.current !== 'START' && stateRef.current !== 'GAME_OVER' && timeInState > 20000) {
        console.warn('Watchdog: Game stuck in state', stateRef.current);
        changeState('GAME_OVER');
        return;
      }
      
      // Fixed time step for physics
      try {
        accumulator += dt;
        // Safety: if dt is too large, reset accumulator to avoid infinite loop
        if (accumulator > 0.5) accumulator = 0.5;
        
        while (accumulator >= fixedTimeStep) {
          physics.step(fixedTimeStep);
          accumulator -= fixedTimeStep;
        }
      } catch (e) {
        console.error('Physics step error:', e);
      }

      try {
        if (stateRef.current === 'IDLE') {
          clawAngleRef.current = Math.sin(time / 500) * (Math.PI / 4);
          ropeLengthRef.current = 2;
          const cx = pivot.x + Math.sin(clawAngleRef.current) * ropeLengthRef.current;
          const cy = pivot.y + Math.cos(clawAngleRef.current) * ropeLengthRef.current;
          
          if (!isNaN(cx) && !isNaN(cy)) {
            physics.clawBody.setPosition(planck.Vec2(cx, cy));
            physics.clawBody.setAngle(-clawAngleRef.current);
            physics.clawBody.setLinearVelocity(planck.Vec2(0, 0));
          }
        }
        else if (stateRef.current === 'DROPPING') {
          ropeLengthRef.current += clawDropSpeed * dt;
          const cx = pivot.x + Math.sin(clawAngleRef.current) * ropeLengthRef.current;
          const cy = pivot.y + Math.cos(clawAngleRef.current) * ropeLengthRef.current;
          
          if (!isNaN(cx) && !isNaN(cy)) {
            physics.clawBody.setPosition(planck.Vec2(cx, cy));
            physics.clawBody.setLinearVelocity(planck.Vec2(0, 0));
          }
          
          // Boundary check: if it hits the floor or goes too deep, return
          // Floor is at GAME_HEIGHT - 100, so we return a bit before that
          const isTooDeep = cy * SCALE > GAME_HEIGHT - 150;
          const isOutOfBounds = cx * SCALE < 0 || cx * SCALE > GAME_WIDTH || isNaN(cx) || isNaN(cy);
          const isTimedOut = stateTimerRef.current > 3.0;

          if (isTooDeep || isOutOfBounds || isTimedOut) {
            changeState('RETURNING');
          } else {
            const overlapping = physics.getOverlappingToys();
            if (overlapping.length > 0) {
              physics.grabToy(overlapping[0]);
              changeState('GRABBING');
              soundManager.playSplat();
            }
          }
          stateTimerRef.current += dt;
        }
        else if (stateRef.current === 'GRABBING') {
          physics.clawBody.setLinearVelocity(planck.Vec2(0, 0));
          stateTimerRef.current += dt;
          if (stateTimerRef.current >= 0.2) { // 200ms grab animation
            changeState('PULLING');
            catchProgressRef.current = 50;
            
            // Calculate safe zone width based on rarity
            let sw = 40;
            if (physics.grabbedToy) {
              const data = physics.bodies.get(physics.grabbedToy);
              if (data && data.rarity) {
                if (data.rarity === 'White') sw = 50;
                else if (data.rarity === 'Green') sw = 40;
                else if (data.rarity === 'Blue') sw = 30;
                else if (data.rarity === 'Purple') sw = 20;
                else if (data.rarity === 'Gold') sw = 15;
                else if (data.rarity === 'Red') sw = 10;
              }
            }
            setSafeZoneWidth(sw);
            setTension(true);
          }
        }
        else if (stateRef.current === 'PULLING') {
          let currentPullSpeed = clawPullSpeed;
          let decayRate = 35;
          let currentSafeZoneWidth = 40;

          if (physics.grabbedToy) {
            const data = physics.bodies.get(physics.grabbedToy);
            if (data && data.weight) {
              currentPullSpeed = clawPullSpeed / (data.weight * 0.5); // Heavier toys pull slower but still fast
              decayRate = 25 + (data.weight * 15);
              
              if (data.rarity === 'White') currentSafeZoneWidth = 50;
              else if (data.rarity === 'Green') currentSafeZoneWidth = 40;
              else if (data.rarity === 'Blue') currentSafeZoneWidth = 30;
              else if (data.rarity === 'Purple') currentSafeZoneWidth = 20;
              else if (data.rarity === 'Gold') currentSafeZoneWidth = 15;
              else if (data.rarity === 'Red') currentSafeZoneWidth = 10;
            }
          }
          
          const safeZoneStart = (100 - currentSafeZoneWidth) / 2;
          const safeZoneEnd = safeZoneStart + currentSafeZoneWidth;

          if (tensionActiveRef.current) {
            catchProgressRef.current -= decayRate * dt;
            if (catchProgressRef.current < 0) catchProgressRef.current = 0;
            if (catchProgressRef.current > 100) catchProgressRef.current = 100;
            
            let pullMultiplier = 1;
            if (catchProgressRef.current < safeZoneStart) {
              pullMultiplier = 0.3; // Less punishing
            } else if (catchProgressRef.current > safeZoneEnd) {
              pullMultiplier = 0.3; // Less punishing
            }

            if (progressBarRef.current) {
              progressBarRef.current.style.left = `${catchProgressRef.current}%`;
            }
            
            if (catchProgressRef.current <= 0 || catchProgressRef.current >= 100) {
              physics.releaseToy();
              setTension(false);
              changeState('RETURNING');
              soundManager.playThrow();
            } else {
              ropeLengthRef.current -= currentPullSpeed * pullMultiplier * dt;
            }
          } else {
            ropeLengthRef.current -= currentPullSpeed * dt;
          }

          const cx = pivot.x + Math.sin(clawAngleRef.current) * ropeLengthRef.current;
          const cy = pivot.y + Math.cos(clawAngleRef.current) * ropeLengthRef.current;
          
          if (!isNaN(cx) && !isNaN(cy)) {
            physics.clawBody.setPosition(planck.Vec2(cx, cy));
            physics.clawBody.setLinearVelocity(planck.Vec2(0, 0));
          }
          
          if (ropeLengthRef.current <= 2 || isNaN(ropeLengthRef.current)) {
            ropeLengthRef.current = 2;
            setTension(false);
            const currentGrabbedToy = physics.grabbedToy;
            if (currentGrabbedToy) {
              const data = physics.bodies.get(currentGrabbedToy);
              if (data && data.score) {
                setScore(s => s + data.score);
                
                // Set caught toy for UI
                let emoji = '🧸';
                if (data.rarity === 'White') emoji = '🐶';
                else if (data.rarity === 'Green') emoji = '🐷';
                else if (data.rarity === 'Blue') emoji = '🐱';
                else if (data.rarity === 'Purple') emoji = '🐻';
                else if (data.rarity === 'Gold') emoji = '🐥';
                else if (data.rarity === 'Red') emoji = '🐮';
                
                setCaughtToy({ emoji, rarity: data.rarity || 'White', score: data.score });
                setShowCaught(true);
                setTimeout(() => setShowCaught(false), 3000);
              }
              physics.destroyToy(currentGrabbedToy);
              
              try {
                if (typeof confetti === 'function') {
                  const duration = 2 * 1000;
                  const animationEnd = Date.now() + duration;
                  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };
                  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

                  const interval: any = setInterval(function() {
                    const timeLeft = animationEnd - Date.now();
                    if (timeLeft <= 0) return clearInterval(interval);
                    const particleCount = 50 * (timeLeft / duration);
                    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
                    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
                  }, 250);
                }
              } catch (e) {
                console.error('Confetti setup error:', e);
              }
              soundManager.playBoom();
              
              // Check if any toys are left
              let toysLeft = 0;
              if (physics) {
                for (const [body, bdata] of physics.bodies.entries()) {
                  if (bdata.type === 'toy') toysLeft++;
                }
                if (toysLeft === 0) {
                  spawnTreasures(physics);
                }
              }
            }
            
            // Change state IMMEDIATELY to stop this block from running again
            changeState('SETTLING');
          }
        }
        else if (stateRef.current === 'RETURNING') {
          ropeLengthRef.current -= clawDropSpeed * 2.0 * dt; // Faster return when empty
          if (ropeLengthRef.current <= 2 || isNaN(ropeLengthRef.current)) {
            ropeLengthRef.current = 2;
            changeState('SETTLING');
          } else {
            const cx = pivot.x + Math.sin(clawAngleRef.current) * ropeLengthRef.current;
            const cy = pivot.y + Math.cos(clawAngleRef.current) * ropeLengthRef.current;
            
            if (!isNaN(cx) && !isNaN(cy)) {
              physics.clawBody.setPosition(planck.Vec2(cx, cy));
              physics.clawBody.setLinearVelocity(planck.Vec2(0, 0));
            }
          }
        }
        else if (stateRef.current === 'SETTLING') {
          stateTimerRef.current += dt;
          // Keep the claw at the top
          const cx = pivot.x + Math.sin(clawAngleRef.current) * 2;
          const cy = pivot.y + Math.cos(clawAngleRef.current) * 2;
          
          if (!isNaN(cx) && !isNaN(cy)) {
            physics.clawBody.setPosition(planck.Vec2(cx, cy));
            physics.clawBody.setLinearVelocity(planck.Vec2(0, 0));
            physics.clawBody.setAngularVelocity(0);
          }

          // If we didn't grab anything, we can finish faster
          // Check if we still have a toy in physics.bodies
          const hasToy = physics.grabbedToy !== null;
          const settleTime = hasToy ? 1.0 : 0.3; // Slightly longer for stability

          if (stateTimerRef.current >= settleTime) {
            console.log('Settling finished, going to GAME_OVER');
            changeState('GAME_OVER');
          }
        }
        else if (stateRef.current === 'GAME_OVER') {
          // Keep claw stable at top during game over
          const cx = pivot.x + Math.sin(clawAngleRef.current) * 2;
          const cy = pivot.y + Math.cos(clawAngleRef.current) * 2;
          if (!isNaN(cx) && !isNaN(cy)) {
            physics.clawBody.setPosition(planck.Vec2(cx, cy));
            physics.clawBody.setLinearVelocity(planck.Vec2(0, 0));
            physics.clawBody.setAngularVelocity(0);
          }
        }

        draw(physics);
      } catch (e) {
        console.error('Update loop error:', e);
      }
    };

    requestRef.current = requestAnimationFrame(update);
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const draw = (physics: ClawPhysics) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Draw Winch Base
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(GAME_WIDTH / 2 - 40, 0, 80, 1 * SCALE);
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(GAME_WIDTH / 2, 1 * SCALE, 15, 0, Math.PI * 2);
      ctx.fill();

      const clawPos = physics.clawBody.getPosition();
      if (!isNaN(clawPos.x) && !isNaN(clawPos.y)) {
        ctx.beginPath();
        ctx.moveTo(GAME_WIDTH / 2, 1 * SCALE);
        ctx.lineTo(clawPos.x * SCALE, clawPos.y * SCALE);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      for (const [body, data] of physics.bodies.entries()) {
        try {
          const pos = body.getPosition();
          const angle = body.getAngle();
          
          if (isNaN(pos.x) || isNaN(pos.y) || isNaN(angle)) continue;

          ctx.save();
          ctx.translate(pos.x * SCALE, pos.y * SCALE);
          ctx.rotate(angle);

          if (data.type === 'toy') {
            ctx.beginPath();
            const r = (data.radius || 1) * SCALE;
            if (isNaN(r) || r <= 0) {
              ctx.restore();
              continue;
            }
            
            ctx.fillStyle = data.color || '#fff';
            
            let emoji = '🧸';
            if (data.rarity === 'White') {
              ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
              emoji = '🐶';
            } else if (data.rarity === 'Green') {
              for (let i = 0; i < 5; i++) {
                const px = r * Math.cos(i * Math.PI * 2 / 5 - Math.PI/2);
                const py = r * Math.sin(i * Math.PI * 2 / 5 - Math.PI/2);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              }
              emoji = '🐷';
            } else if (data.rarity === 'Blue') {
              for (let i = 0; i < 6; i++) {
                const px = r * Math.cos(i * Math.PI / 3);
                const py = r * Math.sin(i * Math.PI / 3);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              }
              emoji = '🐱';
            } else if (data.rarity === 'Purple') {
              for (let i = 0; i < 8; i++) {
                const px = r * Math.cos(i * Math.PI / 4);
                const py = r * Math.sin(i * Math.PI / 4);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              }
              emoji = '🐻';
            } else if (data.rarity === 'Gold') {
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              emoji = '🐥';
            } else if (data.rarity === 'Red') {
              for (let i = 0; i < 10; i++) {
                const rr = i % 2 === 0 ? r : r * 0.5;
                const px = rr * Math.cos(i * Math.PI * 2 / 10 - Math.PI/2);
                const py = rr * Math.sin(i * Math.PI * 2 / 10 - Math.PI/2);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              }
              emoji = '🐮';
            }
            ctx.closePath();
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff80';
            ctx.stroke();

            // Draw Emoji
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const fontSize = Math.max(10, r * 1.2);
            ctx.font = `${fontSize}px Arial`;
            ctx.save();
            ctx.rotate(-angle); // Counter-rotate to keep it upright
            ctx.fillText(emoji, 0, 0);
            ctx.restore();
          } else if (data.type === 'claw') {
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(-30, -15, 60, 30);
            ctx.fillStyle = '#475569';
            ctx.fillRect(-20, -5, 40, 10);
            
            const isClosed = physics.grabbedJoint != null;
            
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#94a3b8';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(-25, 15);
            if (isClosed) {
              ctx.lineTo(-15, 45);
              ctx.lineTo(0, 50);
            } else {
              ctx.lineTo(-35, 40);
              ctx.lineTo(-20, 55);
            }
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(25, 15);
            if (isClosed) {
              ctx.lineTo(15, 45);
              ctx.lineTo(0, 50);
            } else {
              ctx.lineTo(35, 40);
              ctx.lineTo(20, 55);
            }
            ctx.stroke();
          }
          ctx.restore();
        } catch (err) {
          console.warn('Error drawing body:', err);
          ctx.restore();
        }
      }
    } catch (e) {
      console.error('Draw error:', e);
    }
  };

  const handleTap = () => {
    if (stateRef.current === 'IDLE') {
      changeState('DROPPING');
    } else if (stateRef.current === 'PULLING' && tensionActiveRef.current) {
      catchProgressRef.current += 15;
      if (catchProgressRef.current > 100) catchProgressRef.current = 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.left = `${catchProgressRef.current}%`;
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    soundManager.resume(); // Ensure audio context is resumed on first interaction
    // Removed screen tap to drop claw as per user request
    if (stateRef.current === 'PULLING' && tensionActiveRef.current) {
      handleTap();
    }
  };

  const handleTapButtonDown = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleTap();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
  };

  return (
    <div className="relative w-full h-screen bg-black flex items-center justify-center overflow-hidden touch-none select-none font-arcade p-2 sm:p-4" style={{ fontFamily: '"Press Start 2P", monospace' }}>
      {/* Arcade Cabinet Border */}
      <div className="relative w-full max-w-[600px] aspect-[3/4] shadow-[0_0_50px_rgba(255,0,255,0.5)] rounded-lg overflow-hidden border-4 sm:border-8 border-purple-900 bg-slate-900 flex flex-col">
        
        {/* Game Area */}
        <div className="relative flex-1 w-full overflow-hidden">
          {/* Emergency Reset Button - Always visible once game starts */}
          {(gameState !== 'START') && (
            <button 
              onClick={() => {
                if (window.confirm('确定要强制重置游戏吗？')) {
                  isStartingRef.current = false;
                  startGame();
                }
              }}
              className="absolute top-4 right-4 z-50 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white/50 hover:text-white transition-colors"
              title="强制重置"
            >
              <RefreshCw size={16} />
            </button>
          )}

          {/* Neon Grid Background */}
          <div className="absolute inset-0 pointer-events-none opacity-20" 
               style={{ backgroundImage: 'linear-gradient(transparent 95%, #ff00ff 100%), linear-gradient(90deg, transparent 95%, #00ffff 100%)', backgroundSize: '40px 40px' }} />
               
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="block bg-transparent relative z-10 w-full h-full object-contain"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />

          {/* Caught Celebration Overlay */}
          {showCaught && caughtToy && (
            <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
              <div className="flex flex-col items-center animate-bounce">
                <div className="text-8xl sm:text-9xl drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
                  {caughtToy.emoji}
                </div>
                <div className="bg-white/90 border-4 border-yellow-400 px-6 py-2 rounded-full shadow-xl transform -rotate-3 mt-4">
                  <div className="text-2xl sm:text-3xl font-black text-purple-600">
                    +{caughtToy.score}
                  </div>
                </div>
                <div className="mt-4 text-white text-3xl font-black italic uppercase tracking-widest drop-shadow-[0_2px_0_#ff00ff]">
                  太棒了!
                </div>
              </div>
            </div>
          )}

          {/* Start / Game Over Overlay (Integrated) */}
          {(gameState === 'START' || gameState === 'GAME_OVER') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/40 backdrop-blur-[2px]">
              <div className="bg-slate-900/90 border-4 border-cyan-400 p-8 rounded-2xl shadow-[0_0_50px_rgba(0,255,255,0.4)] flex flex-col items-center gap-6 max-w-[80%]">
                <h1 className="text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 font-black text-center leading-none drop-shadow-lg">
                  超级<br/>抓娃娃机
                </h1>
                
                <h2 className="text-xl text-cyan-400 font-bold tracking-tighter">
                  {gameState === 'START' ? '准备好了吗？' : '游戏结束'}
                </h2>
                
                {gameState === 'GAME_OVER' && (
                  <div className="text-yellow-400 text-2xl font-bold">得分: {score}</div>
                )}
                
                <div className="flex flex-col items-center gap-3 w-full">
                  {(typeof coins !== 'undefined' && coins > 0) ? (
                    <button 
                      onClick={() => startGame(gameState === 'GAME_OVER')}
                      className="w-full py-4 bg-cyan-400 text-black font-bold rounded-xl hover:bg-cyan-300 active:scale-95 transition-all animate-pulse shadow-[0_0_20px_rgba(0,255,255,0.6)] text-xl flex items-center justify-center gap-2"
                    >
                      {gameState === 'GAME_OVER' ? '继续游戏' : '开始游戏'}
                    </button>
                  ) : (
                    <button 
                      onClick={addCoin}
                      className="w-full py-4 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 active:scale-95 transition-all animate-pulse shadow-[0_0_20px_rgba(255,255,0,0.6)] text-xl flex items-center justify-center gap-2"
                    >
                      <Coins className="w-6 h-6" />
                      点击投币
                    </button>
                  )}
                  
                  <div className="text-cyan-400/80 text-xs uppercase tracking-[0.2em] font-bold flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    游戏币: {typeof coins !== 'undefined' ? coins : 0}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* UI Overlay */}
          <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none z-20">
            <div className="text-yellow-400 text-xl sm:text-2xl drop-shadow-[0_0_10px_rgba(255,255,0,0.8)] flex items-center gap-2">
              得分: {score}
            </div>
            <div className="text-cyan-400 text-sm sm:text-base drop-shadow-[0_0_10px_rgba(0,255,255,0.5)] flex items-center gap-2">
              <Coins className="w-4 h-4" />
              游戏币: {typeof coins !== 'undefined' ? coins : 0}
            </div>
          </div>
        </div>

        {/* Control Panel Area */}
        <div className="h-32 sm:h-40 bg-slate-800 border-t-4 border-purple-900 p-4 flex flex-col items-center justify-center relative z-20">
          <div className="w-full flex flex-col items-center gap-2">
            {tensionActive ? (
              <>
                <div className="text-yellow-400 text-xs sm:text-sm font-bold animate-pulse">保持指针在绿色区域!</div>
                <div className="w-full max-w-xs h-8 bg-slate-900 rounded-full overflow-hidden border-2 border-purple-500 relative shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                  {/* Zone Indicators */}
                  <div className="absolute inset-0 flex">
                    <div className="h-full bg-white" style={{ width: `${(100 - safeZoneWidth) / 2}%` }} />
                    <div className="h-full bg-green-500" style={{ width: `${safeZoneWidth}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${(100 - safeZoneWidth) / 2}%` }} />
                  </div>
                  {/* Marker Line */}
                  <div 
                    ref={progressBarRef}
                    className="absolute top-0 bottom-0 w-3 bg-black border-2 border-white shadow-[0_0_5px_#000] transition-all duration-75 rounded-full"
                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                  />
                </div>
              </>
            ) : (
              <div className="text-cyan-400 text-center text-sm sm:text-base animate-pulse h-12 flex items-center">
                {gameState === 'IDLE' ? '点击下方按钮开始抓取' : 
                 gameState === 'DROPPING' ? '钩子下降中...' :
                 gameState === 'PULLING' ? '正在收线!' : ''}
              </div>
            )}
            
            <button 
              onPointerDown={handleTapButtonDown}
              className={`w-full max-w-xs py-3 sm:py-4 border-4 rounded-lg text-white text-xl sm:text-2xl font-bold transition-all shadow-[0_0_20px_rgba(255,0,0,0.6)] ${
                (gameState === 'IDLE' || tensionActive) 
                  ? 'bg-red-600 border-red-400 active:bg-red-700 active:translate-y-1' 
                  : 'bg-slate-700 border-slate-600 opacity-50'
              }`}
            >
              {gameState === 'IDLE' ? '开始抓取!' : tensionActive ? '用力!' : '抓取中...'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
