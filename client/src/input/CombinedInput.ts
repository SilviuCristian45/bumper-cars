import { NO_INPUT, type DriveContext, type DriveInput, type InputSource } from './InputSource';

/** Several devices at once (a tablet with a keyboard): the first one in use drives, any of them can boost. */
export class CombinedInput implements InputSource {
  constructor(private readonly sources: InputSource[]) {}

  poll(ctx: DriveContext): DriveInput {
    let drive: DriveInput | null = null;
    let boost = false;
    for (const source of this.sources) {
      const input = source.poll(ctx);
      if (!input) continue;
      boost ||= input.boost;
      drive ??= input;
    }
    return { ...(drive ?? NO_INPUT), boost };
  }

  releaseAll(): void {
    for (const source of this.sources) source.releaseAll();
  }

  destroy(): void {
    for (const source of this.sources) source.destroy();
  }
}
