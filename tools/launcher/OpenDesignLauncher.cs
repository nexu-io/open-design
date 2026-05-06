using System;
using System.Diagnostics;
using System.IO;

namespace OpenDesignLauncher
{
    internal static class Program
    {
        private static int Main()
        {
            Console.Title = "Open Design Launcher";
            Console.WriteLine("Open Design launcher");
            Console.WriteLine();

            string repoRoot = FindRepoRoot(AppDomain.CurrentDomain.BaseDirectory);
            if (repoRoot == null)
            {
                Console.Error.WriteLine("Could not find the Open Design repository root.");
                Console.Error.WriteLine("Place OpenDesign.exe in the repository root next to package.json.");
                Pause();
                return 1;
            }

            Console.WriteLine("Repository: " + repoRoot);

            if (!Directory.Exists(Path.Combine(repoRoot, "node_modules", ".pnpm")))
            {
                Console.WriteLine("Dependencies are missing. Running pnpm install first...");
                // Requires corepack (bundled with Node 16.9+) so future maintainers know the dependency.
                int installExit = RunCommand(repoRoot, "corepack pnpm install");
                if (installExit != 0)
                {
                    Console.Error.WriteLine("pnpm install failed with exit code " + installExit + ".");
                    Pause();
                    return installExit;
                }
            }

            Console.WriteLine("Starting Open Design with pnpm tools-dev...");
            Console.WriteLine();
            int exitCode = RunCommand(repoRoot, "corepack pnpm tools-dev");
            if (exitCode != 0)
            {
                Console.Error.WriteLine();
                Console.Error.WriteLine("Open Design exited with code " + exitCode + ".");
                Pause();
            }
            else
            {
                Console.WriteLine();
                Console.WriteLine("Open Design command completed. Press any key to close this window.");
                Console.ReadKey(true);
            }

            return exitCode;
        }

        private static string FindRepoRoot(string startDirectory)
        {
            DirectoryInfo current = new DirectoryInfo(startDirectory);
            while (current != null)
            {
                string packageJson = Path.Combine(current.FullName, "package.json");
                string workspace = Path.Combine(current.FullName, "pnpm-workspace.yaml");
                if (File.Exists(packageJson) && File.Exists(workspace))
                {
                    return current.FullName;
                }
                current = current.Parent;
            }
            return null;
        }

        private static int RunCommand(string workingDirectory, string command)
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = "cmd.exe";
            info.Arguments = "/d /c \"" + command + "\"";
            info.WorkingDirectory = workingDirectory;
            info.UseShellExecute = false;

            using (Process process = Process.Start(info))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }

        private static void Pause()
        {
            Console.WriteLine("Press any key to close this window.");
            Console.ReadKey(true);
        }
    }
}
