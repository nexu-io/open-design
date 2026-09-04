import { parseFigmaFile } from './parser';
import { extractTokens } from './extract';
import { generateDesignSystem } from './generate';

function main(): void {
  const args = process.argv.slice(2);
  let input = '';
  let output = '';
  let name = 'Figma Import';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') input = args[++i] || '';
    else if (args[i] === '--output' || args[i] === '-o') output = args[++i] || '';
    else if (args[i] === '--name' || args[i] === '-n') name = args[++i] || 'Figma Import';
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('figma-file-convert: Convert .fig files to OpenDesign design systems');
      console.log('');
      console.log('Usage:');
      console.log('  node dist/index.js --input <file.fig> --output <dir> [--name "My Brand"]');
      console.log('');
      console.log('Options:');
      console.log('  -i, --input   Input .fig file path (required)');
      console.log('  -o, --output  Output directory for design system (required)');
      console.log('  -n, --name    Design system name (default: "Figma Import")');
      console.log('  -h, --help    Show this help');
      process.exit(0);
    }
  }

  if (!input || !output) {
    console.error('Error: --input and --output are required. Use --help for usage.');
    process.exit(1);
  }

  console.log(`Parsing: ${input}`);
  const file = parseFigmaFile(input);
  console.log(`  ${file.nodeCount} nodes, ${file.pageCount} pages`);

  console.log('Extracting tokens...');
  const tokens = extractTokens(file);
  console.log(`  ${tokens.colors.length} colors, ${tokens.fonts.length} fonts, ${tokens.spacings.length} spacings, ${tokens.radii.length} radii, ${tokens.componentNames.length} components`);

  console.log(`Generating design system: ${output}`);
  generateDesignSystem(output, name, tokens);
  console.log(`  DESIGN.md, design-tokens.json, tokens.css, manifest.json created`);
  console.log('');
  console.log('Done! Restart the daemon to see the new design system in the picker.');
}

main();
