import { assertAst, withShell } from '../helper/shell'
import { exprList } from '../helper/ast-builder'
import { log, LogLevel } from '../../src/util/log'

describe('R-Bridge', () => {
  describe('R language utilities', () => {
    require('./lang/values')
  })

  require('./lang/ast/model')
  require('./sessions')
  require('./retriever')

  // TODO: allow to specify where to install packages to so we can minimize installation to one temp directory
  describe('Retrieve AST from R', () => {
    require('./lang/ast/parse-values')
    require('./lang/ast/parse-operations')
    require('./lang/ast/parse-assignments')
    require('./lang/ast/parse-expression-lists')
    require('./lang/ast/parse-constructs')
    require('./lang/ast/parse-calls')
    require('./lang/ast/parse-snippets')
  })
  describe('Parser Hooks', () => {
    require('./lang/ast/parse-hooks')
  })
})