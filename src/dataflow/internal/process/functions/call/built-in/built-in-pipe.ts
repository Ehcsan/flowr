import type {
	NodeId,
	ParentInformation,
	RFunctionArgument,
	RSymbol
} from '../../../../../../r-bridge'
import { RType } from '../../../../../../r-bridge'
import type { DataflowProcessorInformation } from '../../../../../processor'
import type { DataflowInformation } from '../../../../../info'
import { dataflowLogger, EdgeType, graphToMermaidUrl } from '../../../../../index'
import { processKnownFunctionCall } from '../known-call-handling'
import { guard } from '../../../../../../util/assert'
import { unpackArgument } from '../argument/unpack-argument'
import { UnnamedArgumentPrefix } from '../../process-argument'


export function processPipe<OtherInfo>(
	name: RSymbol<OtherInfo & ParentInformation>,
	args: readonly RFunctionArgument<OtherInfo & ParentInformation>[],
	rootId: NodeId,
	data: DataflowProcessorInformation<OtherInfo & ParentInformation>
): DataflowInformation {

	const { information } = processKnownFunctionCall(name, args, rootId, data)
	if(args.length !== 2) {
		dataflowLogger.warn(`Pipe ${name.content} has something else than 2 arguments, skipping`)
		return information
	}

	const [lhs, rhs] = args.map(unpackArgument)

	guard(lhs !== undefined && rhs !== undefined, () => `lhs and rhs must be present, but ${JSON.stringify(lhs)} and ${JSON.stringify(rhs)} were found instead.`)

	if(rhs.type !== RType.FunctionCall) {
		dataflowLogger.warn(`Expected rhs of pipe to be a function call, but got ${rhs.type} instead.`)
	} else {
		const maybeFunctionCallNode = information.graph.get(rhs.info.id, true)
		guard(maybeFunctionCallNode !== undefined,
			() => `Expected function call node with id ${rhs.info.id} to be present in graph, but got undefined instead (graph: ${graphToMermaidUrl(information.graph, data.completeAst.idMap)}).`)


		const functionCallNode = maybeFunctionCallNode[0]
		guard(functionCallNode.tag === 'function-call', () => `Expected function call node with id ${rhs.info.id} to be a function call node, but got ${functionCallNode.tag} instead.`)

		// make the lhs an argument node:
		const argId =  lhs.info.id

		dataflowLogger.trace(`Linking pipe arg ${argId} as first argument of ${rhs.info.id}`)
		functionCallNode.args.unshift({
			nodeId: argId,
			name:   `${UnnamedArgumentPrefix}${argId}`,
			used:   'always'
		})
		information.graph.addEdge(functionCallNode.id, argId, { type: EdgeType.Argument, attribute: 'always' })
	}

	return information
}
