import type { XmlBasedJson } from '../../../common/input-format'
import { retrieveMetaStructure } from '../../../common/meta'
import type {
	RFunctionCall
} from '../../../../../model'
import {
	EmptyArgument,
	RType
} from '../../../../../model'
import type { NormalizeConfiguration } from '../../data'
import { normalizeSingleToken } from '../single-element'

// TODO: shorthand combinations like `[<-` or `$<-` have to be handled with df as they are only available if `<-` has default def.

/**
 * Parsing binary operations includes the pipe, even though the produced PIPE construct is not a binary operation,
 * to ensure it is handled separately from the others (especially in the combination of a pipe bind)
 */
export function normalizeBinary(
	config: NormalizeConfiguration,
	[lhs, operator, rhs]: XmlBasedJson[]
): RFunctionCall {
	const { location, content } = retrieveMetaStructure(operator)
	return {
		type:         RType.FunctionCall,
		lexeme:       config.currentLexeme ?? content,
		location,
		flavor:       'named',
		functionName: {
			type:      RType.Symbol,
			namespace: undefined,
			location,
			content,
			lexeme:    content,
			info:      {}
		},
		arguments: [normalizeSingleToken(config, lhs) ?? EmptyArgument, normalizeSingleToken(config, rhs) ?? EmptyArgument],
		info:      {}
	}
}
