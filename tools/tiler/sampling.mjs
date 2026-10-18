import { CHUNK_CELLS, FAR_SAMPLES, GRID_SAMPLES } from "./maps.mjs";

/*
 * A chunk spans exactly 25 master cells. Represent a sample position as the
 * integer numerator 25 * (chunkIndex * quads + localSample), over denominator
 * quads. This avoids accumulating floating-point position drift and makes the
 * two sides of a shared chunk edge use the exact same master-space position.
 */
function positionParts(chunkIndex, localSample, quads) {
  const numerator = CHUNK_CELLS * (chunkIndex * quads + localSample);
  const low = Math.floor(numerator / quads);
  const remainder = numerator - low * quads;
  return { low, remainder };
}

/*
 * Bilinear interpolation is performed on the stored uint16 values, not decoded
 * metres. The result is rounded once to the nearest uint16, with exact master
 * samples preserved at integer positions. Integer-weight arithmetic keeps
 * rounding identical at shared edges.
 */
export function sampleHeightU16(master, xNumerator, yNumerator, denominator) {
  const x0 = Math.floor(xNumerator / denominator);
  const y0 = Math.floor(yNumerator / denominator);
  const fx = xNumerator - x0 * denominator;
  const fy = yNumerator - y0 * denominator;
  const x1 = Math.min(x0 + 1, GRID_SAMPLES - 1);
  const y1 = Math.min(y0 + 1, GRID_SAMPLES - 1);
  const strideBytes = GRID_SAMPLES * 2;

  const h00 = master.readUInt16LE(y0 * strideBytes + x0 * 2);
  const h10 = master.readUInt16LE(y0 * strideBytes + x1 * 2);
  const h01 = master.readUInt16LE(y1 * strideBytes + x0 * 2);
  const h11 = master.readUInt16LE(y1 * strideBytes + x1 * 2);

  const x0Weight = denominator - fx;
  const y0Weight = denominator - fy;
  const weighted =
    h00 * x0Weight * y0Weight +
    h10 * fx * y0Weight +
    h01 * x0Weight * fy +
    h11 * fx * fy;
  const divisor = denominator * denominator;
  return Math.floor((weighted + divisor / 2) / divisor);
}

export function sampleNearestU8(master, xNumerator, yNumerator, denominator) {
  // All supported denominators are even; adding half the denominator gives a
  // deterministic nearest-neighbour rule, including exact half-cell ties.
  const x = Math.floor((xNumerator + denominator / 2) / denominator);
  const y = Math.floor((yNumerator + denominator / 2) / denominator);
  const index = Math.min(y, GRID_SAMPLES - 1) * GRID_SAMPLES + Math.min(x, GRID_SAMPLES - 1);
  return master[index];
}

export function buildChunkBuffers(heightMaster, biomeMaster, chunkI, chunkJ, quads) {
  const samplesPerSide = quads + 1;
  const heightOut = Buffer.alloc(samplesPerSide * samplesPerSide * 2);
  const biomeOut = Buffer.alloc(samplesPerSide * samplesPerSide);

  let heightOffset = 0;
  let biomeOffset = 0;
  for (let row = 0; row <= quads; row += 1) {
    const y = positionParts(chunkJ, row, quads);
    const yNumerator = y.low * quads + y.remainder;
    for (let col = 0; col <= quads; col += 1) {
      const x = positionParts(chunkI, col, quads);
      const xNumerator = x.low * quads + x.remainder;
      const height = sampleHeightU16(heightMaster, xNumerator, yNumerator, quads);
      heightOut.writeUInt16LE(height, heightOffset);
      heightOffset += 2;
      biomeOut[biomeOffset] = sampleNearestU8(biomeMaster, xNumerator, yNumerator, quads);
      biomeOffset += 1;
    }
  }
  return { height: heightOut, biome: biomeOut };
}

export function buildFarBuffers(heightMaster, biomeMaster) {
  const heightOut = Buffer.alloc(FAR_SAMPLES * FAR_SAMPLES * 2);
  const biomeOut = Buffer.alloc(FAR_SAMPLES * FAR_SAMPLES);
  let heightOffset = 0;
  let biomeOffset = 0;

  for (let row = 0; row < FAR_SAMPLES; row += 1) {
    const masterRow = row * 8;
    for (let col = 0; col < FAR_SAMPLES; col += 1) {
      const masterCol = col * 8;
      const masterIndex = masterRow * GRID_SAMPLES + masterCol;
      heightOut.writeUInt16LE(heightMaster.readUInt16LE(masterIndex * 2), heightOffset);
      heightOffset += 2;
      biomeOut[biomeOffset] = biomeMaster[masterIndex];
      biomeOffset += 1;
    }
  }
  return { height: heightOut, biome: biomeOut };
}

// Water sampling helpers follow the same deterministic grid arithmetic as terrain.

export const sampleWaterU16 = (buffer, index) => buffer.readUInt16LE(index * 2);

export const sampleNearestU16 = (master, xn, yn, d) => master.readUInt16LE((Math.min(GRID_SAMPLES-1,Math.floor((yn+d/2)/d))*GRID_SAMPLES+Math.min(GRID_SAMPLES-1,Math.floor((xn+d/2)/d)))*2);
export function buildWaterChunkBuffer(master, ci, cj, quads) { const n=quads+1, out=Buffer.alloc(n*n*2); let offset=0, wet=false; for(let row=0;row<=quads;row++){const y=positionParts(cj,row,quads), yn=y.low*quads+y.remainder; for(let col=0;col<=quads;col++){const x=positionParts(ci,col,quads), xn=x.low*quads+x.remainder, v=sampleNearestU16(master,xn,yn,quads); out.writeUInt16LE(v,offset); offset+=2; if(v!==0) wet=true;}} return wet?out:null; }
