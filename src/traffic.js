export const TRAFFIC = {
  count: 7, minSpeedFrac: 0.6, maxSpeedFrac: 0.85, laneAbs: 3.5,
  avoidGap: 25, keepBehind: 60, respawnAheadMin: 200, respawnAheadMax: 500,
  collideDs: 4, collideDx: 2.4,
};
const PLAYER_MAX = 80;
const LANES = [-3.5, 0, 3.5];

// distance travelling forward from `from` to reach `to`
function circDist(from, to, L) { return ((to - from) % L + L) % L; }

export function createTraffic(trackLength, rng = Math.random) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i++) {
    const lane = LANES[i % LANES.length];
    const speed = PLAYER_MAX * (TRAFFIC.minSpeedFrac + rng() * (TRAFFIC.maxSpeedFrac - TRAFFIC.minSpeedFrac));
    const s = ((i + 1) / (TRAFFIC.count + 1)) * trackLength;
    cars.push({ s, x: lane, lane, speed, colorIndex: i });
  }
  return cars;
}

export function updateTraffic(cars, dt, playerS, trackLength, rng = Math.random) {
  for (const car of cars) {
    car.s = (car.s + car.speed * dt) % trackLength;
    // avoidance: car close ahead in a similar lane → change lane
    for (const other of cars) {
      if (other === car) continue;
      const gap = circDist(car.s, other.s, trackLength);
      if (gap > 0 && gap < TRAFFIC.avoidGap && Math.abs(other.lane - car.lane) < 1) {
        car.lane = car.lane === 0 ? (rng() < 0.5 ? -TRAFFIC.laneAbs : TRAFFIC.laneAbs) : 0;
        break;
      }
    }
    car.x += (car.lane - car.x) * Math.min(1, 2 * dt);
    // recycle: once a car falls well behind the player (or is absurdly far
    // ahead), respawn it a few hundred meters ahead so traffic stays present.
    const ahead = circDist(playerS, car.s, trackLength);
    const behind = trackLength - ahead;
    if (ahead > TRAFFIC.respawnAheadMax && behind > TRAFFIC.keepBehind) {
      car.s = (playerS + TRAFFIC.respawnAheadMin + rng() * (TRAFFIC.respawnAheadMax - TRAFFIC.respawnAheadMin)) % trackLength;
      car.lane = LANES[Math.floor(rng() * LANES.length)];
      car.x = car.lane;
    }
  }
  return cars;
}

// 0..1 slipstream strength: strongest tucked right behind a rival's tail,
// fading to nothing by draftMax; requires near-alignment laterally.
export const DRAFT = { min: 4, max: 28, dx: 1.8 };

export function draftFactor(player, cars, trackLength) {
  let best = 0;
  for (const car of cars) {
    const ahead = circDist(player.s, car.s, trackLength);
    if (ahead <= DRAFT.min || ahead >= DRAFT.max) continue;
    if (Math.abs(player.x - car.x) >= DRAFT.dx) continue;
    best = Math.max(best, 1 - (ahead - DRAFT.min) / (DRAFT.max - DRAFT.min));
  }
  return best;
}

// --- grand prix racers: no respawns, real laps, rubber-banded pace ---

export const RACERS = { count: 7, minFrac: 0.88, maxFrac: 0.97, rubberBand: 0.1, rubberRange: 400 };

export function createRacers(trackLength, playerMax, rng = Math.random) {
  const racers = [];
  for (let i = 0; i < RACERS.count; i++) {
    const lane = LANES[i % LANES.length];
    const baseSpeed = playerMax * (RACERS.minFrac + rng() * (RACERS.maxFrac - RACERS.minFrac));
    const s = 12 + i * 11; // staggered grid ahead of the line
    racers.push({ s, x: lane, lane, baseSpeed, speed: 0, lap: 1, colorIndex: i });
  }
  return racers;
}

function progressOf(lap, s, trackLength) {
  return (lap - 1) * trackLength + s;
}

export function updateRacers(racers, dt, playerProgress, trackLength, rng = Math.random) {
  for (const racer of racers) {
    // rubber-band toward the player so the pack stays in reach
    const gap = playerProgress - progressOf(racer.lap, racer.s, trackLength);
    const band = Math.max(-1, Math.min(1, gap / RACERS.rubberRange));
    racer.speed = racer.baseSpeed * (1 + RACERS.rubberBand * band);
    const prevS = racer.s;
    racer.s = (racer.s + racer.speed * dt) % trackLength;
    if (prevS > racer.s) racer.lap += 1; // wrapped the line
    for (const other of racers) {
      if (other === racer) continue;
      const ahead = circDist(racer.s, other.s, trackLength);
      if (ahead > 0 && ahead < TRAFFIC.avoidGap && Math.abs(other.lane - racer.lane) < 1) {
        racer.lane = racer.lane === 0 ? (rng() < 0.5 ? -TRAFFIC.laneAbs : TRAFFIC.laneAbs) : 0;
        break;
      }
    }
    racer.x += (racer.lane - racer.x) * Math.min(1, 2 * dt);
  }
  return racers;
}

export function standings(playerLap, playerS, racers, trackLength) {
  const playerProgress = progressOf(playerLap, playerS, trackLength);
  let position = 1;
  for (const racer of racers) {
    if (progressOf(racer.lap, racer.s, trackLength) > playerProgress) position += 1;
  }
  return position;
}

export function findCollision(player, cars, trackLength) {
  for (const car of cars) {
    const d1 = circDist(player.s, car.s, trackLength);
    const ds = Math.min(d1, trackLength - d1);
    if (ds < TRAFFIC.collideDs && Math.abs(player.x - car.x) < TRAFFIC.collideDx) return car;
  }
  return null;
}
