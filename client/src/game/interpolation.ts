/** Client-only smoothing of server ball `dist` between Colyseus patches. */

export interface BallSample {
  id: string;
  typeId: string;
  dist: number;
  seat: number;
}

interface BallTrack {
  typeId: string;
  seat: number;
  from: number;
  to: number;
  render: number;
  t: number;
}

const SNAP_THRESHOLD = 56;
export const DIST_INTERP_MS = 55;

export class DistInterpolator {
  private tracks = new Map<string, BallTrack>();

  sync(samples: BallSample[]): void {
    const seen = new Set<string>();
    for (const sample of samples) {
      seen.add(sample.id);
      const prev = this.tracks.get(sample.id);
      if (!prev) {
        this.tracks.set(sample.id, {
          typeId: sample.typeId,
          seat: sample.seat,
          from: sample.dist,
          to: sample.dist,
          render: sample.dist,
          t: 1,
        });
        continue;
      }

      prev.typeId = sample.typeId;
      prev.seat = sample.seat;

      const delta = Math.abs(sample.dist - prev.render);
      if (delta > SNAP_THRESHOLD) {
        prev.from = sample.dist;
        prev.to = sample.dist;
        prev.render = sample.dist;
        prev.t = 1;
      } else if (Math.abs(sample.dist - prev.to) > 0.05) {
        prev.from = prev.render;
        prev.to = sample.dist;
        prev.t = 0;
      }
    }

    for (const id of this.tracks.keys()) {
      if (!seen.has(id)) this.tracks.delete(id);
    }
  }

  step(dtMs: number): void {
    const rate = dtMs / DIST_INTERP_MS;
    for (const track of this.tracks.values()) {
      if (track.t >= 1) {
        track.render = track.to;
        continue;
      }
      track.t = Math.min(1, track.t + rate);
      const s = track.t * track.t * (3 - 2 * track.t);
      track.render = track.from + (track.to - track.from) * s;
    }
  }

  forEach(
    fn: (id: string, seat: number, typeId: string, dist: number) => void,
  ): void {
    for (const [id, track] of this.tracks) {
      fn(id, track.seat, track.typeId, track.render);
    }
  }
}
