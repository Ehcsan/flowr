/**
 * An edge consist of:
 * - the target node (i.e., the variable or processing node),
 * - a type (if it is read or used in the context), and
 * - an attribute (if this edge exists for every program execution or if it is only one possible execution path).
 */
export interface DataflowGraphEdge {
	// currently multiple edges are represented by multiple types
	types: Set<EdgeType>
}


/**
 * Represents the relationship between the source and the target vertex in the dataflow graph.
 */
export const enum EdgeType {
	/** The edge determines that source reads target */
	Reads = 'reads',
	/** The edge determines that source is defined by target */
	DefinedBy = 'defined-by',
	/** The edge determines that both nodes reference the same variable in a lexical/scoping sense, source and target are interchangeable (reads for at construction unbound variables) */
	SameReadRead = 'same-read-read',
	/** Similar to `same-read-read` but for def-def constructs without a read in-between */
	SameDefDef = 'same-def-def',
	/** The edge determines that the source calls the target */
	Calls = 'calls',
	/** The source returns target on call */
	Returns = 'returns',
	/** The edge determines that source (probably argument) defines the target (probably parameter), currently automatically created by `addEdge` */
	DefinesOnCall = 'defines-on-call',
	/** Inverse of `defines-on-call` currently only needed to get better results when slicing complex function calls */
	DefinedByOnCall = 'defined-by-on-call',
	/** Formal used as argument to a function call */
	Argument = 'argument',
	/** The edge determines that the source is a side effect that happens when the target is called */
	SideEffectOnCall = 'side-effect-on-call',
	/** The source and edge relate to each other bidirectionally */
	Relates = 'relates',
	/** The Edge determines that the reference is affected by a non-standard evaluation (e.g., a for-loop body or a quotation) */
	NonStandardEvaluation = 'non-standard-evaluation'
}

const traverseEdge: Record<EdgeType, boolean> = {
	[EdgeType.Reads]:                 true,
	[EdgeType.DefinedBy]:             true,
	[EdgeType.Argument]:              true,
	[EdgeType.Calls]:                 true,
	[EdgeType.Relates]:               true,
	[EdgeType.DefinesOnCall]:         true,
	[EdgeType.DefinedByOnCall]:       false,
	[EdgeType.SideEffectOnCall]:      false,
	[EdgeType.NonStandardEvaluation]: false,
	[EdgeType.SameReadRead]:          false,
	[EdgeType.SameDefDef]:            false,
	[EdgeType.Returns]:               false
} as const

export function shouldTraverseEdge(types: ReadonlySet<EdgeType>): boolean {
	for(const type of types) {
		if(traverseEdge[type]) {
			return true
		}
	}
	return false
}

