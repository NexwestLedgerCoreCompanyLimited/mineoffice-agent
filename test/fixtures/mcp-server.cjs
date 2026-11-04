// A small stdio MCP server for tests. Speaks newline-delimited JSON-RPC, as the spec says.
const readline = require('readline');

const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const argument = process.argv[2] || '';

// Real servers sometimes log to stdout. A client has to survive it.
process.stdout.write('starting up, this line is not JSON\n');

const TOOLS = [
  { name: 'echo', description: 'Says the text back.', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'env_names', description: 'Lists environment variable names.', inputSchema: { type: 'object' } },
  { name: 'broken', description: 'Always reports an error.', inputSchema: { type: 'object' } },
  { name: 'huge', description: 'Returns a very long text.', inputSchema: { type: 'object' } },
  { name: 'ask_for_sampling', description: 'Asks the client to spend its AI credits.', inputSchema: { type: 'object' } },
  { name: 'die', description: 'Exits at once.', inputSchema: { type: 'object' } },
  { name: 'argument', description: 'Returns the command line argument.', inputSchema: { type: 'object' } }
];

let pendingSampling = null;

readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);

  if (pendingSampling !== null && message.id === 'sampling-1') {
    send({ jsonrpc: '2.0', id: pendingSampling, result: { content: [{ type: 'text', text: JSON.stringify(message.error ?? message.result) }] } });
    pendingSampling = null;
    return;
  }

  const reply = result => send({ jsonrpc: '2.0', id: message.id, result });
  const text = value => reply({ content: [{ type: 'text', text: value }] });

  switch (message.method) {
    case 'initialize':
      reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } });
      break;
    case 'notifications/initialized':
      break;
    case 'tools/list':
      reply({ tools: TOOLS });
      break;
    case 'tools/call': {
      const { name, arguments: args } = message.params;
      if (name === 'echo') text(`echo: ${args.text}`);
      else if (name === 'env_names') text(Object.keys(process.env).join(','));
      else if (name === 'broken') reply({ isError: true, content: [{ type: 'text', text: 'it broke' }] });
      else if (name === 'huge') text('x'.repeat(100 * 1024));
      else if (name === 'argument') text(argument);
      else if (name === 'die') process.exit(3);
      else if (name === 'ask_for_sampling') {
        pendingSampling = message.id;
        send({ jsonrpc: '2.0', id: 'sampling-1', method: 'sampling/createMessage', params: {} });
      } else send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: `Unknown tool: ${name}` } });
      break;
    }
    default:
      if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
  }
});
