export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly buffered: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  /**
   * `throw` (default) keeps a hard memory ceiling for a queue whose consumer can stall.
   * `grow` is for callers that start a consumer before producing (the non-streaming Responses
   * path): the buffer is then bounded by the producer/consumer gap instead of failing a long turn
   * with a false "completed" result.
   */
  constructor(
    private readonly maxBuffered = 10_000,
    private readonly overflow: "throw" | "grow" = "throw",
  ) {}

  push(value: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    if (this.overflow === "throw" && this.buffered.length >= this.maxBuffered) {
      throw new Error("Adapter event backlog exceeded");
    }
    this.buffered.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length > 0) this.waiters.shift()!({ value: undefined, done: true });
  }

  async collect(): Promise<T[]> {
    const values: T[] = [];
    for await (const value of this) values.push(value);
    return values;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.buffered.shift();
        if (value !== undefined) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise(resolve => this.waiters.push(resolve));
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
