export const createPreviewStreamDecoder = (
  onFrame: (frame: Buffer) => void,
) => {
  let pending = Buffer.alloc(0);

  return (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);

    while (pending.length >= 4) {
      const frameLength = pending.readUInt32BE(0);
      if (pending.length < 4 + frameLength) {
        return;
      }

      const frame = pending.subarray(4, 4 + frameLength);
      onFrame(Buffer.from(frame));
      pending = pending.subarray(4 + frameLength);
    }
  };
};
