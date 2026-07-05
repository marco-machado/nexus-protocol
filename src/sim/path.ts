import { MAP_W, MAP_H, type MapData } from './map';

const MAX_EXPAND = 9000;
const BIG = 0x3fffffff;

const gScore = new Int32Array(MAP_W * MAP_H);
const closed = new Uint8Array(MAP_W * MAP_H);
const heapF: number[] = [];
const heapN: number[] = [];

function heapPush(f: number, n: number): void {
  heapF.push(f);
  heapN.push(n);
  let i = heapF.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    const fi = heapF[i]!;
    const fp = heapF[p]!;
    if (fp < fi || (fp === fi && heapN[p]! <= heapN[i]!)) break;
    [heapF[i], heapF[p]] = [fp, fi];
    [heapN[i], heapN[p]] = [heapN[p]!, heapN[i]!];
    i = p;
  }
}

function heapPop(): number {
  const top = heapN[0]!;
  const lf = heapF.pop()!;
  const ln = heapN.pop()!;
  if (heapF.length > 0) {
    heapF[0] = lf;
    heapN[0] = ln;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < heapF.length && (heapF[l]! < heapF[m]! || (heapF[l] === heapF[m] && heapN[l]! < heapN[m]!))) m = l;
      if (r < heapF.length && (heapF[r]! < heapF[m]! || (heapF[r] === heapF[m] && heapN[r]! < heapN[m]!))) m = r;
      if (m === i) break;
      [heapF[i], heapF[m]] = [heapF[m]!, heapF[i]!];
      [heapN[i], heapN[m]] = [heapN[m]!, heapN[i]!];
      i = m;
    }
  }
  return top;
}

function octile(x0: number, z0: number, x1: number, z1: number): number {
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  return dx > dz ? 14 * dz + 10 * (dx - dz) : 14 * dx + 10 * (dz - dx);
}

export function nearestWalkable(map: MapData, cell: number): number {
  if (!map.obstacle[cell]) return cell;
  const cx = cell % MAP_W;
  const cz = (cell / MAP_W) | 0;
  for (let r = 1; r < 12; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H) continue;
        if (!map.obstacle[x + z * MAP_W]) return x + z * MAP_W;
      }
    }
  }
  return cell;
}

const cameFrom = new Int32Array(MAP_W * MAP_H);

// diagnostic counters for perf probes; never part of SimState or the hash
export const pathStats = { calls: 0, aborts: 0, expansions: 0 };

export function findPath(map: MapData, from: number, to: number): number[] | null {
  const goal = nearestWalkable(map, to);
  pathStats.calls++;
  if (from === goal) return [];
  gScore.fill(BIG);
  closed.fill(0);
  heapF.length = 0;
  heapN.length = 0;
  gScore[from] = 0;
  cameFrom[from] = -1;
  const gx = goal % MAP_W;
  const gz = (goal / MAP_W) | 0;
  heapPush(octile(from % MAP_W, (from / MAP_W) | 0, gx, gz), from);
  let expansions = 0;

  while (heapF.length > 0 && expansions < MAX_EXPAND) {
    const cur = heapPop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    expansions++;
    if (cur === goal) {
      pathStats.expansions += expansions;
      const path: number[] = [];
      let n = cur;
      while (n !== from) {
        path.push(n);
        n = cameFrom[n]!;
      }
      path.reverse();
      return path;
    }
    const cx = cur % MAP_W;
    const cz = (cur / MAP_W) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= MAP_W || nz >= MAP_H) continue;
        const ni = nx + nz * MAP_W;
        if (map.obstacle[ni] || closed[ni]) continue;
        if (dx !== 0 && dz !== 0) {
          if (map.obstacle[cx + dx + cz * MAP_W] || map.obstacle[cx + (cz + dz) * MAP_W]) continue;
        }
        const cost = dx !== 0 && dz !== 0 ? 14 : 10;
        const g = gScore[cur]! + cost;
        if (g < gScore[ni]!) {
          gScore[ni] = g;
          cameFrom[ni] = cur;
          heapPush(g + octile(nx, nz, gx, gz), ni);
        }
      }
    }
  }
  pathStats.expansions += expansions;
  if (expansions >= MAX_EXPAND) pathStats.aborts++;
  return null;
}
