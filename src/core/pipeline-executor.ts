import { NoInfo, NormalizedAst } from '../r-bridge'
import { executeSingleSubStep, StepHasToBeExecuted, StepName, StepResult, StepResults, STEPS_PER_SLICE } from './steps'
import { guard } from '../util/assert'
import { SliceResult, SlicingCriteria } from '../slicing'
import { DataflowInformation } from '../dataflow/internal/info'
import { Pipeline, PipelineInput, PipelineOutput } from './steps/pipeline'

/**
 * TODO: This is ultimately the root of flowR's static slicing procedure.
 * It clearly defines the steps that are to be executed and splits them into two stages.
 * - `once-per-file`: for steps that are executed once per file. These can be performed *without* the knowledge of a slicing criteria,
 *   and they can be cached and re-used if you want to slice the same file multiple times.
 * - `once-per-slice`: for steps that are executed once per slice. These can only be performed *with* a slicing criteria.
 *
 * Furthermore, this stepper follows an iterable fashion to be *as flexible as possible* (e.g., to be instrumented with measurements).
 * So, you can use the stepping slicer like this:
 *
 * ```ts
 * const slicer = new SteppingSlicer({ ... })
 * while(slicer.hasNextStep()) {
 *     await slicer.nextStep()
 * }
 *
 * slicer.switchToSliceStage()
 *
 * while(slicer.hasNextStep()) {
 *     await slicer.nextStep()
 * }
 *
 * const result = slicer.getResults()
 * ```
 *
 * Of course, you might think, that this is rather overkill if you simply want to receive the slice of a given input source or in general
 * the result of any step. And this is true. Therefore, if you do not want to perform some kind of magic in-between steps, you can use the
 * **{@link allRemainingSteps}** function like this:
 *
 * ```ts
 * const slicer = new SteppingSlicer({ ... })
 * const result = await slicer.allRemainingSteps()
 * ```
 *
 * As the name suggest, you can combine this name with previous calls to {@link nextStep} to only execute the remaining steps.
 *
 * Giving the **step of interest** allows you to declare the maximum step to execute.
 * So, if you pass `dataflow` as the step of interest, the stepping slicer will stop after the dataflow step.
 * If you do not pass a step, the stepping slicer will execute all steps.
 *
 * By default, the {@link PipelineExecutor} does not offer an automatic way to repeat the per-slice steps for multiple slices (this is mostly to prevent accidental errors).
 * However, you can use the **{@link updateCriterion}** function to reset the per-slice steps and re-execute them for a new slice. This allows something like the following:
 *
 * ```ts
 * const slicer = new SteppingSlicer({ ... })
 * const result = await slicer.allRemainingSteps()
 *
 * slicer.updateCriterion(...)
 * const result2 = await slicer.allRemainingSteps()
 * ```
 *
 * @note Even though, using the stepping slicer introduces some performance overhead, we consider
 * it to be the baseline for performance benchmarking. It may very well be possible to squeeze out some more performance by
 * directly constructing the steps in the right order. However, we consider this to be negligible when compared with the time required
 * for, for example, the dataflow analysis.
 *
 * @see retrieveResultOfStep
 * @see PipelineExecutor#doNextStep
 * @see StepName
 */
export class PipelineExecutor<P extends Pipeline> {
	private readonly pipeline: P
	private readonly input:    PipelineInput<P>
	private output:            PipelineOutput<P> = {} as PipelineOutput<P>

	private currentExecutionStage = StepHasToBeExecuted.OncePerFile
	private stepCounter = 0

	/**
	 * Create a new stepping slicer. For more details on the arguments please see {@link SteppingSlicerInput}.
	 */
	constructor(pipeline: P, input: PipelineInput<P>) {
		this.pipeline = pipeline
		this.input = input
	}

	/**
	 * Retrieve the current stage the pipeline executor is in.
	 * @see currentExecutionStage
	 * @see switchToRequestStage
	 */
	public getCurrentStage(): StepHasToBeExecuted {
		return this.currentExecutionStage
	}

	/**
	 * Switch to the next stage of the stepping slicer.
	 * @see PipelineExecutor
	 * @see getCurrentStage
	 */
	public switchToRequestStage(): void {
		guard(this.pipeline.firstStepPerRequest === undefined || this.stepCounter === this.pipeline.firstStepPerRequest, 'First need to complete all steps before switching')
		guard(this.currentExecutionStage === StepHasToBeExecuted.OncePerFile, 'Cannot switch to next stage, already in per-request stage.')
		this.currentExecutionStage = StepHasToBeExecuted.OncePerRequest
	}


	public getResults(intermediate?:false): PipelineOutput<P>
	public getResults(intermediate: true): Partial<PipelineOutput<P>>
	/**
	 * Returns the results of the pipeline.
	 *
	 * @param intermediate - normally you can only receive the results *after* the stepper completed the step of interested.
	 * 		 However, if you pass `true` to this parameter, you can also receive the results *before* the pipeline completed,
	 * 		 although the typing system then can not guarantee which of the steps have already happened.
	 */
	public getResults(intermediate = false): PipelineOutput<P> | Partial<PipelineOutput<P>> {
		guard(intermediate || this.stepCounter >= this.pipeline.order.length, 'Without the intermediate flag, the pipeline must be completed before providing access to the results.')
		return this.output
	}

	/**
	 * Returns true only if 1) there are more steps to-do for the current stage and 2) we have not yet reached the end of the pipeline.
	 */
	public hasNextStep(): boolean {
		return this.stepCounter < this.pipeline.order.length && (
			this.currentExecutionStage !== StepHasToBeExecuted.OncePerFile ||
				this.stepCounter < (this.pipeline.firstStepPerRequest ?? this.pipeline.order.length)
		)
	}

	/**
	 * Execute the next step (guarded with {@link hasNextStep}) and return the name of the step that was executed, so you can guard if the step differs from what you are interested in.
	 * Furthermore, it returns the step's result.
	 *
	 * The `step` parameter is a safeguard if you want to retrieve the result.
	 * If given, it causes the execution to fail if the next step is not the one you expect.
	 * *Without step, please refrain from accessing the result.*
	 */
	public async nextStep<PassedName extends StepName>(expectedStepName?: PassedName): Promise<{
		name:   typeof expectedStepName extends undefined ? StepName : PassedName
		result: typeof expectedStepName extends undefined ? unknown : StepResult<Exclude<PassedName, undefined>>
	}> {
		guard(this.hasNextStep(), 'No more steps to do')

		const guardStep = this.getGuardStep(expectedStepName)

		const { step, result } = await this.doNextStep(guardStep)

		this.results[step] = result
		this.stepCounter += 1
		if(this.stepOfInterest === step) {
			this.reachedWanted = true
		}

		return { name: step as PassedName, result: result as StepResult<PassedName> }
	}

	private getGuardStep(expectedStepName: StepName | undefined) {
		return expectedStepName === undefined ?
			<K extends StepName>(name: K): K => name
			:
			<K extends StepName>(name: K): K => {
				guard(expectedStepName === name, `Expected step ${expectedStepName} but got ${name}`)
				return name
			}
	}

	private async doNextStep(guardStep: <K extends StepName>(name: K) => K) {
		let step: StepName
		let result: unknown

		switch(this.stepCounter) {
			case 0:
				step = guardStep('parse')
				result = await executeSingleSubStep(step, this.request, this.shell)
				break
			case 1:
				step = guardStep('normalize')
				result = await executeSingleSubStep(step, this.results.parse as string, await this.shell.tokenMap(), this.hooks, this.getId)
				break
			case 2:
				step = guardStep('dataflow')
				result = executeSingleSubStep(step, this.results.normalize as NormalizedAst)
				break
			case 3:
				guard(this.criterion !== undefined, 'Cannot decode criteria without a criterion')
				step = guardStep('slice')
				result = executeSingleSubStep(step, (this.results.dataflow as DataflowInformation).graph, this.results.normalize as NormalizedAst, this.criterion)
				break
			case 4:
				step = guardStep('reconstruct')
				result = executeSingleSubStep(step, this.results.normalize as NormalizedAst<NoInfo>, (this.results.slice as SliceResult).result)
				break
			default:
				throw new Error(`Unknown step ${this.stepCounter}, reaching this should not happen!`)
		}
		return { step, result }
	}

	/**
	 * This only makes sense if you have already sliced a file (e.g., by running up to the `slice` step) and want to do so again while caching the results.
	 * Or if for whatever reason you did not pass a criterion with the constructor.
	 *
	 * @param newCriterion - the new slicing criterion to use for the next slice
	 */
	public updateCriterion(newCriterion: SlicingCriteria): void {
		guard(this.stepCounter >= PipelineExecutor.maximumNumberOfStepsPerFile , 'Cannot reset slice prior to once-per-slice stage')
		this.criterion = newCriterion
		this.stepCounter = PipelineExecutor.maximumNumberOfStepsPerFile
		this.results.slice = undefined
		this.results.reconstruct = undefined
		if(this.stepOfInterest === 'slice' || this.stepOfInterest === 'reconstruct') {
			this.reachedWanted = false
		}
	}

	public async allRemainingSteps(canSwitchStage: false): Promise<Partial<StepResults<InterestedIn extends keyof typeof STEPS_PER_SLICE | undefined ? typeof LAST_PER_FILE_STEP : InterestedIn>>>
	public async allRemainingSteps(canSwitchStage?: true): Promise<StepResults<InterestedIn>>
	/**
	 * Execute all remaining steps and automatically call {@link switchToSliceStage} if necessary.
	 * @param canSwitchStage - if true, automatically switch to the slice stage if necessary
	 *       (i.e., this is what you want if you have never executed {@link nextStep} and you want to execute *all* steps).
	 *       However, passing false allows you to only execute the steps of the 'once-per-file' stage (i.e., the steps that can be cached).
	 *
	 * @note There is a small type difference if you pass 'false' and already have manually switched to the 'once-per-slice' stage.
	 *       Because now, the results of these steps are no longer part of the result type (although they are still included).
	 *       In such a case, you may be better off with simply passing 'true' as the function will detect that the stage is already switched.
	 *       We could solve this type problem by separating the SteppingSlicer class into two for each stage, but this would break the improved readability and unified handling
	 *       of the slicer that I wanted to achieve with this class.
	 */
	public async allRemainingSteps(canSwitchStage = true): Promise<StepResults<InterestedIn | typeof LAST_PER_FILE_STEP> | Partial<StepResults<InterestedIn | typeof LAST_PER_FILE_STEP>>> {
		while(this.hasNextStep()) {
			await this.nextStep()
		}
		if(canSwitchStage && !this.reachedWanted && this.stage === 'once-per-file') {
			this.switchToSliceStage()
			while(this.hasNextStep()) {
				await this.nextStep()
			}
		}
		return this.reachedWanted ? this.getResults() : this.getResults(true)
	}
}
