import type { NodeId, ParentInformation, RFunctionArgument, RSymbol } from '../../../../../../r-bridge'
import { removeRQuotes , RType } from '../../../../../../r-bridge'
import type { DataflowProcessorInformation } from '../../../../../processor'
import type { DataflowInformation } from '../../../../../info'
import { dataflowLogger } from '../../../../../index'
import { processKnownFunctionCall } from '../known-call-handling'
import { unpackArgument } from '../argument/unpack-argument'
import { wrapArgumentsUnnamed } from '../argument/make-argument'

export function processGet<OtherInfo>(
	name: RSymbol<OtherInfo & ParentInformation>,
	args: readonly RFunctionArgument<OtherInfo & ParentInformation>[],
	rootId: NodeId,
	data: DataflowProcessorInformation<OtherInfo & ParentInformation>,
): DataflowInformation {
	if(args.length !== 1) {
		dataflowLogger.warn(`symbol access with ${name.content} has not 1 argument, skipping`)
		return processKnownFunctionCall({ name, args, rootId, data }).information
	}
	const retrieve = unpackArgument(args[0])
	if(retrieve === undefined || retrieve.type !== RType.String) {
		dataflowLogger.warn(`symbol access with ${name.content} has not 1 argument, skipping`)
		return processKnownFunctionCall({ name, args, rootId, data }).information
	}

	const treatTargetAsSymbol: RSymbol<OtherInfo & ParentInformation> = {
		type:      RType.Symbol,
		info:      retrieve.info,
		content:   removeRQuotes(retrieve.lexeme),
		lexeme:    retrieve.lexeme,
		location:  retrieve.location,
		namespace: undefined
	}

	const { information } = processKnownFunctionCall({
		name,
		args: wrapArgumentsUnnamed([treatTargetAsSymbol], data.completeAst.idMap),
		rootId,
		data
	})

	return information
}
