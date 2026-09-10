import type { PlayerSnapshot } from './protocol';

export interface PendingInput {
  seq: number;
  dt: number;
  move: { x: number; z: number };
  yaw: number;
  sprint: boolean;
}

export class LocalPlayerPredictor {
  private pendingInputs: PendingInput[] = [];
  private sequence = 0;
  private predictedPosition: [number, number, number] = [0, 0, 0];

  getNextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  recordInput(input: Omit<PendingInput, 'seq'>): number {
    const seq = this.getNextSequence();
    this.pendingInputs.push({ ...input, seq });
    if (this.pendingInputs.length > 60) {
      this.pendingInputs.shift();
    }
    return seq;
  }

  setPosition(pos: [number, number, number]): void {
    this.predictedPosition = [...pos];
  }

  getPosition(): [number, number, number] {
    return [...this.predictedPosition];
  }

  /**
   * Reconciles local predicted position against authoritative server snapshot.
   */
  reconcile(serverPlayer: PlayerSnapshot, lastAckedSeq?: number): void {
    if (lastAckedSeq !== undefined) {
      this.pendingInputs = this.pendingInputs.filter((inp) => inp.seq > lastAckedSeq);
    }

    const sPos = serverPlayer.position;
    const dx = this.predictedPosition[0] - sPos[0];
    const dy = this.predictedPosition[1] - sPos[1];
    const dz = this.predictedPosition[2] - sPos[2];
    const errorSq = dx * dx + dy * dy + dz * dz;

    // If prediction diverged more than 0.35m, snap to server position and replay pending inputs
    if (errorSq > 0.35 * 0.35) {
      this.predictedPosition = [...sPos];

      for (const input of this.pendingInputs) {
        const speed = input.sprint ? 9.2 : 6.2;
        let mx = input.move.x;
        let mz = input.move.z;
        const len = Math.sqrt(mx * mx + mz * mz);
        if (len > 1.0) {
          mx /= len;
          mz /= len;
        }

        const forwardX = Math.sin(input.yaw);
        const forwardZ = Math.cos(input.yaw);
        const rightX = Math.cos(input.yaw);
        const rightZ = -Math.sin(input.yaw);

        this.predictedPosition[0] += (rightX * mx + forwardX * mz) * speed * input.dt;
        this.predictedPosition[2] += (rightZ * mx + forwardZ * mz) * speed * input.dt;
      }
    }
  }

  clear(): void {
    this.pendingInputs = [];
    this.sequence = 0;
  }
}
