import { zstdDecompress } from "node:zlib";

const MAX_ENCODED_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_DECODED_REQUEST_BYTES = 128 * 1024 * 1024;

export class RequestBodyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestBodyLimitError";
  }
}

function assertWithinLimit(bytes: number, limit: number, label: string): void {
  if (bytes > limit) throw new RequestBodyLimitError(`${label} exceeds ${limit} bytes`);
}

async function readBoundedEncodedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const onAbort = () => { void reader.cancel(request.signal.reason).catch(() => {}); };
  request.signal.addEventListener("abort", onAbort, { once: true });
  let encoded = new Uint8Array();
  let bytes = 0;
  try {
    for (;;) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      request.signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      assertWithinLimit(bytes, MAX_ENCODED_REQUEST_BYTES, "Encoded request body");
      if (bytes > encoded.byteLength) {
        const capacity = Math.min(MAX_ENCODED_REQUEST_BYTES, Math.max(bytes, 4096, encoded.byteLength * 2));
        const grown = new Uint8Array(capacity);
        grown.set(encoded.subarray(0, bytes - value.byteLength));
        encoded = grown;
      }
      encoded.set(value, bytes - value.byteLength);
    }
  } catch (error) {
    // A Request clone tees its body. Cancellation of this reader alone may wait for the other
    // branch, so do not block the size-rejection response on that acknowledgement.
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  return encoded.subarray(0, bytes);
}

export async function readJsonRequestBody(request: Request): Promise<unknown> {
  request.signal.throwIfAborted();
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength)) {
    assertWithinLimit(declaredLength, MAX_ENCODED_REQUEST_BYTES, "Encoded request body");
  }

  const encoded = await readBoundedEncodedBody(request);

  const contentEncoding = (request.headers.get("content-encoding") ?? "identity").trim().toLowerCase();
  let decoded: Uint8Array;
  if (contentEncoding === "" || contentEncoding === "identity") {
    decoded = encoded;
  } else if (contentEncoding === "zstd") {
    decoded = await new Promise<Buffer>((resolve, reject) => {
      zstdDecompress(encoded, { maxOutputLength: MAX_DECODED_REQUEST_BYTES }, (error, result) => {
        if (error && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE") {
          reject(new RequestBodyLimitError(`Decoded request body exceeds ${MAX_DECODED_REQUEST_BYTES} bytes`));
        } else if (error) reject(error);
        else resolve(result);
      });
    });
  } else {
    throw new Error(`Unsupported Content-Encoding: ${contentEncoding}`);
  }
  assertWithinLimit(decoded.byteLength, MAX_DECODED_REQUEST_BYTES, "Decoded request body");
  request.signal.throwIfAborted();

  const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  return JSON.parse(text) as unknown;
}
