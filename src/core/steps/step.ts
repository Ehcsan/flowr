/**
 * Defines the {@link IStep} interface which specifies all data available for a single step.
 *
 * @module
 */

import { MergeableRecord } from '../../util/objects'
import { InternalStepPrinter, IStepPrinter, StepOutputFormat } from '../print/print'

/**
 * This represents the format of a step processor which retrieves two things:
 *
 * 1) the input configuration as passed to the {@link PipelineExecutor}.
 * 2) the output produced by the previous steps.
 *
 * Please be aware, that if the respective information is available is not ensured by the type system but rather
 * ensured at runtime by your dependencies. If you want to make sure, that the information is present,
 * list all steps that you require as your {@link IStepOrder#dependencies|dependencies}, even if they would be
 * already covered transitively.
 *
 * TODO: we could use prototypic cores for each step name
 */
export type StepProcessingFunction =
	(results: Record<string, unknown>, input: Record<string, unknown>) => unknown
/**
 * This represents the required execution frequency of a step.
 */
export const enum StepHasToBeExecuted {
	/** This step has to be executed once per file */
	OncePerFile,
	/** This step has to be executed once per request (e.g., slice for a given variable) */
	OncePerRequest
}

// TODO: rename to StepName
export type NameOfStep = string & { __brand?: 'StepName' }

/**
 * Contains the data to specify the order of {@link IStep|steps} in a pipeline.
 */
export interface IStepOrder<
	Name extends NameOfStep = NameOfStep,
> {
	/**
	 * Name of the respective step, it does not have to be unique in general but only unique per-pipeline.
	 * In other words, you can have multiple steps with a name like `parse` as long as you use only one of them in a given pipeline.
	 * This is, because these names are required in the {@link IStep#dependencies} field to refer to other steps this one relies on.
	 */
	readonly name:         Name
	/**
	 * Give the names of other steps this one requires to be completed as a prerequisite (e.g., to gain access to their input).
	 * Does not have to be transitive, this will be checked by the scheduler of the pipeline.
	 */
	readonly dependencies: readonly NameOfStep[]
	/* does this step has to be repeated for each new request or can it be performed only once in the initialization */
	readonly executed:     StepHasToBeExecuted
	/**
	 * This is similar to {@link dependencies}, but is used to say that a given step _decorates_ another one.
	 * This imbues two requirements:
	 * The step must take the output of the decorated step as input, and produce the same output as the decorated step.
	 *
	 * If so, it is ensured that _this_ step is executed _after_ the step it decorates, but before any step that depends on it.
	 */
	readonly decorates?:   NameOfStep
}

/**
 * Defines what is to be known of a single step in a pipeline.
 * It wraps around a single {@link IStep#processor|processor} function, providing additional information.
 * Steps will be executed synchronously, in-sequence, based on their {@link IStep#dependencies|dependencies}.
 */
export interface IStep<
	Name extends NameOfStep = NameOfStep,
	// eslint-disable-next-line -- by default, we assume nothing about the function shape
	Fn extends StepProcessingFunction = (...args: any[]) => any,
> extends MergeableRecord, IStepOrder<Name> {
	/** Human-readable description of this step */
	readonly description: string
	/** The main processor that essentially performs the logic of this step */
	readonly processor:   (...input: Parameters<Fn>) => ReturnType<Fn>
	/**
	 * How to visualize the results of the respective step to the user?
	 */
	readonly printer: {
		[K in StepOutputFormat]?: IStepPrinter<Fn, K, never[]>
	} & {
		// we always want to have the internal printer
		[StepOutputFormat.Internal]: InternalStepPrinter<Fn>
	}
	/**
	 * Input configuration required to perform the respective steps.
	 * Required inputs of dependencies do not have to, but can be repeated.
	 * <p>
	 * Use the pattern `undefined as unknown as T` to indicate that the value is required but not provided.
	 */
	readonly requiredInput?: Record<string, unknown>
}



