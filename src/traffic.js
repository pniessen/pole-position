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

export function findCollision(player, cars, trackLength) {
  for (const car of cars) {
    const d1 = circDist(player.s, car.s, trackLength);
    const ds = Math.min(d1, trackLength - d1);
    if (ds < TRAFFIC.collideDs && Math.abs(player.x - car.x) < TRAFFIC.collideDx) return car;
  }
  return null;
}
