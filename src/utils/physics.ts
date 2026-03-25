import * as planck from 'planck';

export const SCALE = 30; // 1 meter = 30 pixels

export type Rarity = 'White' | 'Green' | 'Blue' | 'Purple' | 'Gold' | 'Red';

export interface BodyData {
  type: 'toy' | 'claw' | 'wall';
  id: string;
  radius?: number;
  width?: number;
  height?: number;
  color?: string;
  glow?: string;
  score?: number;
  rarity?: Rarity;
  weight?: number;
}

export class ClawPhysics {
  world: planck.World;
  bodies: Map<planck.Body, BodyData> = new Map();
  clawBody: planck.Body;
  grabbedJoint: planck.Joint | null = null;
  grabbedToy: planck.Body | null = null;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.world = new planck.World({
      gravity: planck.Vec2(0, 15), // positive Y is down
    });

    // Create walls
    const w = width / SCALE;
    const h = height / SCALE;
    
    const ground = this.world.createBody({ type: 'static', position: planck.Vec2(w/2, h) });
    ground.createFixture(new planck.Box(w/2, 0.5));
    this.bodies.set(ground, { type: 'wall', id: 'ground' });

    const leftWall = this.world.createBody({ type: 'static', position: planck.Vec2(-0.5, h/2) });
    leftWall.createFixture(new planck.Box(0.5, h/2));
    this.bodies.set(leftWall, { type: 'wall', id: 'leftWall' });

    const rightWall = this.world.createBody({ type: 'static', position: planck.Vec2(w + 0.5, h/2) });
    rightWall.createFixture(new planck.Box(0.5, h/2));
    this.bodies.set(rightWall, { type: 'wall', id: 'rightWall' });

    // Create claw
    this.clawBody = this.world.createBody({
      type: 'kinematic',
      position: planck.Vec2(w/2, 2),
    });
    // The claw sensor
    this.clawBody.createFixture(new planck.Box(0.8, 0.5), { isSensor: true });
    this.bodies.set(this.clawBody, { type: 'claw', id: 'claw', width: 1.6, height: 1.0 });
  }

  step(dt: number) {
    this.world.step(dt);
  }

  spawnTreasure(x: number, y: number, rarity: Rarity) {
    let radius = 1.0;
    let weight = 1;
    let score = 10;
    let color = '#ffffff';
    let glow = '#e2e8f0';

    if (rarity === 'White') {
      radius = 0.9; weight = 1.0; score = 10; color = '#f8fafc'; glow = '#cbd5e1';
    } else if (rarity === 'Green') {
      radius = 1.0; weight = 1.5; score = 50; color = '#4ade80'; glow = '#86efac';
    } else if (rarity === 'Blue') {
      radius = 1.1; weight = 2.0; score = 150; color = '#3b82f6'; glow = '#93c5fd';
    } else if (rarity === 'Purple') {
      radius = 1.2; weight = 3.0; score = 500; color = '#a855f7'; glow = '#d8b4fe';
    } else if (rarity === 'Gold') {
      radius = 1.3; weight = 4.5; score = 2000; color = '#eab308'; glow = '#fde047';
    } else if (rarity === 'Red') {
      radius = 1.5; weight = 7.0; score = 10000; color = '#ef4444'; glow = '#f87171';
    }

    const body = this.world.createBody({
      type: 'dynamic',
      position: planck.Vec2(x / SCALE, y / SCALE),
      angle: Math.random() * Math.PI * 2,
      angularDamping: 0.8,
      linearDamping: 0.2,
    });

    body.createFixture({
      shape: new planck.Circle(radius),
      density: weight,
      friction: 0.6,
      restitution: 0.1,
    });

    this.bodies.set(body, {
      type: 'toy',
      id: Math.random().toString(36).substr(2, 9),
      radius,
      color,
      glow,
      score,
      rarity,
      weight
    });
  }

  getOverlappingToys(): planck.Body[] {
    const toys: planck.Body[] = [];
    try {
      let contact = this.clawBody.getContactList();
      while (contact) {
        if (contact.contact.isTouching()) {
          const otherBody = contact.other;
          const data = this.bodies.get(otherBody);
          if (data && data.type === 'toy') {
            toys.push(otherBody);
          }
        }
        contact = contact.next;
      }
      // Sort by Y position (highest first, which means smallest Y)
      toys.sort((a, b) => a.getPosition().y - b.getPosition().y);
    } catch (e) {
      console.warn('getOverlappingToys error:', e);
    }
    return toys;
  }

  grabToy(toy: planck.Body) {
    if (this.grabbedJoint) return;
    
    try {
      // Create a weld joint or distance joint
      // Let's use a WeldJoint to keep it firmly attached
      this.grabbedJoint = this.world.createJoint(new planck.WeldJoint({
        bodyA: this.clawBody,
        bodyB: toy,
        localAnchorA: planck.Vec2(0, 0.5), // bottom of claw
        localAnchorB: planck.Vec2(0, 0),   // center of toy
      }));
      this.grabbedToy = toy;
    } catch (e) {
      console.warn('Physics grabToy error:', e);
      this.grabbedJoint = null;
      this.grabbedToy = null;
    }
  }

  releaseToy() {
    if (this.grabbedJoint) {
      try {
        this.world.destroyJoint(this.grabbedJoint);
      } catch (e) {
        console.warn('Physics destroyJoint error:', e);
      }
      this.grabbedJoint = null;
    }
    this.grabbedToy = null;
  }

  destroyToy(toy: planck.Body) {
    if (!this.bodies.has(toy)) return;
    if (this.grabbedToy === toy) {
      this.releaseToy();
    }
    try {
      this.world.destroyBody(toy);
    } catch (e) {
      console.warn('Physics destroyBody error:', e);
    }
    this.bodies.delete(toy);
  }

  clearToys() {
    this.releaseToy();
    const toDestroy: planck.Body[] = [];
    for (const [body, data] of this.bodies.entries()) {
      if (data.type === 'toy') {
        toDestroy.push(body);
      }
    }
    for (const body of toDestroy) {
      if (this.bodies.has(body)) {
        try {
          this.world.destroyBody(body);
        } catch (e) {
          console.warn('Physics clearToys destroyBody error:', e);
        }
        this.bodies.delete(body);
      }
    }
  }
}

