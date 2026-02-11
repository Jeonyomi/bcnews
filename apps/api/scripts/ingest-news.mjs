import { PrismaClient } from '@prisma/client';

// Reads a JSON object from stdin:
// { title: string, contentMd: string, source?: string }
// Writes created record as JSON to stdout.

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const prisma = new PrismaClient();

try {
  const raw = await readStdin();
  const input = JSON.parse(raw || '{}');

  const title = String(input.title ?? '').trim();
  const contentMd = String(input.contentMd ?? '').trim();
  const source = String(input.source ?? 'cron');

  if (!title) throw new Error('title is required');
  if (!contentMd) throw new Error('contentMd is required');

  const created = await prisma.newsBrief.create({
    data: { title, contentMd, source },
  });

  process.stdout.write(JSON.stringify({ ok: true, id: created.id }));
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stdout.write(JSON.stringify({ ok: false, error: msg }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
