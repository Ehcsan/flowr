import { type ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { deepMergeObject, type MergeableRecord } from '../util/objects'
import { type ILogObj, type Logger } from 'tslog'
import * as readline from 'node:readline'
import { ts2r } from './lang-4.x'
import { log, LogLevel } from '../util/log'
import type { SemVer } from 'semver'
import semver from 'semver/preload'
import { getPlatform } from '../util/os'
import fs from 'fs'

export type OutputStreamSelector = 'stdout' | 'stderr' | 'both';

export interface CollectorTimeout extends MergeableRecord {
	/**
   * number of milliseconds to wait for the collection to finish
   */
	ms:             number
	/**
   * if true, the timeout will reset whenever we receive new data
   */
	resetOnNewData: boolean
}

interface CollectorUntil extends MergeableRecord {
	predicate:       (data: string) => boolean
	includeInResult: boolean
}

/**
 * Configuration for the internal output collector used by the {@link RShell}
 * The defaults are configured with {@link DEFAULT_OUTPUT_COLLECTOR_CONFIGURATION}
 */
export interface OutputCollectorConfiguration extends MergeableRecord {
	/** the streams to use to collect the output from */
	from:                    OutputStreamSelector
	/**
   * a string marker to signal that the command was executed successfully.
   * must not appear as a standalone line in the output. this is our hacky way of ensuring that we are done.
   */
	postamble:               string
	/** internal timeout configuration to use (see {@link CollectorTimeout}) */
	timeout:                 CollectorTimeout
	/** should the postamble be included in the result? */
	keepPostamble:           boolean
	/** automatically trim all lines in the output (useful to ignore trailing whitespace etc.) */
	automaticallyTrimOutput: boolean
}

export const DEFAULT_OUTPUT_COLLECTOR_CONFIGURATION: OutputCollectorConfiguration = {
	from:      'stdout',
	postamble: `🐧${'-'.repeat(5)}🐧`,
	timeout:   {
		ms:             750_000,
		resetOnNewData: true
	},
	keepPostamble:           false,
	automaticallyTrimOutput: true,
	errorStopsWaiting:       true
}

export interface RShellExecutionOptions extends MergeableRecord {
	/** The path to the R executable, can be only the executable if it is to be found on the PATH. */
	readonly pathToRExecutable:  string
	/** Command line options to use when starting the R session. */
	readonly commandLineOptions: readonly string[]
	/** The current working directory of the R session. */
	readonly cwd:                string
	/** The character to use to mark the end of a line. Is probably always `\n` (even on windows). */
	readonly eol:                string
	/** The environment variables available in the R session. */
	readonly env:                NodeJS.ProcessEnv
	/** The path to the library directory, use undefined to let R figure that out for itself */
	readonly homeLibPath:        string | undefined
}

export interface RShellSessionOptions extends RShellExecutionOptions {
	/** If set, the R session will be restarted if it exits due to an error */
	readonly revive:   'never' | 'on-error' | 'always'
	/** Called when the R session is restarted, this makes only sense if `revive` is not set to `'never'` */
	readonly onRevive: (code: number, signal: string | null) => void
}

/**
 * Configuration of an {@link RShell} instance.
 * See {@link DEFAULT_R_SHELL_OPTIONS} for the default values used by {@link RShell}.
 */
export interface RShellOptions extends RShellSessionOptions {
	readonly sessionName: string
}

export const DEFAULT_R_SHELL_EXEC_OPTIONS: RShellExecutionOptions = {
	pathToRExecutable:  getPlatform() === 'windows' ? 'R.exe' : 'R',
	commandLineOptions: ['--vanilla', '--quiet', '--no-echo', '--no-save'],
	cwd:                process.cwd(),
	env:                process.env,
	eol:                '\n',
	homeLibPath:        getPlatform() === 'windows' ? undefined : '~/.r-libs'
} as const

export const DEFAULT_R_SHELL_OPTIONS: RShellOptions = {
	...DEFAULT_R_SHELL_EXEC_OPTIONS,
	sessionName: 'default',
	revive:      'never',
	onRevive:    () => { /* do nothing */ }
} as const

/**
 * The `RShell` represents an interactive session with the R interpreter.
 * You can configure it by {@link RShellOptions}.
 *
 * At the moment we are using a live R session (and not networking etc.) to communicate with R easily,
 * which allows us to install packages etc. However, this might and probably will change in the future (leaving this
 * as a legacy mode :D)
 */
export class RShell {
	public readonly options: Readonly<RShellOptions>
	private session:         RShellSession
	private readonly log:    Logger<ILogObj>
	private versionCache:    SemVer | null = null
	// should never be more than one, but let's be sure
	private tempDirs         = new Set<string>()

	public constructor(options?: Partial<RShellOptions>) {
		this.options = deepMergeObject(DEFAULT_R_SHELL_OPTIONS, options)
		this.log = log.getSubLogger({ name: this.options.sessionName })

		this.session = new RShellSession(this.options, this.log)
		this.revive()
	}

	private revive() {
		if(this.options.revive === 'never') {
			return
		}

		this.session.onExit((code, signal) => {
			if(this.options.revive === 'always' || (this.options.revive === 'on-error' && code !== 0)) {
				this.log.warn(`R session exited with code ${code}, reviving!`)
				this.options.onRevive(code, signal)
				this.session = new RShellSession(this.options, this.log)
				this.revive()
			}
		})
	}

	/**
   * sends the given command directly to the current R session
   * will not do anything to alter input markers!
   */
	public sendCommand(command: string): void {
		if(this.log.settings.minLevel >= LogLevel.Trace) {
			this.log.trace(`> ${JSON.stringify(command)}`)
		}
		this._sendCommand(command)
	}

	public async usedRVersion(): Promise<SemVer | null> {
		if(this.versionCache !== null) {
			return this.versionCache
		}
		// retrieve raw version:
		const result = await this.sendCommandWithOutput(`cat(paste0(R.version$major,".",R.version$minor), ${ts2r(this.options.eol)})`)
		this.log.trace(`raw version: ${JSON.stringify(result)}`)
		this.versionCache = semver.coerce(result[0])
		return result.length === 1 ? this.versionCache : null
	}

	public injectLibPaths(...paths: string[]): void {
		this.log.debug(`injecting lib paths ${JSON.stringify(paths)}`)
		this._sendCommand(`.libPaths(c(.libPaths(), ${paths.map(ts2r).join(',')}))`)
	}

	public tryToInjectHomeLibPath(): void {
		// ensure the path exists first
		if(this.options.homeLibPath === undefined) {
			this.log.debug('ensuring home lib path exists (automatic inject)')
			this.sendCommand('if(!dir.exists(Sys.getenv("R_LIBS_USER"))) { dir.create(path=Sys.getenv("R_LIBS_USER"),showWarnings=FALSE,recursive=TRUE) }')
			this.sendCommand('.libPaths(c(.libPaths(), Sys.getenv("R_LIBS_USER")))')
		} else {
			this.injectLibPaths(this.options.homeLibPath)
		}
	}

	/**
	 * checks if a given package is already installed on the system!
	 */
	public async isPackageInstalled(packageName: string): Promise<boolean> {
		this.log.debug(`checking if package "${packageName}" is installed`)
		const result = await this.sendCommandWithOutput(
			`cat(system.file(package="${packageName}")!="","${this.options.eol}")`)
		return result.length === 1 && result[0] === 'TRUE'
	}


	/**
   * Send a command and collect the output
   *
   * @param command     - The R command to execute (similar to {@link sendCommand})
   * @param addonConfig - Further configuration on how and what to collect: see {@link OutputCollectorConfiguration},
   *                      defaults are set in {@link DEFAULT_OUTPUT_COLLECTOR_CONFIGURATION}
   */
	public async sendCommandWithOutput(command: string, addonConfig?: Partial<OutputCollectorConfiguration>): Promise<string[]> {
		const config = deepMergeObject(DEFAULT_OUTPUT_COLLECTOR_CONFIGURATION, addonConfig)
		if(this.log.settings.minLevel >= LogLevel.Trace) {
			this.log.trace(`> ${JSON.stringify(command)}`)
		}

		const output = await this.session.collectLinesUntil(config.from, {
			predicate:       data => data === config.postamble,
			includeInResult: config.keepPostamble // we do not want the postamble
		}, config.timeout, () => {
			this._sendCommand(command)
			if(config.from === 'stderr') {
				this._sendCommand(`cat("${config.postamble}${this.options.eol}", file=stderr())`)
			} else {
				this._sendCommand(`cat("${config.postamble}${this.options.eol}")`)
			}
		})
		if(config.automaticallyTrimOutput) {
			return output.map(line => line.trim())
		} else {
			return output
		}
	}

	/**
   * execute multiple commands in order
   *
   * @see sendCommand
   */
	public sendCommands(...commands: string[]): void {
		for(const element of commands) {
			this.sendCommand(element)
		}
	}

	/**
   * clears the R environment using the `rm` command.
   */
	public clearEnvironment(): void {
		this.log.debug('clearing environment')
		this._sendCommand('rm(list=ls())')
	}

	/**
   * usually R will stop execution on errors, with this the R session will try to
   * continue working!
   */
	public continueOnError(): void {
		this.log.info('continue in case of Errors')
		this._sendCommand('options(error=function() {})')
	}

	/**
	 * Obtain the temporary directory used by R.
	 * Additionally, this marks the directory for removal when the shell exits.
	 */
	public async obtainTmpDir(): Promise<string> {
		this.sendCommand('temp <- tempdir()')
		const [tempdir] = await this.sendCommandWithOutput(`cat(temp, ${ts2r(this.options.eol)})`)
		this.tempDirs.add(tempdir)
		return tempdir
	}

	/**
   * Close the current R session, makes the object effectively invalid (can no longer be reopened etc.)
   *
   * @returns true if the operation succeeds, false otherwise
   */
	public close(): boolean {
		return this.session.end([...this.tempDirs])
	}

	private _sendCommand(command: string): void {
		this.session.writeLine(command)
	}
}

/**
 * Used to deal with the underlying input-output streams of the R process
 */
class RShellSession {
	private readonly bareSession:   ChildProcessWithoutNullStreams
	private readonly sessionStdOut: readline.Interface
	private readonly sessionStdErr: readline.Interface
	private readonly options:       RShellSessionOptions
	private readonly log:           Logger<ILogObj>
	private collectionTimeout:      NodeJS.Timeout | undefined

	public constructor(options: RShellSessionOptions, log: Logger<ILogObj>) {
		this.bareSession = spawn(options.pathToRExecutable, options.commandLineOptions, {
			env:         options.env,
			cwd:         options.cwd,
			windowsHide: true
		})
		this.sessionStdOut = readline.createInterface({
			input:    this.bareSession.stdout,
			terminal: false
		})
		this.sessionStdErr = readline.createInterface({
			input:    this.bareSession.stderr,
			terminal: false
		})
		this.onExit(() => {
			this.end()
		})
		this.options = options
		this.log = log
		this.setupRSessionLoggers()
	}

	public write(data: string): void {
		this.bareSession.stdin.write(data)
	}

	public writeLine(data: string): void {
		this.write(`${data}${this.options.eol}`)
	}

	/**
   * Collect lines from the selected streams until the given condition is met or the timeout is reached
   *
   * This method does allow other listeners to consume the same input
   *
   * @param from        - The stream(s) to collect the information from
   * @param until       - If the predicate returns true, this will stop the collection and resolve the promise
   * @param timeout     - Configuration for how and when to timeout
   * @param action      - Event to be performed after all listeners are installed, this might be the action that triggers the output you want to collect
   */
	public async collectLinesUntil(from: OutputStreamSelector, until: CollectorUntil, timeout: CollectorTimeout, action?: () => void): Promise<string[]> {
		const result: string[] = []
		let handler: (data: string) => void
		let error: (code: number) => void

		return await new Promise<string[]>((resolve, reject) => {
			const makeTimer = (): NodeJS.Timeout => setTimeout(() => {
				reject(new Error(`timeout of ${timeout.ms}ms reached (${JSON.stringify(result)})`))
			}, timeout.ms)
			this.collectionTimeout = makeTimer()

			handler = (data: string): void => {
				const end = until.predicate(data)
				if(!end || until.includeInResult) {
					result.push(data)
				}
				if(end) {
					clearTimeout(this.collectionTimeout)
					resolve(result)
				} else if(timeout.resetOnNewData) {
					clearTimeout(this.collectionTimeout)
					this.collectionTimeout = makeTimer()
				}
			}

			error = () => {
				resolve(result)
			}
			this.onExit(error)
			this.on(from, 'line', handler)
			action?.()
		}).finally(() => {
			this.removeListener(from, 'line', handler)
			this.bareSession.removeListener('exit', error)
			this.bareSession.stdin.removeListener('error', error)
		})
	}

	/**
   * close the current R session, makes the object effectively invalid (can no longer be reopened etc.)
   *
	 * @param filesToUnlink - If set, these files will be unlinked before closing the session (e.g., to clean up tempfiles)
	 *
   * @returns true if the kill succeeds, false otherwise
   * @see RShell#close
   */
	end(filesToUnlink?: string[]): boolean {
		if(filesToUnlink !== undefined) {
			log.info(`unlinking ${filesToUnlink.length} files (${JSON.stringify(filesToUnlink)})`)
			for(const f of filesToUnlink) {
				fs.rmSync(f, { recursive: true, force: true })
			}
		}

		const killResult = this.bareSession.kill()
		if(this.collectionTimeout !== undefined) {
			clearTimeout(this.collectionTimeout)
		}
		this.sessionStdOut.close()
		this.sessionStdErr.close()
		log.info(`killed R session with pid ${this.bareSession.pid ?? '<unknown>'} and result ${killResult ? 'successful' : 'failed'} (including streams)`)
		return killResult
	}

	private setupRSessionLoggers(): void {
		if(this.log.settings.minLevel >= LogLevel.Trace) {
			this.bareSession.stdout.on('data', (data: Buffer) => {
				this.log.trace(`< ${data.toString()}`)
			})
			this.bareSession.on('close', (code: number) => {
				this.log.trace(`session exited with code ${code}`)
			})
		}
		this.bareSession.stderr.on('data', (data: string) => {
			this.log.warn(`< ${data}`)
		})
	}

	public onExit(callback: (code: number, signal: string | null) => void): void {
		this.bareSession.on('exit', callback)
		this.bareSession.stdin.on('error', callback)
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private on(from: OutputStreamSelector, event: string, listener: (...data: any[]) => void): void {
		const both = from === 'both'
		if(both || from === 'stdout') {
			this.sessionStdOut.on(event, listener)
		}
		if(both || from === 'stderr') {
			this.sessionStdErr.on(event, listener)
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private removeListener(from: OutputStreamSelector, event: string, listener: (...data: any[]) => void): void {
		const both = from === 'both'
		if(both || from === 'stdout') {
			this.sessionStdOut.removeListener(event, listener)
		}
		if(both || from === 'stderr') {
			this.sessionStdErr.removeListener(event, listener)
		}
	}
}
