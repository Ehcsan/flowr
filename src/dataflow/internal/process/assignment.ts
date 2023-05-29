import { ParentInformation, RAssignmentOp, RNode, Type } from '../../../r-bridge'
import { DataflowInformation } from '../info'
import { DataflowProcessorDown } from '../../processor'
import { GlobalScope, LocalScope } from '../../graph'
import { guard } from '../../../util/assert'
import {
  define,
  IdentifierDefinition,
  IdentifierReference,
  initializeCleanEnvironments,
  overwriteEnvironments
} from '../../environments'
import { setDefinitionOfNode } from '../linker'
import { log } from '../../../util/log'

export function processAssignment<OtherInfo>(op: RAssignmentOp<OtherInfo & ParentInformation>,
                                             lhs: DataflowInformation<OtherInfo>, rhs: DataflowInformation<OtherInfo>,
                                             down: DataflowProcessorDown<OtherInfo>): DataflowInformation<OtherInfo> {
  const { readTargets, writeTargets, environments, swap } = processReadAndWriteForAssignmentBasedOnOp(op, lhs, rhs, down)
  const nextGraph = lhs.graph.mergeWith(rhs.graph)

  // deal with special cases based on the source node and the determined read targets
  const impactReadTargets = determineImpactOfSource(swap ? op.lhs : op.rhs, readTargets)

  for (const write of writeTargets) {
    setDefinitionOfNode(nextGraph, write)
    for(const read of impactReadTargets) {
      nextGraph.addEdge(write, read, 'defined-by')
    }
  }
  return {
    activeNodes: [],
    in:          readTargets,
    out:         writeTargets,
    graph:       nextGraph,
    environments,
    ast:         down.ast,
    scope:       down.scope
  }
}

function identifySourceAndTarget<OtherInfo>(op: RNode<OtherInfo & ParentInformation>,
                                            lhs: DataflowInformation<OtherInfo>,
                                            rhs: DataflowInformation<OtherInfo>) : {
    source: DataflowInformation<OtherInfo>
    target: DataflowInformation<OtherInfo>
    global: boolean
    /** true if `->` or `->>` */
    swap:   boolean
} {
  let source: DataflowInformation<OtherInfo>
  let target: DataflowInformation<OtherInfo>
  let global = false
  let swap = false

  switch (op.lexeme) {
    case '<-':
      [target, source] = [lhs, rhs]
      break
    case '<<-':
      [target, source, global] = [lhs, rhs, true]
      break
    case '=': // TODO: special within function calls
      [target, source] = [lhs, rhs]
      break
    case '->':
      [target, source, swap] = [rhs, lhs, true]
      break
    case '->>':
      [target, source, global, swap] = [rhs, lhs, true, true]
      break
    default:
      throw new Error(`Unknown assignment operator ${JSON.stringify(op)}`)
  }
  return { source, target, global, swap }
}

function produceWrittenNodes<OtherInfo>(op: RAssignmentOp<OtherInfo & ParentInformation>, target: DataflowInformation<OtherInfo>, global: boolean, down: DataflowProcessorDown<OtherInfo>): IdentifierDefinition[] {
  const writeNodes: IdentifierDefinition[] = []
  for(const active of target.activeNodes) {
    writeNodes.push({
      ...active,
      scope:     global ? GlobalScope : down.scope,
      kind:      /* TODO: deal with functions */ 'variable',
      definedAt: op.info.id
    })
  }
  return writeNodes
}

function processReadAndWriteForAssignmentBasedOnOp<OtherInfo>(op: RAssignmentOp<OtherInfo & ParentInformation>,
                                                              lhs: DataflowInformation<OtherInfo>, rhs: DataflowInformation<OtherInfo>,
                                                              down: DataflowProcessorDown<OtherInfo>) {
  // what is written/read additionally is based on lhs/rhs - assignments read written variables as well
  const read = [...lhs.in, ...rhs.in]
  const { source, target, global, swap } = identifySourceAndTarget(op, lhs, rhs)
  const writeNodes = produceWrittenNodes(op, target, global, down)

  if(writeNodes.length !== 1) {
    log.warn(`Unexpected write number in assignment ${JSON.stringify(op)}: ${JSON.stringify(writeNodes)}`)
  }


  const readFromSourceWritten: IdentifierReference[] = [...source.out].map(id => {
    guard(id.scope === LocalScope, 'currently, nested write re-assignments are only supported for local')
    return id
  })
  const environments = overwriteEnvironments(source.environments, target.environments) ?? initializeCleanEnvironments()

  // install assigned variables in environment
  for(const write of writeNodes) {
    define(write, global ? GlobalScope: LocalScope, environments)
  }

  return {
    readTargets:  [...source.activeNodes, ...read, ...readFromSourceWritten],
    writeTargets: [...writeNodes, ...target.out],
    environments: environments,
    swap
  }
}

/**
 * Some R-constructs like loops are known to return values completely independent of their input (loops return an invisible `NULL`).
 * This returns only those of `readTargets` that actually impact the target.
 */
function determineImpactOfSource<OtherInfo>(source: RNode<OtherInfo & ParentInformation>, readTargets: IdentifierReference[]): IdentifierReference[] {

  /* loops return an invisible null */
  if(source.type === Type.For || source.type === Type.While || source.type === Type.Repeat) {
    return []
  }

  // by default, we assume, that all have an impact
  return readTargets
}