import { IStep, NameOfStep } from '../step'
import { InvalidPipelineError } from './invalid-pipeline-error'
import { Pipeline } from './pipeline'


/**
 * Given a set of {@link IStep|steps} with their dependencies, this function verifies that
 * 0) the pipeline is not empty
 * 1) all names of steps are unique for the given pipeline
 * 2) all {@link IStepOrder#dependencies|dependencies} of steps are valid (i.e., refer to existing steps)
 * 3) there are no cycles in the dependency graph
 * 4) the target of a {@link IStepOrder#decorates|decoration} exists
 * 5) if a decoration applies, all of its dependencies are already in the pipeline
 * If successful, it returns the topologically sorted list of steps in order of desired execution.
 * @throws InvalidPipelineError if any of the above conditions are not met
 */
export function verifyAndBuildPipeline(steps: IStep[]): Pipeline {
	if(steps.length === 0) {
		throw new InvalidPipelineError('0) Pipeline is empty')
	}

	// we construct a map linking each name to its respective step
	const stepMap = new Map<NameOfStep, IStep>()
	// we track all elements without dependencies, i.e., those that start the pipeline
	const inits: NameOfStep[] = []
	initializeSteps(steps, stepMap, inits)

	if(inits.length === 0) {
		throw new InvalidPipelineError('3) Pipeline has no initial steps (i.e., it contains no step without dependencies)')
	}

	const sorted = topologicalSort(inits, stepMap)
	if(sorted.length !== stepMap.size) {
		// check if any of the dependencies in the map are invalid
		checkForInvalidDependency(steps, stepMap)
		// otherwise, we assume a cycle
		throw new InvalidPipelineError('3) Pipeline contains at least one cycle')
	}

	return {
		steps: stepMap,
		order: sorted
	}
}


function topologicalSort(inits: NameOfStep[], stepMap: Map<NameOfStep, IStep>) {
	const sorted: NameOfStep[] = []
	const visited = new Set<NameOfStep>()

	while(inits.length > 0) {
		const init = inits.pop() as NameOfStep
		sorted.push(init)
		visited.add(init)

		// these decorators still have dependencies open; we have to check if they can be satisfied by the other steps to add
		const decoratorsOfLastOthers = new Set<NameOfStep>()
		// conventional topological-sort elements that now no longer have unsatisfied dependencies
		const otherInits = []

		for(const [elem, step] of stepMap.entries()) {
			if(visited.has(elem)) {
				continue
			}
			const allDepsSatisfied = step.dependencies.every(d => visited.has(d))
			if(step.decorates === init) {
				if(allDepsSatisfied) {
					inits.push(elem)
				} else {
					decoratorsOfLastOthers.add(elem)
				}
			} else if(allDepsSatisfied) {
				otherInits.push(elem)
			}
		}

		// for the other decorators we have to cycle until we find a solution, or know, that no solution exists
		topologicallyInsertDecoratorElements(decoratorsOfLastOthers, stepMap, visited, inits)

		inits.push(...otherInits)
	}
	return sorted
}

function topologicallyInsertDecoratorElements(decoratorsOfLastOthers: Set<NameOfStep>, stepMap: Map<NameOfStep, IStep>, visited: Set<NameOfStep>, inits: NameOfStep[]) {
	if(decoratorsOfLastOthers.size === 0) {
		return
	}

	let changed = true
	while(changed) {
		changed = false
		for(const elem of [...decoratorsOfLastOthers]) {
			const step = stepMap.get(elem) as IStep
			const allDepsSatisfied = step.dependencies.every(d => visited.has(d))
			if(allDepsSatisfied) {
				decoratorsOfLastOthers.delete(elem)
				inits.push(elem)
				changed = true
			}
		}
	}
	if(decoratorsOfLastOthers.size > 0) {
		throw new InvalidPipelineError(`5) Pipeline contains at least one decoration cycle: ${JSON.stringify(decoratorsOfLastOthers)}`)
	}
}

function checkForInvalidDependency(steps: IStep[], stepMap: Map<NameOfStep, IStep>) {
	for(const step of steps) {
		for(const dep of step.dependencies) {
			if(!stepMap.has(dep)) {
				throw new InvalidPipelineError(`2) Step "${step.name}" depends on step "${dep}" which does not exist`)
			}
		}
		if(step.decorates && !stepMap.has(step.decorates)) {
			throw new InvalidPipelineError(`4) Step "${step.name}" decorates step "${step.decorates}" which does not exist`)
		}
	}
}

function initializeSteps(steps: IStep[], stepMap: Map<NameOfStep, IStep>, inits: NameOfStep[]) {
	for(const step of steps) {
		const name = step.name
		// if the name is already in the map we have a duplicate
		if(stepMap.has(name)) {
			throw new InvalidPipelineError(`1) Step name "${name}" is not unique in the pipeline`)
		}
		stepMap.set(name, step)
		if(step.dependencies.length === 0) {
			inits.push(name)
		}
	}
}

