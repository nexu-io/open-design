import { Client } from 'pg';

interface RequestBody {
  config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    sslMode?: 'disable' | 'require' | 'verify-full';
  };
  sql: string;
}

async function main(): Promise<void> {
  const input = await readStdin();
  const request = JSON.parse(input) as RequestBody;
  const client = new Client({
    host: request.config.host,
    port: request.config.port,
    database: request.config.database,
    user: request.config.user,
    password: request.config.password,
    ssl: request.config.sslMode === 'disable'
      ? false
      : { rejectUnauthorized: request.config.sslMode === 'verify-full' },
  });
  await client.connect();
  try {
    const result = await client.query(request.sql);
    process.stdout.write(JSON.stringify({
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    }));
  } finally {
    await client.end();
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(data));
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message);
  process.exitCode = 1;
});
