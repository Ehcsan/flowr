import { NamedXmlBasedJson, XmlParseError } from "../../input-format"
import { retrieveMetaStructure } from "../meta"
import { parseLog } from "../../parser"
import { tryParseOneElementBasedOnType } from "../structure/single-element"
import { ParserData } from "../../data"
import { Type } from "../../../../model/type"

import { RWhileLoop } from "../../../../model/nodes/RWhileLoop"
import { executeHook, executeUnknownHook } from '../../hooks'

export function tryParseWhileLoopStructure(
  data: ParserData,
  whileToken: NamedXmlBasedJson,
  leftParen: NamedXmlBasedJson,
  condition: NamedXmlBasedJson,
  rightParen: NamedXmlBasedJson,
  body: NamedXmlBasedJson
): RWhileLoop | undefined {
  if (whileToken.name !== Type.While) {
    parseLog.debug(
      "encountered non-while token for supposed while-loop structure"
    )
    return executeUnknownHook(data.hooks.loops.onWhileLoop.unknown, data, { whileToken, leftParen, condition, rightParen, body })
  } else if (leftParen.name !== Type.ParenLeft) {
    throw new XmlParseError(
      `expected left-parenthesis for while but found ${JSON.stringify(
        leftParen
      )}`
    )
  } else if (rightParen.name !== Type.ParenRight) {
    throw new XmlParseError(
      `expected right-parenthesis for while but found ${JSON.stringify(
        rightParen
      )}`
    )
  }

  parseLog.debug(
    `trying to parse while-loop with ${JSON.stringify([
      whileToken,
      condition,
      body,
    ])}`
  );
  ({ whileToken, leftParen, condition, rightParen, body } = executeHook(data.hooks.loops.onWhileLoop.before, data, { whileToken, leftParen, condition, rightParen, body }))


  const parsedCondition = tryParseOneElementBasedOnType(data, condition)
  const parseBody = tryParseOneElementBasedOnType(data, body)

  if (parsedCondition === undefined || parseBody === undefined) {
    throw new XmlParseError(
      `unexpected under-sided while-loop, received ${JSON.stringify([
        parsedCondition,
        parseBody,
      ])} for ${JSON.stringify([whileToken, condition, body])}`
    )
  }

  const { location, content } = retrieveMetaStructure(
    data.config,
    whileToken.content
  )

  // TODO: assert exists as known operator
  const result: RWhileLoop = {
    type:      Type.While,
    condition: parsedCondition,
    body:      parseBody,
    lexeme:    content,
    location,
  }
  return executeHook(data.hooks.loops.onWhileLoop.after, data, result)
}