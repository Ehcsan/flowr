import { getKeysGuarded, NamedXmlBasedJson, XmlBasedJson } from '../../input-format'
import { getWithTokenType, retrieveMetaStructure } from '../meta'
import { parseLog } from '../../parser'
import { ParserData } from '../../data'
import { parseBasedOnType, splitComments } from '../structure'
import { tryToParseFunctionCall, tryToParseFunctionDefinition } from '../functions'
import { Type, RNode } from '../../../../model'
import { executeHook } from '../../hooks'
import { tryParseAccess } from '../access'
import { parseComment } from '../other'

/**
 * Returns an ExprList if there are multiple children, otherwise returns the single child directly with no expr wrapper
 *
 * @param data - The data used by the parser (see {@link ParserData})
 * @param obj - The json object to extract the meta-information from
 */
export function parseExpression(data: ParserData, obj: XmlBasedJson): RNode {
  parseLog.debug(`Parsing expr`)
  obj = executeHook(data.hooks.expression.onExpression.before, data, obj)

  const {
    unwrappedObj,
    content,
    location
  } = retrieveMetaStructure(data.config, obj)

  const childrenSource = getKeysGuarded<XmlBasedJson[]>(unwrappedObj, data.config.childrenName)
  const typed: NamedXmlBasedJson[] = getWithTokenType(data.config.tokenMap, childrenSource)

  const { others, comments } = splitComments(typed)

  const childData: ParserData = { ...data, currentRange: location, currentLexeme: content }

  const maybeFunctionCall = tryToParseFunctionCall(childData, others)
  if (maybeFunctionCall !== undefined) {
    const parsedComments = [...maybeFunctionCall.info.additionalTokens ?? [], ...comments.map(x => parseComment(data, x.content))]
    maybeFunctionCall.info.additionalTokens = parsedComments
    return maybeFunctionCall
  }

  const maybeAccess = tryParseAccess(childData, others)
  if (maybeAccess !== undefined) {
    const parsedComments = [...maybeAccess.info.additionalTokens ?? [], ...comments.map(x => parseComment(data, x.content))]
    maybeAccess.info.additionalTokens = parsedComments
    return maybeAccess
  }

  const maybeFunctionDefinition = tryToParseFunctionDefinition(childData, others)
  if (maybeFunctionDefinition !== undefined) {
    const parsedComments = [...maybeFunctionDefinition.info.additionalTokens ?? [], ...comments.map(x => parseComment(data, x.content))]
    maybeFunctionDefinition.info.additionalTokens = parsedComments
    return maybeFunctionDefinition
  }


  const children = parseBasedOnType(childData, childrenSource)

  let result: RNode
  if (children.length === 1) {
    result = children[0]
  } else {
    result = {
      type:   Type.ExpressionList,
      location,
      children,
      lexeme: content,
      info:   {
        // TODO: include children etc.
        fullRange:        childData.currentRange,
        additionalTokens: [],
        fullLexeme:       childData.currentLexeme
      }
    }
  }
  return executeHook(data.hooks.expression.onExpression.after, data, result)
}
