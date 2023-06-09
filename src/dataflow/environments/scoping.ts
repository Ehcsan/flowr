import { LocalScope } from '../graph'
import { Environment, IEnvironment, REnvironmentInformation } from './environment'
import { guard } from '../../util/assert'

/** Add a new local environment scope to the stack */
export function pushLocalEnvironment(base: REnvironmentInformation): REnvironmentInformation {
  const local = new Environment(LocalScope)
  local.parent = base.current

  return {
    current: local,
    level:   base.level + 1
  }
}

export function popLocalEnvironment(base: REnvironmentInformation): REnvironmentInformation {
  guard(base.level > 0, 'cannot remove the global/root environment')
  const parent = base.current.parent
  guard(parent !== undefined, 'level is wrong, parent is undefined even though level suggested depth > 0 (starts with 0)')
  return {
    current: parent,
    level:   base.level - 1
  }
}
