import { spawn } from 'child_process';
import { requestHandler } from '../tools/dev/src/index';

describe("Subprocess calls must not execute arbitrary shell commands", () => {
  const payloads = [
    // Exact exploit case: shell injection via command arguments
    { 
      command: "echo", 
      args: ["hello; cat /etc/passwd"] 
    },
    // Boundary case: nested command substitution
    { 
      command: "sh", 
      args: ["-c", "$(echo malicious)"] 
    },
    // Valid input (should still work safely)
    { 
      command: "echo", 
      args: ["safe"] 
    },
    // Additional adversarial: pipeline injection
    { 
      command: "ls", 
      args: ["|", "rm", "-rf", "/"] 
    },
    // Additional adversarial: environment variable injection
    { 
      command: "env", 
      args: ["$(id > /tmp/exploit)"] 
    }
  ];

  test.each(payloads)("rejects adversarial input: %s", async (payload) => {
    // Mock the spawn function to capture how it's called
    const spawnSpy = jest.spyOn(require('child_process'), 'spawn');
    
    // Call the actual production handler with adversarial input
    await requestHandler(payload);
    
    // Security property: spawn must be called with shell: false (default)
    // and arguments must be passed as array elements, not concatenated
    expect(spawnSpy).toHaveBeenCalled();
    const spawnCall = spawnSpy.mock.calls[0];
    
    // First assertion: shell option must be false or undefined
    const options = spawnCall[2] || {};
    expect(options.shell).toBeFalsy();
    
    // Second assertion: args must be exactly what we passed, not manipulated
    expect(spawnCall[1]).toEqual(payload.args);
    
    // Third assertion: command must match exactly, no string concatenation
    expect(spawnCall[0]).toBe(payload.command);
    
    spawnSpy.mockRestore();
  });
});