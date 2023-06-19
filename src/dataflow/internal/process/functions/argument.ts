import { DataflowInformation } from '../../info'
import { DataflowProcessorDown } from '../../../processor'
import { define, IdentifierDefinition } from '../../../environments'
import { LocalScope } from '../../../graph'
import { ParentInformation, RArgument } from '../../../../r-bridge'
import { setDefinitionOfNode } from '../../linker'
import { log } from '../../../../util/log'

export function processFunctionArgument<OtherInfo>(argument: RArgument<OtherInfo & ParentInformation>, name: DataflowInformation<OtherInfo>,  defaultValue: DataflowInformation<OtherInfo> | undefined, down: DataflowProcessorDown<OtherInfo>): DataflowInformation<OtherInfo> {
  const graph = defaultValue !== undefined ? name.graph.mergeWith(defaultValue.graph) : name.graph

  const writtenNodes: IdentifierDefinition[] = name.activeNodes.map(n => ({
    ...n,
    kind:      'argument',
    used:      'always',
    definedAt: argument.info.id,
    scope:     LocalScope
  }))
  for(const writtenNode of writtenNodes) {
    log.trace(`argument ${writtenNode.name} (${writtenNode.nodeId}) is defined at id ${writtenNode.definedAt} with ${defaultValue === undefined ? 'no default value' : ' no default value'}`)
    setDefinitionOfNode(graph, writtenNode)
    // we do not define here but only within the function as otherwise the epxression list processing would resolve argument definitions that are not yet within the graph
    // define(writtenNode, LocalScope, down.environments)
  }

  // TODO: defined-by for default values

  return {
    activeNodes:  [],
    in:           defaultValue === undefined ? [] : [...defaultValue.in, ...defaultValue.activeNodes, ...name.in],
    out:          [...(defaultValue?.out ?? []), ...name.out, ...name.activeNodes],
    graph:        graph,
    environments: name.environments, // TODO: merge with arguments
    ast:          down.ast,
    scope:        down.activeScope
  }
}
