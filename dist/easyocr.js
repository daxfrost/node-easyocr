"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EasyOCR = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
class EasyOCR {
    constructor() {
        this.pythonProcess = null;
        this.pythonPath = 'python3';
        this.scriptPath = path_1.default.join(__dirname, 'easyocr_script.py');
    }
    async startPythonProcess() {
        if (this.pythonProcess)
            return;
        this.pythonProcess = (0, child_process_1.spawn)(this.pythonPath, [this.scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.pythonProcess.on('error', (error) => {
            console.error('Failed to start Python process:', error);
        });
        this.pythonProcess.on('exit', (code) => {
            console.log(`Python process exited with code ${code}`);
            this.pythonProcess = null;
        });
    }
    async sendCommand(command, args = []) {
        await this.startPythonProcess();
        if (!this.pythonProcess) {
            throw new Error('Failed to start Python process');
        }
        return new Promise((resolve, reject) => {
            const commandString = `${command} ${args.join(' ')}\n`;
            this.pythonProcess.stdin.write(commandString);
            // adding this to collect partial JSON payloads, to support larger more complex image files than the data buffer response supports (JSON will be incomplete)
            let fullResult = '';
            const onData = (data) => {
                const result = data.toString().trim();
                try {
                    const parsedResult = JSON.parse(result);
                    this.pythonProcess.stdout.removeListener('data', onData);
                    resolve(parsedResult);
                }
                catch (error) {
                    // handle commands for read_text of images differently if parsing fails
                    if (command === 'read_text') {
                        // add to the payload
                        fullResult += result;
                        try {
                            // try parse again in case it's complete
                            const parsedResult = JSON.parse(fullResult);
                            // if it is complete, we can finish the process
                            this.pythonProcess.stdout.removeListener('data', onData);
                            resolve(parsedResult);
                        }
                        catch (error) {
                            // it's incomplete, let's try again
                            console.log("waiting for full result... ", fullResult);
                        }
                    }
                    else {
                        // all other errors go here
                        reject(new Error(`Failed to parse Python output: ${error}`));
                    }
                }
            };
            this.pythonProcess.stdout.on('data', onData);
        });
    }
    async init(languages = ['en']) {
        const result = await this.sendCommand('init', languages);
        if (result.status !== 'success') {
            throw new Error(result.message || 'Failed to initialize EasyOCR');
        }
    }
    async readText(imagePath) {
        const result = await this.sendCommand('read_text', [imagePath]);
        if (result.status === 'success' && result.data) {
            return result.data;
        }
        else {
            throw new Error(result.message || 'Failed to read text from image');
        }
    }
    async close() {
        if (this.pythonProcess) {
            await this.sendCommand('close');
            this.pythonProcess.stdin.end();
            await new Promise((resolve) => {
                this.pythonProcess.on('close', () => {
                    this.pythonProcess = null;
                    resolve();
                });
            });
        }
    }
}
exports.EasyOCR = EasyOCR;
exports.default = EasyOCR;
