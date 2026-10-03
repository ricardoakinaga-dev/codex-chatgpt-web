import type { ConnectOverCDPTransport } from "playwright-core";

interface CdpCommand {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
}

/** One independent CDP connection for a launcher-proved target and its child frames/workers. */
export class ScopedCdpTransport implements ConnectOverCDPTransport {
  onmessage?: (message: object) => void;
  onclose?: (reason?: string) => void;
  private socket?: WebSocket;
  private queued: string[] = [];
  private closed = false;
  private notified = false;
  private readonly browserSessions = new Set<string>();
  private readonly browserAttachments = new Set<number>();
  private resolveClosed!: () => void;
  private readonly physicalClose = new Promise<void>(resolve => { this.resolveClosed = resolve; });

  constructor(private readonly endpoint: string, private readonly targetId: string) {
    const url = new URL(endpoint);
    if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || url.username || url.password || !targetId.trim()) {
      throw new Error("Scoped CDP requires a loopback WebSocket and an exact native target");
    }
  }

  open(): void {
    if (this.socket || this.closed) return;
    const socket = this.socket = new WebSocket(this.endpoint);
    socket.onopen = () => {
      if (this.closed) { socket.close(); return; }
      for (const message of this.queued) socket.send(message);
      this.queued = [];
    };
    socket.onmessage = event => {
      if (this.closed) return;
      try {
        if (typeof event.data !== "string") throw new Error("Invalid CDP frame");
        const frame = JSON.parse(event.data) as { id?: number; result?: { sessionId?: string };
          method?: string; params?: { sessionId?: string; targetInfo?: { type?: string } } };
        if (frame.id !== undefined && this.browserAttachments.delete(frame.id) && frame.result?.sessionId) {
          this.browserSessions.add(frame.result.sessionId);
        }
        if (frame.method === "Target.attachedToTarget" && frame.params?.targetInfo?.type === "browser" && frame.params.sessionId) {
          this.browserSessions.add(frame.params.sessionId);
        }
        this.onmessage?.(frame);
      } catch {
        void this.close();
      }
    };
    socket.onerror = () => { void this.close(); };
    socket.onclose = () => {
      this.closed = true;
      this.queued = [];
      this.notifyClosed();
    };
  }

  send(message: object): void {
    if (this.closed) throw new Error("Scoped CDP transport is closed");
    let command = message as CdpCommand;
    if (!command.sessionId || this.browserSessions.has(command.sessionId)) {
      if (command.method === "Target.attachToBrowserTarget" && command.id !== undefined) {
        this.browserAttachments.add(command.id);
      }
      if (command.method === "Target.setAutoAttach" && command.params?.autoAttach === true) {
        // Browser-wide auto-attach initializes every page, so an unrelated blocked renderer can
        // prevent even a responsive leased page from connecting. CDP provides this target-scoped
        // operation; descendant Target.setAutoAttach commands keep their original session routing.
        command = { ...command, method: "Target.autoAttachRelated", params: {
          targetId: this.targetId, waitForDebuggerOnStart: command.params.waitForDebuggerOnStart === true,
        } };
      } else if ((["Target.attachToTarget", "Target.closeTarget", "Target.getTargetInfo", "Target.autoAttachRelated"].includes(command.method ?? "")
        && command.params?.targetId !== undefined && command.params.targetId !== this.targetId)
        || command.method === "Target.createTarget" || command.method === "Browser.close") {
        queueMicrotask(() => this.onmessage?.({ id: command.id, ...(command.sessionId ? { sessionId: command.sessionId } : {}),
          error: { code: -32000, message: "CDP command is outside the leased launcher target" } }));
        return;
      }
    }
    this.open();
    const encoded = JSON.stringify(command);
    if (this.socket!.readyState === WebSocket.OPEN) this.socket!.send(encoded);
    else this.queued.push(encoded);
  }

  close(): Promise<void> {
    if (this.closed) return this.physicalClose;
    this.closed = true;
    this.queued = [];
    if (this.socket) this.socket.close();
    else this.notifyClosed();
    return this.physicalClose;
  }

  private notifyClosed(): void {
    if (this.notified) return;
    this.notified = true;
    queueMicrotask(() => this.onclose?.("Scoped CDP connection closed"));
    this.resolveClosed();
  }
}
