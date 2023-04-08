import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { deepMergeObject, type MergeableRecord } from '../util/objects'
import { type ILogObj, Logger } from 'tslog'
import { EOL } from 'os'
import * as readline from 'node:readline'

export interface RShellSessionOptions extends MergeableRecord {
  readonly pathToRExecutable: string
  readonly commandLineOptions: readonly string[]
  readonly cwd: string
  readonly eol: string
  readonly env: NodeJS.ProcessEnv
}

/**
 * Configuration of an {@link RShell} instance.
 * See {@link DEFAULT_R_SHELL_OPTIONS} for the default values used by {@link RShell}.
 */
export interface RShellOptions extends RShellSessionOptions {
  readonly sessionName: string
  // TODO: maybe sanitizer in the future?
}

export const DEFAULT_R_SHELL_OPTIONS: RShellOptions = {
  sessionName: 'default',
  pathToRExecutable: 'R',
  commandLineOptions: ['--vanilla', '--quiet', '--no-echo', '--no-save'],
  cwd: process.cwd(),
  env: process.env,
  eol: EOL
} as const

/**
 * RShell represents an interactive session with the R interpreter.
 * You can configure it by {@link RShellOptions}.
 *
 * TODO: in the future real language bindings like rpy2? but for ts?
 */
export class RShell {
  private readonly options: RShellOptions
  public readonly session: RShellSession
  private readonly log: Logger<ILogObj>

  public constructor(options?: Partial<RShellOptions>) {
    this.options = deepMergeObject(DEFAULT_R_SHELL_OPTIONS, options)
    // TODO: allow to configure loggers more globally, bt right now i want to get this working
    this.log = new Logger({ name: this.options.sessionName, type: 'pretty' })

    this.session = new RShellSession(this.options, this.log)
  }

  private _sendCommand(command: string): void {
    this.session.writeLine(command)
  }

  /**
   * sends the given command directly to the current R session
   * will not do anything to alter input markers!
   */
  public sendCommand(command: string): void {
    this.log.info(`> ${command}`)
    this._sendCommand(command)
  }

  /**
   * execute multiple commands in order
   *
   * @see sendCommand
   */
  public sendCommands(...commands: string[]): void {
    for (const element of commands) {
      this.sendCommand(element)
    }
  }

  /**
   * clears the R environment using the `rm` command.
   */
  public clearEnvironment(): void {
    this.sendCommand('rm(list=ls())')
  }

  // TODO: sync variant TODO: returns the loaded library or fails with error
  // TODO: allow to configure repos etc.
  // TODO: parser for errors
  // TODO: better name as we have to load at the same time!
  public async ensurePackageInstalled(packageName: string): Promise<string> {
    const successfulDone = new RegExp(`.*DONE *\\(${packageName}\\)`)

    await this.session.collectLinesUntil('both', data => successfulDone.test(data), {
      ms: 10_000,
      resetOnNewData: true
    }, () => {
      this.sendCommand(`
        if(!require(${packageName})) {
          temp <- tempdir()
          install.packages("${packageName}",repos="http://cran.us.r-project.org", quiet=FALSE, lib=temp)
          library("${packageName}", lib.loc=temp)
        }`)
    })
    return packageName
  }

  /**
   * close the current R session, makes the object effectively invalid (can no longer be reopened etc.)
   *
   * @return true if the operation succeeds, false otherwise
   */
  public close(): boolean {
    return this.session.end()
  }
}

export type OutputStreamSelector = 'stdout' | 'stderr' | 'both'
export type ExclusiveOutputStream = Exclude<OutputStreamSelector, 'both'>

export interface CollectorTimeout extends MergeableRecord {
  /**
   * number of milliseconds to wait for the collection to finish
   */
  ms: number
  /**
   * if true, the timeout will reset whenever we receive new data
   */
  resetOnNewData: boolean
  // errorOnTimeout: boolean // TODO: maybe needed in the future as a "greedy" variant?
}

/**
 * used to deal with the underlying input-output streams of the R process
 */
class RShellSession {
  private readonly bareSession: ChildProcessWithoutNullStreams
  private readonly sessionStdOut: readline.Interface
  private readonly sessionStdErr: readline.Interface
  private readonly options: RShellSessionOptions
  private readonly log: Logger<ILogObj>

  public constructor(options: RShellSessionOptions, log: Logger<ILogObj>) {
    this.bareSession = spawn(options.pathToRExecutable, options.commandLineOptions, {
      env: options.env,
      cwd: options.cwd,
      windowsHide: true
    })
    this.sessionStdOut = readline.createInterface({ input: this.bareSession.stdout, terminal: false })
    this.sessionStdErr = readline.createInterface({ input: this.bareSession.stderr, terminal: false })
    this.options = options
    this.log = log
    this.setupRSessionLoggers()
  }

  private setupRSessionLoggers(): void {
    this.bareSession.stdout.on('data', (data: Buffer) => {
      this.log.info(`< ${data.toString()}`)
    })
    this.bareSession.stderr.on('data', (data: string) => {
      this.log.error(`< ${data}`)
    })
    this.bareSession.on('close', (code: number) => {
      this.log.info(`session exited with code ${code}`)
    })
  }

  public write(data: string): void {
    this.bareSession.stdin.write(data)
  }

  public writeLine(data: string): void {
    this.write(`${data}${this.options.eol}`)
  }

  public onLine(selector: OutputStreamSelector, callback: (data: string) => void): void {
    this.on(selector, 'line', callback)
  }

  private on(from: OutputStreamSelector, event: string, listener: (...data: any[]) => void): void {
    const both = from === 'both'
    if (both || from === 'stdout') {
      this.sessionStdOut.on(event, listener)
    }
    if (both || from === 'stderr') {
      this.sessionStdErr.on(event, listener)
    }
  }

  private removeListener(from: OutputStreamSelector, event: string, listener: (...data: any[]) => void): void {
    const both = from === 'both'
    if (both || from === 'stdout') {
      this.sessionStdOut.removeListener(event, listener)
    }
    if (both || from === 'stderr') {
      this.sessionStdErr.removeListener(event, listener)
    }
  }

  /**
   * collect lines from the selected streams until the given condition is met or the timeout is reached
   *
   * this method does allow other listeners to consume the same input
   *
   * @from the stream(s) to collect the information from
   * @until if the predicate returns true, this will stop the collection and resolve the promise
   * @timeout configuration for how and when to timeout
   * @action event to be performed after all listeners are installed, this might be the action that triggers the output you want to collect
   */
  public async collectLinesUntil(from: OutputStreamSelector, until: ((data: string) => boolean), timeout: CollectorTimeout, action?: () => void): Promise<string[]> {
    const result: string[] = []
    let handler: (data: string) => void

    return await new Promise<string[]>((resolve, reject) => {
      const makeTimer = (): NodeJS.Timeout => setTimeout(() => { reject(new Error(`timeout reached (${JSON.stringify(result)})`)) }, timeout.ms)
      let timer = makeTimer()

      handler = (data: string): void => {
        result.push(data)
        if (until(data)) {
          clearTimeout(timer)
          resolve(result)
        } else if (timeout.resetOnNewData) {
          clearTimeout(timer)
          timer = makeTimer()
        }
      }
      this.onLine(from, handler)
      action?.()
    }).finally(() => {
      this.removeListener(from, 'line', handler)
    })
  }

  /**
   * close the current R session, makes the object effectively invalid (can no longer be reopened etc.)
   * TODO: find nice structure for this
   *
   * @return true if the kill succeeds, false otherwise
   * @see RShell#close
   */
  end(): boolean {
    return this.bareSession.kill()
  }
}
