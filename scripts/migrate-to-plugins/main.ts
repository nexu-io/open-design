#!/usr/bin/env -S node --experimental-strip-types
// migrate-to-plugins/main.ts — wrap the four legacy resource roots
// (`prompt-templates/{image,video}/`, `skills/`, `design-systems/`) as
// bundled plugins under `plugins/_official/<tier>/<id>/`.
//
// Usage examples:
//
//   tsx scripts/migrate-to-plugins/main.ts \
//     --category image --ids e-commerce-live-stream-ui-mockup,illustrated-city-food-map
//
//   tsx scripts/migrate-to-plugins/main.ts --category all --limit 3
//
//   tsx scripts/migrate-to-plugins/main.ts --category example --dry-run
//
// `--ids` and `--limit` apply per-category; `--dry-run` reports what
// would be generated without writing to disk.

import {
  runImageTemplateGenerator,
  runVideoTemplateGenerator,
} from './image-template.ts';
import { runExampleGenerator } from './example.ts';
import { runDesignSystemGenerator } from './design-system.ts';

type Category = 'image' | 'video' | 'example' | 'design-system' | 'all';

interface CliArgs {
  category: Category;
  ids?: string[];
  limit?: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { category: 'all', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--category') {
      const next = argv[++i];
      if (!next || !isCategory(next)) throw new Error(`bad --category ${next}`);
      out.category = next;
    } else if (arg === '--ids') {
      const next = argv[++i];
      if (!next) throw new Error('missing --ids value');
      out.ids = next.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--limit') {
      const next = argv[++i];
      if (!next) throw new Error('missing --limit value');
      const n = Number(next);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`bad --limit ${next}`);
      out.limit = Math.floor(n);
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg) {
      throw new Error(`unknown flag ${arg}`);
    }
  }
  return out;
}

function isCategory(v: string): v is Category {
  return v === 'image' || v === 'video' || v === 'example' || v === 'design-system' || v === 'all';
}

function printHelp(): void {
  console.log(`migrate-to-plugins — wrap legacy resource roots as bundled plugins.

Flags:
  --category <image|video|example|design-system|all>   default: all
  --ids <id1,id2,...>                                  filter to specific source ids
  --limit <n>                                          cap items per category
  --dry-run                                            list intended writes without touching disk
  --help, -h
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const opts = {
    ...(args.ids ? { ids: args.ids } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    dryRun: args.dryRun,
  };

  const all = args.category === 'all';
  const totals = { generated: 0, skipped: 0 };

  if (all || args.category === 'image') {
    const stats = await runImageTemplateGenerator(opts);
    report('image-templates', stats);
    totals.generated += stats.generated.length;
    totals.skipped += stats.skipped.length;
  }
  if (all || args.category === 'video') {
    const stats = await runVideoTemplateGenerator(opts);
    report('video-templates', stats);
    totals.generated += stats.generated.length;
    totals.skipped += stats.skipped.length;
  }
  if (all || args.category === 'example') {
    const stats = await runExampleGenerator(opts);
    report('examples', stats);
    totals.generated += stats.generated.length;
    totals.skipped += stats.skipped.length;
  }
  if (all || args.category === 'design-system') {
    const stats = await runDesignSystemGenerator(opts);
    report('design-systems', stats);
    totals.generated += stats.generated.length;
    totals.skipped += stats.skipped.length;
  }
  console.log(
    `\nDone. generated=${totals.generated} skipped=${totals.skipped}${args.dryRun ? ' (dry-run)' : ''}`,
  );
}

function report(tier: string, stats: { generated: string[]; skipped: Array<{ id: string; reason: string }> }): void {
  console.log(`\n# ${tier}`);
  for (const id of stats.generated) console.log(`  + ${id}`);
  for (const sk of stats.skipped) console.log(`  ! ${sk.id}: ${sk.reason}`);
  if (stats.generated.length === 0 && stats.skipped.length === 0) {
    console.log('  (nothing to do)');
  }
}

main().catch((err) => {
  console.error('migrate-to-plugins failed:', err);
  process.exit(1);
});
