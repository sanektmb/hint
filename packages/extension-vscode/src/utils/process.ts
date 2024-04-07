import { spawn, SpawnOptions } from 'child_process';

/**
 * Spawn a child process to run the specified command.
 * Outputs logs to inherited stdio by default.
 */
/* istanbul ignore next */
export const run = (command: string, options?: SpawnOptions) => {
    const parts = command.split(' ');
    const spawnOptions: SpawnOptions = { stdio: 'inherit', windowsHide: true, ...options };
    const child = spawn(parts[0], parts.slice(1), spawnOptions);

    return new Promise<void>((resolve, reject) => {
        child.on('error', (err) => {
            reject(err);
        });

        child.on('exit', (code) => {
            if (code) {
                reject(new Error('NoExitCodeZero'));
            } else {
                resolve();
            }
        });
    });
};
