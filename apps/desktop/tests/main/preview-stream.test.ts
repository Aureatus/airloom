import { describe, expect, test } from "bun:test";
import { createPreviewStreamDecoder } from "../../src/main/preview-stream";

const frameChunk = (payload: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  return Buffer.concat([length, payload]);
};

describe("createPreviewStreamDecoder", () => {
  test("decodes complete frames from one chunk", () => {
    const frames: Buffer[] = [];
    const decode = createPreviewStreamDecoder((frame) => {
      frames.push(frame);
    });

    decode(
      Buffer.concat([
        frameChunk(Buffer.from("one")),
        frameChunk(Buffer.from("two")),
      ]),
    );

    expect(frames.map((frame) => frame.toString("utf8"))).toEqual([
      "one",
      "two",
    ]);
  });

  test("decodes frames split across multiple chunks", () => {
    const frames: Buffer[] = [];
    const decode = createPreviewStreamDecoder((frame) => {
      frames.push(frame);
    });
    const chunk = frameChunk(Buffer.from("fragmented"));

    decode(chunk.subarray(0, 3));
    decode(chunk.subarray(3, 8));
    decode(chunk.subarray(8));

    expect(frames.map((frame) => frame.toString("utf8"))).toEqual([
      "fragmented",
    ]);
  });
});
