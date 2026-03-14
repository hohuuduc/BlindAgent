// src/utils/spinner.ts

export class Spinner {
    static activeSpinner: Spinner | null = null;
    private timer: NodeJS.Timeout | null = null;
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private currentFrame = 0;
    private text = '';
    public isPaused = false;

    constructor(text: string) {
        this.text = text;
    }

    start() {
        if (this.timer) return;
        Spinner.activeSpinner = this;
        this.isPaused = false;
        process.stdout.write('\x1B[?25l'); // hide cursor
        this.timer = setInterval(() => {
            this.render();
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 80);
    }

    render() {
        if (!this.isPaused) {
            process.stdout.write(`\r\x1b[36m${this.frames[this.currentFrame]}\x1b[0m ${this.text}\x1b[K`);
        }
    }

    clear() {
        process.stdout.write('\r\x1b[K');
    }

    pause() {
        if (this.timer && !this.isPaused) {
            this.isPaused = true;
            this.clear();
            process.stdout.write('\x1B[?25h'); // show cursor
        }
    }

    resume() {
        if (this.timer && this.isPaused) {
            this.isPaused = false;
            process.stdout.write('\x1B[?25l'); // hide cursor
            this.render();
        }
    }

    stop(finalText?: string, isError = false) {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (Spinner.activeSpinner === this) {
            Spinner.activeSpinner = null;
        }
        this.isPaused = false;
        process.stdout.write('\r\x1b[K'); // clear line
        process.stdout.write('\x1B[?25h'); // show cursor
        if (finalText) {
            const icon = isError ? '\x1b[31m✖\x1b[0m' : '\x1b[32m✔\x1b[0m';
            console.log(`${icon} ${finalText}`);
        }
    }

    update(text: string) {
        this.text = text;
    }
}
