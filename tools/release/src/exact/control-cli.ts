import { cac } from "cac";
import { registerExactCommands } from "./commands.ts";

const cli = cac("tools-release");
registerExactCommands(cli);
cli.help();
cli.parse();
