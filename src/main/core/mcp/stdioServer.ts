import readline from 'readline';
import { ToolBackend } from './tools';

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/**
 * The Model Context Protocol over stdio: one JSON-RPC message per line.
 * stdout carries only protocol messages, so the caller must keep all logging on stderr.
 */
export function runStdioMcpServer(backend: ToolBackend, serverInfo: { name: string; version: string }): Promise<void> {
  const send = (message: Record<string, any>) => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  };

  const handle = async (request: any) => {
    const { id, method, params } = request;
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        return {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return {
          tools: (await backend.list()).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: { readOnlyHint: tool.readOnly }
          }))
        };
      case 'tools/call': {
        // A failed tool is a normal result the AI should read, not a protocol error
        try {
          const result = await backend.call(params?.name, params?.arguments || {});
          return { content: [{ type: 'text', text: JSON.stringify(result ?? null, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: 'text', text: err?.message || String(err) }], isError: true };
        }
      }
      default:
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601, requestId: id });
    }
  };

  return new Promise(resolve => {
    const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

    lines.on('line', async line => {
      if (!line.trim()) return;

      let request: any;
      try {
        request = JSON.parse(line);
      } catch {
        send({ id: null, error: { code: -32700, message: 'Parse error' } });
        return;
      }
      if (typeof request !== 'object' || request === null || Array.isArray(request) || typeof request.method !== 'string') {
        send({ id: request?.id ?? null, error: { code: -32600, message: 'Invalid request' } });
        return;
      }
      if (request.id === undefined) return; // Notifications expect no reply

      try {
        send({ id: request.id, result: await handle(request) });
      } catch (err: any) {
        send({ id: request.id, error: { code: err?.code ?? -32603, message: err?.message || 'Internal error' } });
      }
    });

    lines.on('close', () => resolve());
  });
}
